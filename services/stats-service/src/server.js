import { createInventoryClient } from './inventory-client.js';
import { createApp } from './app.js';

const REQUIRED = ['INVENTORY_URL'];
for (const key of REQUIRED) {
  if (!process.env[key]) {
    console.error(`ERROR: ${key} environment variable is required`);
    process.exit(1);
  }
}

const PORT = process.env.PORT ?? 8080;
const SHUTDOWN_DELAY_MS = Number(process.env.SHUTDOWN_DELAY_MS ?? 5000);

const state = { shuttingDown: false };

const inventoryClient = createInventoryClient({ inventoryUrl: process.env.INVENTORY_URL });

const app = createApp({ inventoryClient, isShuttingDown: () => state.shuttingDown });

const server = app.listen(PORT, () => {
  console.log(`stats-service listening on port ${PORT}`);
});

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
      process.exit(0);
    });
  }, SHUTDOWN_DELAY_MS);
});
