import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

function startApp({ inventoryClient, isShuttingDown = () => false } = {}) {
  const app = createApp({
    inventoryClient: inventoryClient ?? { listItems: async () => [] },
    isShuttingDown,
  });
  return new Promise((resolve, reject) => {
    const server = app.listen(0, () => {
      const { port } = server.address();
      resolve({ server, url: `http://localhost:${port}` });
    });
    server.once('error', reject);
  });
}

function stopServer(server) {
  return new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(resolve);
  });
}

describe('GET /health', () => {
  let server, url;
  before(async () => { ({ server, url } = await startApp()); });
  after(() => stopServer(server));

  it('returns 200 with status ok', async () => {
    const res = await fetch(`${url}/health`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: 'ok' });
  });
});

describe('GET /ready', () => {
  it('returns 200 when the service is running normally', async () => {
    const { server, url } = await startApp({ isShuttingDown: () => false });
    try {
      const res = await fetch(`${url}/ready`);
      assert.equal(res.status, 200);
    } finally {
      await stopServer(server);
    }
  });

  it('returns 503 during shutdown', async () => {
    const { server, url } = await startApp({ isShuttingDown: () => true });
    try {
      const res = await fetch(`${url}/ready`);
      assert.equal(res.status, 503);
    } finally {
      await stopServer(server);
    }
  });

  it('returns 200 even when the inventory service would fail', async () => {
    const { server, url } = await startApp({
      inventoryClient: { listItems: async () => { throw new Error('ECONNREFUSED'); } },
      isShuttingDown: () => false,
    });
    try {
      const res = await fetch(`${url}/ready`);
      assert.equal(res.status, 200);
    } finally {
      await stopServer(server);
    }
  });
});

describe('GET /summary', () => {
  it('returns correct totals for a list of items', async () => {
    const items = [
      { id: 1, name: 'widget', quantity: 5 },
      { id: 2, name: 'gadget', quantity: 3 },
    ];
    const { server, url } = await startApp({
      inventoryClient: { listItems: async () => items },
    });
    try {
      const res = await fetch(`${url}/summary`);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { totalItems: 2, totalQuantity: 8 });
    } finally {
      await stopServer(server);
    }
  });

  it('returns zero totals for an empty list', async () => {
    const { server, url } = await startApp({
      inventoryClient: { listItems: async () => [] },
    });
    try {
      const res = await fetch(`${url}/summary`);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { totalItems: 0, totalQuantity: 0 });
    } finally {
      await stopServer(server);
    }
  });

  it('returns 503 when the inventory service is unavailable', async () => {
    const { server, url } = await startApp({
      inventoryClient: { listItems: async () => { throw new Error('inventory unreachable'); } },
    });
    try {
      const res = await fetch(`${url}/summary`);
      assert.equal(res.status, 503);
    } finally {
      await stopServer(server);
    }
  });
});
