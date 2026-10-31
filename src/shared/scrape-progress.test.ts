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

test('progress is based on NEW saved establishments, not discovered cards', () => {
  assert.equal(calculateScrapeProgressPercent(job({
    phase: 'processing',
    total_found: 40,
    total_collected: 0,
    total_duplicates: 29,
    candidate_cursor: 29,
    candidate_urls: ['only-the-current-bounded-item'],
  })), 0);
});

test('progress follows the requested target as new establishments are saved', () => {
  assert.equal(calculateScrapeProgressPercent(job({ total_collected: 1 })), 5);
  assert.equal(calculateScrapeProgressPercent(job({ total_collected: 11 })), 55);
  assert.equal(calculateScrapeProgressPercent(job({ total_collected: 19 })), 95);
  assert.equal(calculateScrapeProgressPercent(job({ total_collected: 20 })), 100);
});

test('partial, failed and stopped jobs show the target actually achieved', () => {
  assert.equal(calculateScrapeProgressPercent(job({ status: 'partial', total_collected: 11 })), 55);
  assert.equal(calculateScrapeProgressPercent(job({ status: 'failed', total_collected: 0 })), 0);
  assert.equal(calculateScrapeProgressPercent(job({ status: 'stopped', total_collected: 3 })), 15);
});

test('completed jobs report 100 percent', () => {
  assert.equal(calculateScrapeProgressPercent(job({ status: 'completed', total_collected: 20 })), 100);
});
