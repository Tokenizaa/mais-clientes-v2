import { createApp } from './server';

const port = Number(process.env.PORT || 3000);

createApp().then((app) => {
  app.listen(port, '0.0.0.0', () => {
    console.log(`[MaisClientes] API disponível em http://localhost:${port}`);
  });
}).catch((error) => {
  console.error('[MaisClientes] Falha ao iniciar:', error);
  process.exit(1);
});
