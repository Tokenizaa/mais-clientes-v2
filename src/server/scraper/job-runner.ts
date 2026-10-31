import type { Browser, Page } from 'puppeteer-core';
import type { PlaceRecord, ScrapeJob } from '../../shared/types.js';
import { extractPlaceDetails } from './extractor.ts';
import { extractSourcePlaceId, parseSearchLocationFallback } from './normalizer.ts';

const DISCOVERY_BUDGET_MS = 12_000;
const DISCOVERY_STAGNANT_ROUNDS = 6;
const CANDIDATES_PER_STEP = 1;
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
  releaseScrapeWorkerLease(jobId: string): Promise<void>;
}

type BrowserConnector = (legacyEndpoint?: string) => Promise<Browser>;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function getIdentity(place: Partial<PlaceRecord>): {
  sourceId: string;
  urlKeys: string[];
  nameAddressKey: string;
} {
  const sourceId =
    extractSourcePlaceId(place.maps_url) ||
    extractSourcePlaceId(place.source_url) ||
    String(place.source_place_id || '').trim().toLowerCase();
  const urlKeys = [place.maps_url, place.source_url].map(normalizeMapsPlaceUrl).filter(Boolean);
  const name = normalizeTextKey(place.name);
  const address = normalizeTextKey(place.address);
  return { sourceId, urlKeys, nameAddressKey: name && address ? name + '|' + address : '' };
}

function addLog(state: ScraperState, job: ScrapeJob, level: 'info' | 'warn', event: string, message: string, metadata: unknown = {}): void {
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

async function finishJob(store: ScrapeRuntimeStore, job: ScrapeJob): Promise<void> {
  const reachedTarget = job.total_collected >= job.limit_requested;
  job.status = reachedTarget
    ? (job.total_errors > 0 ? 'partial' : 'completed')
    : (job.total_collected > 0 || job.total_duplicates > 0 ? 'partial' : 'failed');
  job.status_message = reachedTarget
    ? 'Meta atingida: ' + job.total_collected + '/' + job.limit_requested +
      ' novos estabelecimentos salvos; ' + job.total_duplicates + ' já cadastrados; ' +
      job.total_errors + ' falha(s).'
    : 'Pesquisa finalizada antes da meta: ' + job.total_collected + '/' + job.limit_requested +
      ' novos salvos após verificar ' + (job.candidate_urls?.length || 0) +
      ' fichas; ' + job.total_duplicates + ' já cadastrados e ' + job.total_errors + ' falha(s).';
  job.current_step = job.status === 'completed' ? 'Meta atingida' :
    job.status === 'partial' ? 'Pesquisa parcial' : 'Nenhum estabelecimento válido foi salvo';
  job.completed_at = new Date().toISOString();
  setHeartbeat(job);
  await store.persistScrapeProgress(job);
}

async function stopIfRequested(store: ScrapeRuntimeStore, job: ScrapeJob): Promise<boolean> {
  if (!(await store.isJobCancellationRequested(job.id, job.user_id))) return false;
  job.status = 'stopped';
  job.status_message = 'Coleta interrompida pelo usuário.';
  job.current_step = 'Interrompido';
  job.completed_at = new Date().toISOString();
  setHeartbeat(job);
  await store.persistScrapeProgress(job);
  return true;
}

async function discoverCandidates(
  store: ScrapeRuntimeStore,
  job: ScrapeJob,
  browser: Browser,
): Promise<void> {
  const page = await browser.newPage();
  try {
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1280, height: 900 });
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7' });
    const searchQuery = (job.segment + ' ' + job.location).trim();
    const searchUrl = 'https://www.google.com/maps/search/' + encodeURIComponent(searchQuery);

    job.current_step = 'Abrindo o Google Maps para localizar fichas...';
    setHeartbeat(job);
    await store.persistScrapeProgress(job);
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    await delay(900);

    await page.evaluate(() => {
      const consent = Array.from(document.querySelectorAll('button')).find((button) =>
        /aceitar|concordo|accept all|i agree/i.test((button as HTMLElement).innerText || '')
      );
      if (consent) (consent as HTMLButtonElement).click();
    }).catch(() => {});

    const found = new Map<string, string>();
    const maxCandidates = Math.min(200, Math.max(job.limit_requested * 5, job.limit_requested + 50));
    const startedAt = Date.now();
    let stagnantRounds = 0;

    while (
      found.size < maxCandidates &&
      stagnantRounds < DISCOVERY_STAGNANT_ROUNDS &&
      Date.now() - startedAt < DISCOVERY_BUDGET_MS
    ) {
      if (await stopIfRequested(store, job)) return;

      const links = await withTimeout(
        page.evaluate(() => Array.from(document.querySelectorAll('a[href*="/maps/place/"]'))
          .map((anchor) => (anchor as HTMLAnchorElement).href)
          .filter((href): href is string => Boolean(href))),
        5_000,
        'Leitura dos resultados do Google Maps'
      ).catch((error) => {
        console.warn('[Scraper] Não foi possível ler os links nesta rodada:', error instanceof Error ? error.message : error);
        return [] as string[];
      });

      const before = found.size;
      for (const url of links) {
        const key = normalizeMapsPlaceUrl(url);
        if (key && !found.has(key)) found.set(key, url);
        if (found.size >= maxCandidates) break;
      }

      job.total_found = found.size;
      job.current_step = 'Encontradas ' + found.size + ' fichas; preparando a extração...';
      setHeartbeat(job);
      await store.persistScrapeProgress(job);

      if (found.size >= maxCandidates) break;
      await page.evaluate(() => {
        const feed = document.querySelector('div[role="feed"]') ||
          document.querySelector('div.m6QErb[aria-label]') ||
          document.querySelector('div.TFQHme');
        if (feed) (feed as HTMLElement).scrollTop = feed.scrollHeight;
        else window.scrollTo(0, document.body.scrollHeight);
      }).catch(() => {});
      await delay(750);
      stagnantRounds = found.size === before ? stagnantRounds + 1 : 0;
    }

    job.candidate_urls = Array.from(found.values());
    job.candidate_cursor = 0;
    job.phase = 'processing';
    job.retry_count = 0;
    job.total_found = job.candidate_urls.length;
    if (job.candidate_urls.length === 0) {
      job.status = 'failed';
      job.status_message = 'O Google Maps não retornou fichas públicas para esta busca.';
      job.current_step = 'Nenhuma ficha localizada';
      job.completed_at = new Date().toISOString();
      addLog(store.getState(), job, 'warn', 'no_results', 'Nenhuma ficha localizada para "' + searchQuery + '".');
    } else {
      job.current_step = 'Encontradas ' + job.total_found + ' fichas. Iniciando processamento em lotes...';
      job.status_message = 'Localização concluída. As fichas serão processadas em lotes curtos para evitar o limite de execução da Vercel.';
      addLog(store.getState(), job, 'info', 'discovery_completed', 'Google Maps retornou ' + job.total_found + ' fichas.', {
        total_found: job.total_found,
        limit_requested: job.limit_requested,
      });
    }
    setHeartbeat(job);
    await store.persistScrapeProgress(job);
  } finally {
    await page.close().catch(() => {});
  }
}

