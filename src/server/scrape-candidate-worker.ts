import os from 'node:os';
import process from 'node:process';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Browser, Page } from 'puppeteer-core';
import type { PlaceRecord } from '../shared/types.js';
import { connectScraperBrowser } from './scraper/browser.js';
import { extractPlaceDetails } from './scraper/extractor.js';
import { parseSearchLocationFallback } from './scraper/normalizer.js';

interface Candidate {
  candidate_id: string;
  job_id: string;
  user_id: string;
  session_id: string;
  source_key: string;
  source_url: string;
  ordinal: number;
  attempt_count: number;
  lease_token: string;
  lease_generation: number;
  segment: string;
  location: string;
  project_id: string | null;
  category_id: string | null;
  limit_requested: number;
  total_collected: number;
  total_duplicates: number;
}

const supabaseUrl = process.env.SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY para iniciar o consumidor.');
}

const supabase: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});
const workerId = process.env.SCRAPE_WORKER_ID?.trim() || `candidate-worker-${os.hostname()}-${process.pid}`;
const pollMs = Math.max(500, Number(process.env.SCRAPE_WORKER_POLL_MS || 1500));
const leaseSeconds = Math.min(900, Math.max(60, Number(process.env.SCRAPE_CANDIDATE_LEASE_SECONDS || 180)));
const maxAttempts = Math.min(20, Math.max(1, Number(process.env.SCRAPE_CANDIDATE_MAX_ATTEMPTS || 5)));
let browser: Browser | null = null;
let shuttingDown = false;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function ensureBrowser(): Promise<Browser> {
  if (browser && browser.connected) return browser;
  browser = await connectScraperBrowser();
  browser.on('disconnected', () => { browser = null; });
  return browser;
}

