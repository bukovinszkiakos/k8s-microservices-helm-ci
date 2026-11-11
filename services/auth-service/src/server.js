import { createApp } from './app.js';

const PORT = process.env.PORT ?? 8080;
const API_TOKEN = process.env.API_TOKEN;
const SHUTDOWN_DELAY_MS = Number(process.env.SHUTDOWN_DELAY_MS ?? 5000);

if (!API_TOKEN) {
  console.error('ERROR: API_TOKEN environment variable is required');
  process.exit(1);
}

let shuttingDown = false;

const app = createApp({
  apiToken: API_TOKEN,
  isShuttingDown: () => shuttingDown,
});

const server = app.listen(PORT, () => {
  console.log(`auth-service listening on port ${PORT}`);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received — starting graceful shutdown');
  shuttingDown = true;

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
