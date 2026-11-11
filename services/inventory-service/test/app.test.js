import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

function createFakeDb({ items = [], ping = async () => {} } = {}) {
  return {
    async init() {},
    async listItems() { return [...items]; },
    ping,
    async close() {},
  };
}

function startApp({ db, state } = {}) {
  const app = createApp({
    db: db ?? createFakeDb(),
    authClient: null,
    state: state ?? { initialized: false, shuttingDown: false },
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
  it('returns 503 before initialization', async () => {
    const { server, url } = await startApp({
      state: { initialized: false, shuttingDown: false },
    });
    try {
      const res = await fetch(`${url}/ready`);
      assert.equal(res.status, 503);
    } finally {
      await stopServer(server);
    }
  });

  it('returns 200 after initialization when ping succeeds', async () => {
    const { server, url } = await startApp({
      db: createFakeDb({ ping: async () => {} }),
      state: { initialized: true, shuttingDown: false },
    });
    try {
      const res = await fetch(`${url}/ready`);
      assert.equal(res.status, 200);
    } finally {
      await stopServer(server);
    }
  });

  it('returns 503 when ping fails', async () => {
    const { server, url } = await startApp({
      db: createFakeDb({ ping: async () => { throw new Error('connection lost'); } }),
      state: { initialized: true, shuttingDown: false },
    });
    try {
      const res = await fetch(`${url}/ready`);
      assert.equal(res.status, 503);
    } finally {
      await stopServer(server);
    }
  });
});

describe('GET /items', () => {
  const fixtures = [
    { id: 2, name: 'widget', quantity: 5, created_at: '2026-01-02T00:00:00.000Z' },
    { id: 1, name: 'gadget', quantity: 3, created_at: '2026-01-01T00:00:00.000Z' },
  ];

  let server, url;
  before(async () => {
    ({ server, url } = await startApp({
      db: createFakeDb({ items: fixtures }),
      state: { initialized: true, shuttingDown: false },
    }));
  });
  after(() => stopServer(server));

  it('returns items wrapped in an items array', async () => {
    const res = await fetch(`${url}/items`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body.items), 'body.items should be an array');
    assert.equal(body.items.length, 2);
  });

  it('returns items in newest-first order', async () => {
    const res = await fetch(`${url}/items`);
    const { items } = await res.json();
    assert.equal(items[0].name, 'widget');
    assert.equal(items[1].name, 'gadget');
  });
});
