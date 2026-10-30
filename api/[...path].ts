import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createApp } from '../server';

let appPromise: ReturnType<typeof createApp> | undefined;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    appPromise ??= createApp();
    const app = await appPromise;
    app(req, res);
  } catch (error) {
    console.error('[Vercel API] Application initialization failed:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Falha ao inicializar a API.' });
    }
  }
}
