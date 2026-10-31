import type { ScrapeJob } from './types.js';

/**
 * Discovery fills the first 70% of the bar. Processing the persisted candidate
 * cursor fills the remaining 30%. A terminal status means the work has ended,
 * even when the requested number of new records could not be reached.
 */
export function calculateScrapeProgressPercent(job: ScrapeJob | null): number {
  if (!job) return 0;
  if (job.status !== 'running') return 100;

  const target = Math.max(1, job.limit_requested || 20);
  const found = Math.max(0, job.total_found || 0);

  if (job.phase === 'discovering') {
    return Math.min(70, Math.round((found / target) * 100));
  }

  if (job.phase === 'processing') {
    const total = Math.max(1, job.candidate_urls?.length || found);
    const processed = Math.min(total, Math.max(0, job.candidate_cursor || 0));
    return Math.min(99, 70 + Math.round((processed / total) * 30));
  }

  // Backward compatibility for jobs created before the resumable worker.
  return Math.min(99, Math.round((found / target) * 100));
}
