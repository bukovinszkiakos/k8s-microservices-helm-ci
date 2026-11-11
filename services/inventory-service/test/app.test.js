import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

function createFakeDb({ items = [], ping = async () => {}, onCreateItem } = {}) {
  return {
    async init() {},
    async listItems() { return [...items]; },
    ping,
    async createItem(name, quantity) {
      if (onCreateItem) onCreateItem(name, quantity);
      return { id: 1, name, quantity, created_at: new Date().toISOString() };
    },
    async close() {},
  };
}

function startApp({ db, authClient, state } = {}) {
  const app = createApp({
    db: db ?? createFakeDb(),
    authClient: authClient ?? null,
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

describe('POST /items', () => {
  it('returns 401 without calling auth when Authorization header is missing', async () => {
    let authCalled = false;
    const { server, url } = await startApp({
      authClient: { isAuthorized: async () => { authCalled = true; return true; } },
      state: { initialized: true, shuttingDown: false },
    });
    try {
      const res = await fetch(`${url}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'test', quantity: 1 }),
      });
      assert.equal(res.status, 401);
      assert.equal(authCalled, false, 'auth service must not be called');
    } finally {
      await stopServer(server);
    }
  });

  it('returns 401 when the token is invalid', async () => {
    const { server, url } = await startApp({
      authClient: { isAuthorized: async () => false },
      state: { initialized: true, shuttingDown: false },
    });
    try {
      const res = await fetch(`${url}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer bad-token' },
        body: JSON.stringify({ name: 'test', quantity: 1 }),
      });
      assert.equal(res.status, 401);
    } finally {
      await stopServer(server);
    }
  });

  it('returns 503 when the auth service is unavailable', async () => {
    const { server, url } = await startApp({
      authClient: { isAuthorized: async () => { throw new Error('ECONNREFUSED'); } },
      state: { initialized: true, shuttingDown: false },
    });
    try {
      const res = await fetch(`${url}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer token' },
        body: JSON.stringify({ name: 'test', quantity: 1 }),
      });
      assert.equal(res.status, 503);
    } finally {
      await stopServer(server);
    }
  });

  it('returns 503 when the auth service times out', async () => {
    const { server, url } = await startApp({
      authClient: { isAuthorized: async () => { throw new Error('The operation was aborted due to timeout'); } },
      state: { initialized: true, shuttingDown: false },
    });
    try {
      const res = await fetch(`${url}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer token' },
        body: JSON.stringify({ name: 'test', quantity: 1 }),
      });
      assert.equal(res.status, 503);
    } finally {
      await stopServer(server);
    }
  });

  it('returns 201 with the created item on valid input', async () => {
    const { server, url } = await startApp({
      authClient: { isAuthorized: async () => true },
      state: { initialized: true, shuttingDown: false },
    });
    try {
      const res = await fetch(`${url}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer good-token' },
        body: JSON.stringify({ name: 'widget', quantity: 10 }),
      });
      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.name, 'widget');
      assert.equal(body.quantity, 10);
    } finally {
      await stopServer(server);
    }
  });

  it('inserts trimmed name and correct quantity', async () => {
    let capturedName, capturedQuantity;
    const { server, url } = await startApp({
      db: createFakeDb({ onCreateItem: (name, qty) => { capturedName = name; capturedQuantity = qty; } }),
      authClient: { isAuthorized: async () => true },
      state: { initialized: true, shuttingDown: false },
    });
    try {
      const res = await fetch(`${url}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer good-token' },
        body: JSON.stringify({ name: '  trimmed  ', quantity: 7 }),
      });
      assert.equal(res.status, 201);
      assert.equal(capturedName, 'trimmed');
      assert.equal(capturedQuantity, 7);
    } finally {
      await stopServer(server);
    }
  });

  describe('input validation', () => {
    let server, url;
    before(async () => {
      ({ server, url } = await startApp({
        authClient: { isAuthorized: async () => true },
        state: { initialized: true, shuttingDown: false },
      }));
    });
    after(() => stopServer(server));

    async function post(body) {
      return fetch(`${url}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer token' },
        body: JSON.stringify(body),
      });
    }

    it('returns 400 for empty name', async () => {
      assert.equal((await post({ name: '', quantity: 1 })).status, 400);
    });

    it('returns 400 for whitespace-only name', async () => {
      assert.equal((await post({ name: '   ', quantity: 1 })).status, 400);
    });

    it('returns 400 for name longer than 100 characters', async () => {
      assert.equal((await post({ name: 'a'.repeat(101), quantity: 1 })).status, 400);
    });

    it('returns 400 for negative quantity', async () => {
      assert.equal((await post({ name: 'item', quantity: -1 })).status, 400);
    });

    it('returns 400 for non-integer quantity', async () => {
      assert.equal((await post({ name: 'item', quantity: 1.5 })).status, 400);
    });

    it('returns 400 for quantity above 1,000,000', async () => {
      assert.equal((await post({ name: 'item', quantity: 1_000_001 })).status, 400);
    });
  });
});
