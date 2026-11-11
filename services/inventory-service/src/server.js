import { createDb } from './db.js';
import { createApp } from './app.js';
import { createAuthClient } from './auth-client.js';

const REQUIRED = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'AUTH_URL'];
for (const key of REQUIRED) {
  if (!process.env[key]) {
    console.error(`ERROR: ${key} environment variable is required`);
    process.exit(1);
  }
}

const PORT = process.env.PORT ?? 8080;
const SHUTDOWN_DELAY_MS = Number(process.env.SHUTDOWN_DELAY_MS ?? 5000);

const db = createDb({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const authClient = createAuthClient({ authUrl: process.env.AUTH_URL });

const state = { initialized: false, shuttingDown: false };

const app = createApp({ db, authClient, state });

const server = app.listen(PORT, () => {
  console.log(`inventory-service listening on port ${PORT}`);
});

async function initWithRetry() {
  while (!state.shuttingDown) {
    try {
      await db.init();
      state.initialized = true;
      console.log('Database schema initialized');
      return;
    } catch (err) {
      console.error(`Database init failed, retrying in 3 s: ${err.message}`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

initWithRetry();

process.on('SIGTERM', () => {
  console.log('SIGTERM received — starting graceful shutdown');
  state.shuttingDown = true;

  const hard = setTimeout(() => {
    console.error('Shutdown timed out — forcing exit');
    process.exit(1);
  }, 20_000);
  hard.unref();

  setTimeout(() => {
    server.close(() => {
      console.log('HTTP server closed');
      db.close().finally(() => process.exit(0));
    });
  }, SHUTDOWN_DELAY_MS);
});
