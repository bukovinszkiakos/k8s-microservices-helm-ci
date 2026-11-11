import express from 'express';

export function createApp({ inventoryClient, isShuttingDown }) {
  const app = express();

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/ready', (_req, res) => {
    if (isShuttingDown()) {
      return res.status(503).json({ status: 'not ready' });
    }
    res.json({ status: 'ok' });
  });

  app.get('/summary', async (_req, res) => {
    let items;
    try {
      items = await inventoryClient.listItems();
    } catch {
      return res.status(503).json({ error: 'inventory service unavailable' });
    }
    const totalItems = items.length;
    const totalQuantity = items.reduce((sum, item) => sum + item.quantity, 0);
    res.json({ totalItems, totalQuantity });
  });

  return app;
}