async function processCandidateBatch(
  store: ScrapeRuntimeStore,
  job: ScrapeJob,
  browser: Browser,
): Promise<void> {
  const state = store.getState();
  const urls = job.candidate_urls || [];
  let cursor = Math.max(0, job.candidate_cursor || 0);

  if (cursor >= urls.length) {
    await finishJob(store, job);
    return;
  }

  const knownIds = new Set<string>();
  const knownUrls = new Set<string>();
  const knownNameAddresses = new Set<string>();
  for (const existing of state.places) {
    const identity = getIdentity(existing);
    if (identity.sourceId) knownIds.add(identity.sourceId);
    identity.urlKeys.forEach((key) => knownUrls.add(key));
    if (identity.nameAddressKey) knownNameAddresses.add(identity.nameAddressKey);
  }

  const end = Math.min(cursor + CANDIDATES_PER_STEP, urls.length);
  while (cursor < end && job.total_collected < job.limit_requested) {
    if (await stopIfRequested(store, job)) return;
    const placeUrl = urls[cursor];
    let detailPage: Page | null = null;

    try {
      const urlKey = normalizeMapsPlaceUrl(placeUrl);
      const sourceId = extractSourcePlaceId(placeUrl);
      if ((sourceId && knownIds.has(sourceId)) || (urlKey && knownUrls.has(urlKey))) {
        job.total_duplicates += 1;
        cursor += 1;
        job.candidate_cursor = cursor;
        job.current_step = 'Ficha ' + cursor + '/' + urls.length + ': já cadastrada; seguindo para a próxima.';
        setHeartbeat(job);
        await store.persistScrapeProgress(job);
        continue;
      }

      detailPage = await browser.newPage();
      await detailPage.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );
      await detailPage.setViewport({ width: 1280, height: 900 });
      await detailPage.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7' });
      detailPage.setDefaultNavigationTimeout(DETAIL_NAVIGATION_TIMEOUT_MS);
      await detailPage.goto(placeUrl, { waitUntil: 'domcontentloaded', timeout: DETAIL_NAVIGATION_TIMEOUT_MS });
      await delay(350);

      const place = await withTimeout(
        extractPlaceDetails(detailPage, job.id, placeUrl),
        DETAIL_EXTRACTION_TIMEOUT_MS,
        'Extração dos dados da ficha'
      );
      if (!isValidBusinessName(place.name)) {
        throw new Error('O Google Maps não apresentou um nome válido de estabelecimento.');
      }
      if (!place.address && !place.phone && !place.website && !place.source_place_id) {
        throw new Error('A ficha não apresentou endereço, telefone, site ou identificador verificável.');
      }

      const identity = getIdentity(place);
      if (
        (identity.sourceId && knownIds.has(identity.sourceId)) ||
        identity.urlKeys.some((key) => knownUrls.has(key)) ||
        (identity.nameAddressKey && knownNameAddresses.has(identity.nameAddressKey))
      ) {
        job.total_duplicates += 1;
      } else {
        place.source_place_id = identity.sourceId || place.source_place_id || '';
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
        const logId = 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        state.logs.unshift({
          id: logId,
          created_at: new Date().toISOString(),
          level: 'info',
          category: 'scraper',
          event: 'place_extracted',
          message: 'Ficha extraída: "' + place.name + '"',
          job_id: job.id,
          metadata: JSON.stringify({ name: place.name, address: place.address, phone: place.phone, website: place.website }),
          user_id: job.user_id,
        });

        const inserted = await store.persistScrapeProgress(job, place);
        if (!inserted) {
          state.places = state.places.filter((item) => item.id !== place.id);
          state.logs = state.logs.filter((item) => item.id !== logId);
          job.total_collected = Math.max(0, job.total_collected - 1);
          job.total_duplicates += 1;
        } else {
          if (identity.sourceId) knownIds.add(identity.sourceId);
          identity.urlKeys.forEach((key) => knownUrls.add(key));
          if (identity.nameAddressKey) knownNameAddresses.add(identity.nameAddressKey);
        }
      }
    } catch (error) {
      job.total_errors += 1;
      addLog(state, job, 'warn', 'place_error', 'Falha na ficha ' + (cursor + 1) + ': ' +
        (error instanceof Error ? error.message : String(error)), { url: placeUrl });
    } finally {
      if (detailPage) await detailPage.close().catch(() => {});
    }

    cursor += 1;
    job.candidate_cursor = cursor;
    job.current_step = 'Processadas ' + cursor + '/' + urls.length +
      ' fichas · ' + job.total_collected + '/' + job.limit_requested + ' novos salvos.';
    setHeartbeat(job);
    await store.persistScrapeProgress(job);
  }

  if (job.total_collected >= job.limit_requested || cursor >= urls.length) {
    await finishJob(store, job);
  } else {
    job.current_step = 'Lote concluído: ' + cursor + '/' + urls.length +
      ' fichas verificadas. Preparando o próximo lote...';
    setHeartbeat(job);
    await store.persistScrapeProgress(job);
  }
}

