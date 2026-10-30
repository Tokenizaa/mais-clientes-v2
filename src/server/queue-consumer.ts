import { configureDatabaseEnv, getJob, updateJobProgress, type ScrapeJob } from './db';
import { runScraperJob } from './scraper/runner';

interface QueueMessage<T> { body: T; attempts: number; ack(): void; retry(options?: { delaySeconds?: number }): void; }
interface QueueBatch<T> { messages: QueueMessage<T>[]; }
interface QueueEnv { SUPABASE_URL: string; SUPABASE_SERVICE_ROLE_KEY: string; BROWSER_WS_ENDPOINT: string; }
interface ScrapeQueuePayload { jobId: string; }

export default {
  async queue(batch: QueueBatch<ScrapeQueuePayload>, env: QueueEnv): Promise<void> {
    configureDatabaseEnv(env as unknown as Record<string, unknown>);
    for (const message of batch.messages) {
      const jobId = typeof message.body?.jobId === 'string' ? message.body.jobId : '';
      if (!jobId || !/^job_[a-zA-Z0-9_-]{8,100}$/.test(jobId)) {
        console.error('Discarding malformed scrape queue message');
        message.ack();
        continue;
      }
      try {
        if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
          throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar configurados no Worker consumidor.');
        }
        const job = await getJob(jobId);
        if (!job) { console.error('Scrape queue job not found: ' + jobId); message.ack(); continue; }
        // Queue delivery is at-least-once. Do not rerun jobs in a terminal state.
        if (job.status !== 'running') { message.ack(); continue; }
        if (!env.BROWSER_WS_ENDPOINT) {
          await updateJobProgress(jobId, { status: 'failed', status_message: 'Navegador remoto não configurado no Worker consumidor.', current_step: 'Configuração ausente', completed_at: new Date().toISOString() });
          message.ack();
          continue;
        }
        await runScraperJob(job.id, job.segment, job.location, job.limit_requested, async (progress: Partial<ScrapeJob>) => {
          await updateJobProgress(job.id, progress);
        }, env.BROWSER_WS_ENDPOINT);
        message.ack();
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        console.error('Queue consumer failed for job ' + jobId + ':', detail);
        if (message.attempts >= 4) {
          await updateJobProgress(jobId, { status: 'failed', status_message: 'Falha no processamento após novas tentativas: ' + detail.slice(0, 180), current_step: 'Falha no consumidor', completed_at: new Date().toISOString() }).catch((updateError) => console.error('Could not persist terminal queue failure:', updateError));
          message.ack();
        } else {
          message.retry({ delaySeconds: Math.min(60, 5 * Math.max(1, message.attempts)) });
        }
      }
    }
  },
};