async function claimCandidate(): Promise<Candidate | null> {
  const { data, error } = await supabase.rpc('claim_scrape_candidate', {
    p_worker_id: workerId,
    p_lease_seconds: leaseSeconds,
    p_max_attempts: maxAttempts,
  });
  if (error) throw new Error('Falha ao reivindicar candidato: ' + error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return row ? row as Candidate : null;
}

async function renewCandidate(candidate: Candidate): Promise<boolean> {
  const { data, error } = await supabase.rpc('renew_scrape_candidate_lease', {
    p_candidate_id: candidate.candidate_id,
    p_worker_id: workerId,
    p_lease_token: candidate.lease_token,
    p_generation: candidate.lease_generation,
    p_lease_seconds: leaseSeconds,
  });
  if (error) throw new Error('Falha ao renovar lease do candidato: ' + error.message);
  return data === true;
}

async function processCandidate(candidate: Candidate): Promise<void> {
  let page: Page | null = null;
  let leaseLost = false;
  let renewalInFlight = false;
  const renewal = setInterval(async () => {
    if (renewalInFlight || leaseLost) return;
    renewalInFlight = true;
    try {
      leaseLost = !(await renewCandidate(candidate));
    } catch (error) {
      console.error('[candidate-worker] lease renewal failed:', error);
      leaseLost = true;
    } finally {
      renewalInFlight = false;
    }
  }, Math.max(15000, Math.floor(leaseSeconds * 1000 / 3)));
  renewal.unref?.();

  try {
    const activeBrowser = await ensureBrowser();
    page = await activeBrowser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7' });
    await page.goto(candidate.source_url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await sleep(800);

    if (leaseLost) throw new Error('Lease do candidato perdida durante a extração.');

    const place = await extractPlaceDetails(page, candidate.job_id, candidate.source_url);
    if (candidate.project_id) (place as PlaceRecord & { project_id?: string }).project_id = candidate.project_id;
    if (candidate.category_id) (place as PlaceRecord & { category_id?: string }).category_id = candidate.category_id;
    const fallback = parseSearchLocationFallback(candidate.location);
    if (!place.city && fallback.city) place.city = fallback.city;
    if (!place.state && fallback.state) place.state = fallback.state;

    if (leaseLost) throw new Error('Lease do candidato perdida antes da persistência.');

    const { data, error } = await supabase.rpc('complete_scrape_candidate', {
      p_candidate_id: candidate.candidate_id,
      p_job_id: candidate.job_id,
      p_user_id: candidate.user_id,
      p_session_id: candidate.session_id,
      p_outcome: 'saved',
      p_place: {
        ...place,
        source_url: String(place.source_url || place.maps_url || candidate.source_url).split(/[?#]/, 1)[0],
      },
      p_source_key: candidate.source_key,
      p_source_url: candidate.source_url,
      p_lease_token: candidate.lease_token,
      p_lease_generation: candidate.lease_generation,
    });
    if (error || !data) throw new Error('Falha na persistência atômica: ' + (error?.message || 'resposta vazia'));

    console.info('[candidate-worker] candidate completed', {
      jobId: candidate.job_id,
      candidateId: candidate.candidate_id,
      outcome: data.outcome,
      collected: data.total_collected,
      duplicates: data.total_duplicates,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const { data, error: releaseError } = await supabase.rpc('release_scrape_candidate', {
      p_candidate_id: candidate.candidate_id,
      p_worker_id: workerId,
      p_lease_token: candidate.lease_token,
      p_generation: candidate.lease_generation,
      p_error: detail.slice(0, 1800),
      p_max_attempts: maxAttempts,
    });
    if (releaseError) {
      console.error('[candidate-worker] candidate release failed; lease expiry will permit recovery:', releaseError.message);
    } else {
      console.error('[candidate-worker] extraction failed', {
        jobId: candidate.job_id,
        candidateId: candidate.candidate_id,
        nextStatus: data,
        error: detail,
      });
    }
    if (/connection closed|target closed|browser.*disconnect|websocket|protocol error/i.test(detail)) {
      await browser?.close().catch(() => {});
      browser = null;
    }
  } finally {
    clearInterval(renewal);
    await page?.close().catch(() => {});
  }
}

async function finalizeDrainedJobs(): Promise<void> {
  const { data: jobs, error } = await supabase
    .from('scrape_jobs')
    .select('id,user_id,search_session_id,status,total_collected,limit_requested')
    .in('status', ['running', 'partial'])
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) throw new Error('Falha ao consultar jobs para finalização: ' + error.message);

  for (const job of jobs || []) {
    const targetReached = Number(job.total_collected || 0) >= Number(job.limit_requested || 0);
    let sessionExhausted = false;
    if (job.search_session_id) {
      const { data: session, error: sessionError } = await supabase
        .from('scrape_search_sessions')
        .select('exhausted')
        .eq('id', job.search_session_id)
        .eq('user_id', job.user_id)
        .maybeSingle();
      if (sessionError) throw new Error('Falha ao consultar sessão: ' + sessionError.message);
      sessionExhausted = session?.exhausted === true;
    }
    if (!targetReached && !sessionExhausted) continue;

    const { count: pending, error: pendingError } = await supabase
      .from('scrape_candidates')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', job.id)
      .in('status', ['discovered', 'processing']);
    if (pendingError) throw new Error('Falha ao conferir fila pendente: ' + pendingError.message);
    if ((pending || 0) > 0 && !targetReached) continue;

    const { count: failed, error: failedError } = await supabase
      .from('scrape_candidates')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', job.id)
      .eq('status', 'failed');
    if (failedError) throw new Error('Falha ao conferir candidatos com erro: ' + failedError.message);

    const status = (failed || 0) > 0 && !targetReached ? 'partial' : 'completed';
    const message = targetReached
      ? `Meta atingida: ${job.total_collected} novos estabelecimentos salvos.`
      : status === 'partial'
        ? `Feed esgotado com ${failed} ficha(s) que excederam as tentativas; os demais resultados foram processados.`
        : `Feed esgotado: ${job.total_collected} novos estabelecimentos salvos.`;

    await supabase.from('scrape_jobs')
      .update({ status, status_message: message, current_step: status === 'completed' ? 'Concluído' : 'Concluído parcialmente', completed_at: new Date().toISOString(), phase: 'processing', heartbeat_at: new Date().toISOString() })
      .eq('id', job.id)
      .in('status', ['running', 'partial']);
  }
}

async function main(): Promise<void> {
  console.info('[candidate-worker] started', { workerId, pollMs, leaseSeconds, maxAttempts });
  while (!shuttingDown) {
    try {
      const candidate = await claimCandidate();
      if (candidate) {
        await processCandidate(candidate);
      } else {
        await finalizeDrainedJobs();
        await sleep(pollMs);
      }
    } catch (error) {
      console.error('[candidate-worker] loop error:', error instanceof Error ? error.message : String(error));
      await sleep(Math.max(pollMs, 3000));
    }
  }
  await browser?.close().catch(() => {});
}

process.on('SIGINT', () => { shuttingDown = true; });
process.on('SIGTERM', () => { shuttingDown = true; });

void main().catch((error) => {
  console.error('[candidate-worker] fatal:', error);
  process.exitCode = 1;
});
