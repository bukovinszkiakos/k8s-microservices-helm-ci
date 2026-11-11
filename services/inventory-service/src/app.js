import express from 'express';

export function createApp({ db, authClient, state }) {
  const app = express();

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/ready', async (_req, res) => {
    if (state.shuttingDown || !state.initialized) {
      return res.status(503).json({ status: 'not ready' });
    }
    try {
      await db.ping();
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'not ready' });
    }
  });

  app.get('/items', async (_req, res) => {
    const items = await db.listItems();
    res.json({ items });
  });

  return app;
}
