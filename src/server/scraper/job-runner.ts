import type { Browser, Page } from 'puppeteer-core';
import type { PlaceRecord, ScrapeJob } from '../../shared/types.js';
import { extractPlaceDetails } from './extractor.ts';
import { extractSourcePlaceId, parseSearchLocationFallback } from './normalizer.ts';

const STEP_BUDGET_MS = 40_000;
const STEP_MAX_PLACES = 5;
const DETAIL_NAVIGATION_TIMEOUT_MS = 15_000;
const DETAIL_EXTRACTION_TIMEOUT_MS = 22_000;

type ScraperState = {
  jobs: ScrapeJob[];
  places: PlaceRecord[];
  logs: any[];
  settings?: { browserWsEndpoint?: string };
};

export interface ScrapeRuntimeStore {
  getState(): ScraperState;
  persistScrapeProgress(job: ScrapeJob, newPlace?: PlaceRecord): Promise<boolean>;
  isJobCancellationRequested(jobId: string, userId: string): Promise<boolean>;
  claimScrapeWorkerLease(jobId: string, userId: string): Promise<boolean>;
  findJobForWorker(jobId: string, userId: string): Promise<ScrapeJob | null>;
  releaseScrapeWorkerLease(jobId: string): Promise<void>;
  isExistingPlace(place: Partial<PlaceRecord>): Promise<boolean>;
  findLastProcessedCandidateUrl(sessionId: string): Promise<string>;
}

