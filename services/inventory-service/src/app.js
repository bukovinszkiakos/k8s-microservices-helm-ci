import express from 'express';

export function createApp({ db, authClient, state }) {
  const app = express();
  app.use(express.json({ limit: '10kb' }));

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

  app.post('/items', async (req, res) => {
    const authHeader = req.get('Authorization');
    if (!authHeader) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    let authorized;
    try {
      authorized = await authClient.isAuthorized(authHeader);
    } catch {
      return res.status(503).json({ error: 'auth service unavailable' });
    }

    if (!authorized) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const { name, quantity } = req.body ?? {};

    if (typeof name !== 'string') {
      return res.status(400).json({ error: 'invalid input' });
    }
    const trimmedName = name.trim();
    if (trimmedName.length < 1 || trimmedName.length > 100) {
      return res.status(400).json({ error: 'invalid input' });
    }
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 1_000_000) {
      return res.status(400).json({ error: 'invalid input' });
    }

    const item = await db.createItem(trimmedName, quantity);
    res.status(201).json(item);
  });

  return app;
}
