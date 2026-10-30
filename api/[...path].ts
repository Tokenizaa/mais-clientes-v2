import type { Request, Response } from 'express';
import { createApp } from '../server';

let appPromise: ReturnType<typeof createApp> | undefined;

export default async function handler(req: Request, res: Response) {
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
