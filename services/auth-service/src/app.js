import express from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';

export function createApp({ apiToken, isShuttingDown }) {
  const app = express();

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/ready', (_req, res) => {
    if (isShuttingDown()) {
      return res.status(503).json({ status: 'shutting down' });
    }
    res.json({ status: 'ok' });
  });

  app.get('/validate', (req, res) => {
    const authHeader = req.headers['authorization'] ?? '';
    const prefix = 'Bearer ';

    if (!authHeader.startsWith(prefix)) {
      return res.status(401).json({ valid: false });
    }

    const provided = authHeader.slice(prefix.length);

    const hash = (s) => createHash('sha256').update(s).digest();
    const valid = timingSafeEqual(hash(provided), hash(apiToken));

    if (valid) {
      return res.json({ valid: true });
    }
    res.status(401).json({ valid: false });
  });

  return app;
}