/**
 * Execute exactly one bounded unit of work. The UI polls the durable job record;
 * each poll schedules the next unit, so no Vercel invocation has to scrape all
 * results inside its 60-second execution window.
 */
export async function runScrapeJobStep(
  store: ScrapeRuntimeStore,
  connectBrowser: BrowserConnector,
  jobId: string,
  userId: string,
): Promise<void> {
  const state = store.getState();
  const job = state.jobs.find((item) => item.id === jobId && item.user_id === userId);
  if (!job || job.status !== 'running') return;

  let claimed = false;
  let browser: Browser | null = null;
  try {
    claimed = await store.claimScrapeWorkerLease(jobId, userId);
    if (!claimed) return;

    if (await stopIfRequested(store, job)) return;
    job.phase = job.phase || 'discovering';
    job.retry_count = job.retry_count || 0;

    browser = await connectBrowser(state.settings?.browserWsEndpoint);
    if (job.phase === 'discovering') {
      await discoverCandidates(store, job, browser);
    } else if (job.phase === 'processing') {
      await processCandidateBatch(store, job, browser);
    } else {
      throw new Error('Etapa de coleta inválida: ' + String(job.phase));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    job.retry_count = (job.retry_count || 0) + 1;
    job.status_message = 'Falha temporária na execução: ' + message.slice(0, 180);
    job.current_step = 'Falha temporária; tentativa ' + job.retry_count + '/3.';
    if (job.retry_count >= 3) {
      job.status = 'failed';
      job.total_errors += 1;
      job.status_message = 'A coleta foi encerrada após três falhas consecutivas: ' + message.slice(0, 180);
      job.current_step = 'Falha na execução';
      job.completed_at = new Date().toISOString();
    }
    setHeartbeat(job);
    addLog(state, job, 'warn', 'worker_step_error', message, { phase: job.phase, retry_count: job.retry_count });
    await store.persistScrapeProgress(job);
  } finally {
    await browser?.close().catch(() => {});
    if (claimed) await store.releaseScrapeWorkerLease(jobId).catch((error) => {
      console.error('[Scraper] Falha ao liberar lease do job:', error instanceof Error ? error.message : error);
    });
  }
}