type BrowserConnector = (legacyEndpoint?: string) => Promise<Browser>;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeMapsPlaceUrl(value: string | null | undefined): string {
  if (!value) return '';
  try {
    const parsed = new URL(value);
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString().replace(/\/+$/, '');
  } catch {
    return String(value).split(/[?#]/, 1)[0].replace(/\/+$/, '');
  }
}

function normalizeTextKey(value: string | null | undefined): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const INVALID_NAMES = new Set([
  'horario', 'horarios', 'avaliacao', 'avaliacoes', 'sobre', 'fotos', 'foto',
  'menu', 'reviews', 'review', 'about', 'overview', 'directions', 'rotas',
  'como chegar', 'mais informacoes', 'informacoes', 'website', 'site',
]);

function isValidBusinessName(value: string | null | undefined): boolean {
  const key = normalizeTextKey(value);
  return key.length >= 3 && key.length <= 180 && !INVALID_NAMES.has(key) && !/^\d+$/.test(key);
}

function addLog(
  state: ScraperState,
  job: ScrapeJob,
  level: 'info' | 'warn',
  event: string,
  message: string,
  metadata: unknown = {},
): void {
  state.logs.unshift({
    id: 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
    created_at: new Date().toISOString(),
    level,
    category: 'scraper',
    event,
    message,
    job_id: job.id,
    metadata: JSON.stringify(metadata),
    user_id: job.user_id,
  });
}

function setHeartbeat(job: ScrapeJob): void {
  job.heartbeat_at = new Date().toISOString();
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(label + ' excedeu ' + timeoutMs + ' ms.')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function configurePage(page: Page): Promise<void> {
  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );
  await page.setViewport({ width: 1280, height: 900 });
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7' });
}

async function acceptMapsConsent(page: Page): Promise<void> {
  await page.evaluate(() => {
    const consent = Array.from(document.querySelectorAll('button')).find((button) =>
      /aceitar|concordo|accept all|i agree/i.test((button as HTMLElement).innerText || '')
    );
    if (consent) (consent as HTMLButtonElement).click();
  }).catch(() => {});
}

async function waitForMapsFeed(page: Page): Promise<void> {
  await page.waitForSelector('div[role="feed"]', { timeout: 12_000 });
  await page.waitForFunction(() => {
    const feed = document.querySelector('div[role="feed"]');
    return Boolean(feed && (feed as HTMLElement).clientHeight > 0);
  }, { timeout: 8_000 });
}

/**
 * Rebuilds the virtualized Maps feed and locates the last completed listing.
 * The URL is the checkpoint; scrollTop is never used as the resume identity.
 */
async function restoreLastProcessedPlace(page: Page, lastProcessedUrl: string): Promise<void> {
  const anchorKey = normalizeMapsPlaceUrl(lastProcessedUrl);
  if (!anchorKey) return;

  let lastState = { scrollTop: 0, maxScroll: 0 };
  let stagnantRounds = 0;

  for (let attempt = 0; attempt < 28; attempt += 1) {
    const state = await page.evaluate((expectedKey) => {
      const feed = document.querySelector('div[role="feed"]') as HTMLElement | null;
      if (!feed) return { found: false, scrollTop: 0, maxScroll: 0, moved: false };
      const normalize = (value: string) => {
        try {
          const parsed = new URL(value);
          parsed.search = '';
          parsed.hash = '';
          return parsed.toString().replace(/\/+$/, '');
        } catch {
          return value.split(/[?#]/, 1)[0].replace(/\/+$/, '');
        }
      };
      const anchor = Array.from(feed.querySelectorAll('a[href*="/maps/place/"]'))
        .find((item) => normalize((item as HTMLAnchorElement).href) === expectedKey) as HTMLElement | undefined;
      if (anchor) {
        anchor.scrollIntoView({ block: 'end', behavior: 'instant' as ScrollBehavior });
        return {
          found: true,
          scrollTop: feed.scrollTop,
          maxScroll: Math.max(0, feed.scrollHeight - feed.clientHeight),
          moved: false,
        };
      }
      const before = feed.scrollTop;
      feed.scrollTop = Math.min(feed.scrollHeight, before + Math.max(300, Math.floor(feed.clientHeight * 0.75)));
      return {
        found: false,
        scrollTop: feed.scrollTop,
        maxScroll: Math.max(0, feed.scrollHeight - feed.clientHeight),
        moved: feed.scrollTop > before,
      };
    }, anchorKey);

    lastState = { scrollTop: state.scrollTop, maxScroll: state.maxScroll };
    if (state.found) {
      await delay(350);
      return;
    }
    stagnantRounds = state.moved ? 0 : stagnantRounds + 1;
    if (stagnantRounds >= 5) break;
    await delay(500);
  }

  throw new Error(
    'Não foi possível reencontrar a última ficha processada no Google Maps. ' +
    'Âncora: ' + anchorKey + '; posição atual: ' + lastState.scrollTop +
    'px; limite atual: ' + lastState.maxScroll + 'px. O checkpoint foi preservado.'
  );
}

type NextPlaceResult = { url: string; exhausted: false } | { url: ''; exhausted: true } | { url: ''; exhausted: false };

async function findNextPlaceUrl(page: Page, lastProcessedUrl: string): Promise<NextPlaceResult> {
  const anchorKey = normalizeMapsPlaceUrl(lastProcessedUrl);
  let stagnantRounds = 0;
  let anchorWasLocated = !anchorKey;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await page.evaluate((expectedKey) => {
      const feed = document.querySelector('div[role="feed"]') as HTMLElement | null;
      if (!feed) return { url: '', anchorFound: !expectedKey, atEnd: false, scrollTop: 0, maxScroll: 0, moved: false };
      const normalize = (value: string) => {
        try {
          const parsed = new URL(value);
          parsed.search = '';
          parsed.hash = '';
          return parsed.toString().replace(/\/+$/, '');
        } catch {
          return value.split(/[?#]/, 1)[0].replace(/\/+$/, '');
        }
      };
      const urls = Array.from(feed.querySelectorAll('a[href*="/maps/place/"]'))
        .map((anchor) => (anchor as HTMLAnchorElement).href)
        .filter(Boolean);
      let nextUrl = '';
      let anchorFound = !expectedKey;
      if (!expectedKey) {
        nextUrl = urls[0] || '';
      } else {
        const index = urls.findIndex((url) => normalize(url) === expectedKey);
        anchorFound = index >= 0;
        if (index >= 0) nextUrl = urls[index + 1] || '';
      }
      const text = (document.body?.innerText || '').toLocaleLowerCase();
      const atEnd = /you(?:'|’)ve reached the end of the list|you have reached the end of the list|você chegou ao fim da lista|não há mais resultados|no more results/.test(text);
      const before = feed.scrollTop;
      if (!nextUrl && !atEnd) {
        feed.scrollTop = Math.min(feed.scrollHeight, before + Math.max(300, Math.floor(feed.clientHeight * 0.75)));
      }
      return {
        url: nextUrl,
        anchorFound,
        atEnd,
        scrollTop: feed.scrollTop,
        maxScroll: Math.max(0, feed.scrollHeight - feed.clientHeight),
        moved: feed.scrollTop > before,
      };
    }, anchorKey);

    if (result.url) return { url: result.url, exhausted: false };
    if (result.atEnd) return { url: '', exhausted: true };
    if (result.anchorFound) anchorWasLocated = true;
    if (!result.anchorFound && anchorKey && !anchorWasLocated) {
      throw new Error('A última ficha processada não está presente no feed restaurado do Google Maps.');
    }
    if (!result.anchorFound && anchorWasLocated) {
      const firstVisible = await page.evaluate(() => {
        const feed = document.querySelector('div[role="feed"]');
        const first = feed?.querySelector('a[href*="/maps/place/"]') as HTMLAnchorElement | null;
        return first?.href || '';
      });
      if (firstVisible) return { url: firstVisible, exhausted: false };
    }
    stagnantRounds = result.moved ? 0 : stagnantRounds + 1;
    if (stagnantRounds >= 3) return { url: '', exhausted: false };
    await delay(650);
  }

  return { url: '', exhausted: false };
}

async function finishJob(store: ScrapeRuntimeStore, job: ScrapeJob): Promise<void> {
  const reachedTarget = job.total_collected >= job.limit_requested;
  job.status = reachedTarget
    ? (job.total_errors > 0 ? 'partial' : 'completed')
    : (job.total_found > 0 || job.total_duplicates > 0 ? 'partial' : 'failed');
  job.status_message = reachedTarget
    ? 'Meta atingida: ' + job.total_collected + '/' + job.limit_requested +
      ' novos contatos salvos; ' + job.total_duplicates + ' já cadastrados.'
    : 'Fim dos resultados disponíveis nesta pesquisa: ' + job.total_collected +
      ' novos contatos salvos, ' + job.total_duplicates + ' já cadastrados e ' +
      job.total_errors + ' falha(s). O checkpoint foi preservado.';
  job.current_step = job.status === 'completed' ? 'Meta atingida' : 'Pesquisa finalizada';
  job.completed_at = new Date().toISOString();
  setHeartbeat(job);
  await store.persistScrapeProgress(job);
}

async function stopIfRequested(store: ScrapeRuntimeStore, job: ScrapeJob): Promise<boolean> {
  if (!(await store.isJobCancellationRequested(job.id, job.user_id))) return false;
  job.status = 'stopped';
  job.status_message = 'Coleta interrompida pelo usuário. O checkpoint foi preservado.';
  job.current_step = 'Interrompido';
  job.completed_at = new Date().toISOString();
  setHeartbeat(job);
  await store.persistScrapeProgress(job);
  return true;
}

async function checkpointPlace(
  store: ScrapeRuntimeStore,
  job: ScrapeJob,
  placeUrl: string,
  outcome: 'saved' | 'duplicate',
  place?: PlaceRecord,
): Promise<void> {
  const processedAt = new Date().toISOString();
  const sourceKey = normalizeMapsPlaceUrl(placeUrl);
  job.discovery_checkpoint = {
    ...(job.discovery_checkpoint || {}),
    version: 2,
    last_processed_url: place?.source_url || place?.maps_url || placeUrl,
    last_processed_source_key: sourceKey,
    last_processed_name: place?.name || '',
    last_processed_outcome: outcome,
    last_processed_at: processedAt,
    processed_count: Number(job.discovery_checkpoint?.processed_count || 0) + 1,
  };
  job.candidate_cursor = Number(job.discovery_checkpoint.processed_count || 0);
  job.total_found += 1;
  job.retry_count = 0;
  job.current_step = 'Processadas ' + job.total_found + ' fichas · ' +
    job.total_collected + '/' + job.limit_requested + ' novos contatos salvos.';
  setHeartbeat(job);
  let inserted = true;
  try {
    inserted = await store.persistScrapeProgress(job, place);
  } catch (error) {
    if (place) {
      const state = store.getState();
      state.places = state.places.filter((item) => item.id !== place.id);
      job.total_collected = Math.max(0, job.total_collected - 1);
    }
    throw error;
  }
  if (!inserted && place) {
    const state = store.getState();
    state.places = state.places.filter((item) => item.id !== place.id);
    job.total_collected = Math.max(0, job.total_collected - 1);
    job.total_duplicates += 1;
    job.discovery_checkpoint = {
      ...(job.discovery_checkpoint || {}),
      last_processed_outcome: 'duplicate',
    };
    await store.persistScrapeProgress(job);
  }
}

async function processOnePlace(
  store: ScrapeRuntimeStore,
  job: ScrapeJob,
  browser: Browser,
  placeUrl: string,
): Promise<void> {
  const state = store.getState();
  const normalizedUrl = normalizeMapsPlaceUrl(placeUrl);
  const sourceId = extractSourcePlaceId(placeUrl);

  if (await store.isExistingPlace({
    source_place_id: sourceId,
    source_url: normalizedUrl,
    maps_url: placeUrl,
  })) {
    job.total_duplicates += 1;
    await checkpointPlace(store, job, placeUrl, 'duplicate');
    return;
  }

  const detailPage = await browser.newPage();
  try {
    await configurePage(detailPage);
    detailPage.setDefaultNavigationTimeout(DETAIL_NAVIGATION_TIMEOUT_MS);
    await detailPage.goto(placeUrl, { waitUntil: 'domcontentloaded', timeout: DETAIL_NAVIGATION_TIMEOUT_MS });
    await delay(350);

    const place = await withTimeout(
      extractPlaceDetails(detailPage, job.id, placeUrl),
      DETAIL_EXTRACTION_TIMEOUT_MS,
      'Extração dos dados da ficha',
    );
    if (!isValidBusinessName(place.name)) {
      throw new Error('O Google Maps não apresentou um nome válido de estabelecimento.');
    }
    if (!place.address && !place.phone && !place.website && !place.source_place_id) {
      throw new Error('A ficha não apresentou endereço, telefone, site ou identificador verificável.');
    }

    if (await store.isExistingPlace(place)) {
      job.total_duplicates += 1;
      await checkpointPlace(store, job, placeUrl, 'duplicate');
      return;
    }

    place.source_place_id = place.source_place_id || sourceId;
    place.source_url = place.source_url || place.maps_url || placeUrl;
    place.maps_url = place.maps_url || placeUrl;

    const fallback = parseSearchLocationFallback(job.location);
    let fieldStatus: Record<string, any> = {};
    try { fieldStatus = place.field_status ? JSON.parse(place.field_status) : {}; } catch { fieldStatus = {}; }
    const enrichedAt = new Date().toISOString();
    if (!place.city && fallback.city) {
      place.city = fallback.city;
      fieldStatus.city = { status: 'enriched_from_search_location', source: 'scrape_job.location', observed_at: enrichedAt };
    }
    if (!place.state && fallback.state) {
      place.state = fallback.state;
      fieldStatus.state = { status: 'enriched_from_search_location', source: 'scrape_job.location', observed_at: enrichedAt };
    }
    place.field_status = JSON.stringify(fieldStatus);

    state.places.push(place);
    job.total_collected += 1;
    addLog(state, job, 'info', 'place_extracted', 'Contato extraído e salvo: "' + place.name + '"', {
      name: place.name,
      address: place.address,
      phone: place.phone,
      website: place.website,
      source_url: place.source_url,
    });

    await checkpointPlace(store, job, placeUrl, 'saved', place);
  } finally {
    await withTimeout(detailPage.close(), 1_500, 'Fechamento da ficha').catch(() => {});
  }
}

/**
 * One simple sequential flow:
 * open the Maps search -> find the next card after the last completed URL ->
 * extract -> deduplicate -> save -> checkpoint. No discovery queue or ordinal
 * candidate processing is required.
 */
export async function runScrapeJobStep(
  store: ScrapeRuntimeStore,
  connectBrowser: BrowserConnector,
  jobId: string,
  userId: string,
): Promise<void> {
  const state = store.getState();
  const durableJob = await store.findJobForWorker(jobId, userId).catch((error) => {
    console.error('[Scraper] Falha ao recuperar estado do job:', error instanceof Error ? error.message : error);
    return null;
  });
  if (!durableJob || durableJob.status !== 'running') return;

  let job = state.jobs.find((item) => item.id === jobId && item.user_id === userId);
  if (job) Object.assign(job, durableJob);
  else {
    job = durableJob;
    state.jobs.push(job);
  }

  let claimed = false;
  let browser: Browser | null = null;
  let feedPage: Page | null = null;

  try {
    claimed = await store.claimScrapeWorkerLease(jobId, userId);
    if (!claimed) return;
    if (await stopIfRequested(store, job)) return;

    job.phase = 'discovering';
    job.retry_count = Number(job.retry_count || 0);
    const checkpoint = job.discovery_checkpoint || {};
    let lastProcessedUrl = String(checkpoint.last_processed_url || '');

    // Migrate old sessions once: use the last candidate explicitly marked
    // processed/duplicate. Never use last_seen_url because it may be unprocessed.
    if (!lastProcessedUrl && job.search_session_id) {
      lastProcessedUrl = await store.findLastProcessedCandidateUrl(job.search_session_id);
      if (lastProcessedUrl) {
        job.discovery_checkpoint = {
          ...checkpoint,
          version: 2,
          last_processed_url: lastProcessedUrl,
          last_processed_source_key: normalizeMapsPlaceUrl(lastProcessedUrl),
          migrated_from_candidate_queue_at: new Date().toISOString(),
        };
        await store.persistScrapeProgress(job);
      }
    }

    browser = await connectBrowser(state.settings?.browserWsEndpoint);
    feedPage = await browser.newPage();
    await configurePage(feedPage);

    const searchQuery = (job.segment + ' ' + job.location).trim();
    const searchUrl = 'https://www.google.com/maps/search/' + encodeURIComponent(searchQuery);
    job.current_step = lastProcessedUrl
      ? 'Retomando depois da última ficha processada...'
      : 'Abrindo o Google Maps para iniciar a pesquisa...';
    job.status_message = lastProcessedUrl
      ? 'Checkpoint encontrado. A próxima ficha será processada; os contatos já salvos não serão reprocessados.'
      : 'Pesquisa iniciada. Cada contato será salvo e terá seu checkpoint registrado individualmente.';
    setHeartbeat(job);
    await store.persistScrapeProgress(job);

    await feedPage.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await waitForMapsFeed(feedPage);
    await acceptMapsConsent(feedPage);
    await delay(700);

    if (lastProcessedUrl) {
      await restoreLastProcessedPlace(feedPage, lastProcessedUrl);
    }

    const startedAt = Date.now();
    let processedThisStep = 0;

    while (
      processedThisStep < STEP_MAX_PLACES &&
      Date.now() - startedAt < STEP_BUDGET_MS &&
      job.total_collected < job.limit_requested
    ) {
      if (await stopIfRequested(store, job)) return;

      const next = await findNextPlaceUrl(feedPage, lastProcessedUrl);
      if (next.exhausted) {
        await finishJob(store, job);
        return;
      }
      if (!next.url) {
        job.status = 'partial';
        job.status_message = 'A próxima ficha ainda não apareceu no feed do Google Maps. O checkpoint da última ficha processada foi preservado; uma nova execução poderá retomar dali.';
        job.current_step = 'Aguardando próximo resultado do Google Maps';
        job.completed_at = new Date().toISOString();
        setHeartbeat(job);
        await store.persistScrapeProgress(job);
        return;
      }

      try {
        await processOnePlace(store, job, browser, next.url);
        lastProcessedUrl = String(job.discovery_checkpoint?.last_processed_url || next.url);
        processedThisStep += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        job.total_errors += 1;
        job.retry_count = Number(job.retry_count || 0) + 1;
        addLog(state, job, 'warn', 'place_error', 'Falha ao processar ficha; checkpoint mantido na ficha anterior: ' + message, {
          url: next.url,
          retry_count: job.retry_count,
        });
        job.status_message = 'Falha ao processar a próxima ficha. O checkpoint anterior foi mantido para tentar novamente.';
        job.current_step = 'Falha na ficha seguinte · tentativa ' + job.retry_count + '/3';
        if (job.retry_count >= 3) {
          job.status = 'failed';
          job.status_message = 'A coleta foi pausada após três falhas consecutivas na mesma ficha. O checkpoint anterior foi preservado.';
          job.current_step = 'Ficha pendente de nova tentativa';
          job.completed_at = new Date().toISOString();
        }
        setHeartbeat(job);
        await store.persistScrapeProgress(job);
        return;
      }

      if (job.total_collected >= job.limit_requested) {
        await finishJob(store, job);
        return;
      }
    }

    job.current_step = 'Checkpoint salvo após ' + processedThisStep + ' ficha(s). Preparando continuação...';
    job.status_message = 'A coleta continuará da ficha seguinte ao último contato processado.';
    setHeartbeat(job);
    await store.persistScrapeProgress(job);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Scraper] Falha na etapa do job ' + jobId + ': ' + message);
    job.retry_count = Number(job.retry_count || 0) + 1;
    job.status_message = 'Falha temporária ao retomar o Google Maps: ' + message.slice(0, 180) +
      '. O último checkpoint permanece salvo.';
    job.current_step = 'Falha ao retomar · tentativa ' + job.retry_count + '/3';
    if (job.retry_count >= 3) {
      job.status = 'failed';
      job.total_errors += 1;
      job.status_message = 'A coleta foi pausada após três falhas consecutivas ao restaurar a última ficha: ' + message.slice(0, 180);
      job.current_step = 'Retomada pausada; checkpoint preservado';
      job.completed_at = new Date().toISOString();
    }
    setHeartbeat(job);
    addLog(state, job, 'warn', 'worker_step_error', message, { retry_count: job.retry_count });
    await store.persistScrapeProgress(job);
  } finally {
    if (feedPage) await withTimeout(feedPage.close(), 1_500, 'Fechamento do feed').catch(() => {});
    if (browser) await withTimeout(browser.close(), 1_500, 'Fechamento do navegador remoto').catch(() => {});
    if (claimed) await store.releaseScrapeWorkerLease(jobId).catch((error) => {
      console.error('[Scraper] Falha ao liberar lease:', error instanceof Error ? error.message : error);
    });
  }
}
