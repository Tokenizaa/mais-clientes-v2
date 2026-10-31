import test from 'node:test';
import assert from 'node:assert/strict';
import type { ScrapeJob } from './types.js';
import { calculateScrapeProgressPercent } from './scrape-progress.js';

function job(overrides: Partial<ScrapeJob> = {}): ScrapeJob {
  return {
    id: 'job_test_12345678',
    user_id: 'user_test',
    segment: 'restaurantes',
    location: 'São Paulo, SP',
    limit_requested: 20,
    status: 'running',
    status_message: '',
    total_found: 0,
    total_collected: 0,
    total_duplicates: 0,
    total_errors: 0,
    created_at: new Date(0).toISOString(),
    ...overrides,
  };
}

test('discovery progress reflects found fiches instead of remaining at zero saved', () => {
  assert.equal(calculateScrapeProgressPercent(job({ phase: 'discovering', total_found: 14 })), 70);
});

test('processing starts at 70 percent and advances from the persisted cursor', () => {
  const base = { phase: 'processing' as const, total_found: 14, candidate_urls: Array(14).fill('url') };
  assert.equal(calculateScrapeProgressPercent(job(base)), 70);
  assert.equal(calculateScrapeProgressPercent(job({ ...base, candidate_cursor: 7 })), 85);
  assert.equal(calculateScrapeProgressPercent(job({ ...base, candidate_cursor: 14 })), 99);
});

test('terminal jobs report completed work even when the target was not reached', () => {
  assert.equal(calculateScrapeProgressPercent(job({ status: 'partial', total_found: 14 })), 100);
  assert.equal(calculateScrapeProgressPercent(job({ status: 'failed' })), 100);
});

test('legacy jobs without a phase retain a useful discovery percentage', () => {
  assert.equal(calculateScrapeProgressPercent(job({ total_found: 10 })), 50);
});
