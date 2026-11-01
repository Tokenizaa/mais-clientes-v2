import type { ScrapeJob } from './types.js';

/**
 * The requested target is NEW saved establishments, not discovered or processed
 * Maps cards. Therefore only total_collected may advance this percentage.
 * A partial/failed/stopped run keeps the percentage actually achieved instead
 * of displaying 100% merely because its current candidate batch ended.
 */
export function calculateScrapeProgressPercent(job: ScrapeJob | null): number {
  if (!job) return 0;

  const target = Math.max(1, job.limit_requested || 20);
  const collected = Math.max(0, job.total_collected || 0);
  const achieved = Math.min(100, Math.round((collected / target) * 100));

  // 100% means the run has reached a confirmed terminal condition, not necessarily that the requested number of new records was saved.
  if (job.status === 'completed' || job.completion_reason === 'target_reached' || job.completion_reason === 'feed_exhausted' || collected >= target) return 100;
  return Math.min(99, achieved);
}
