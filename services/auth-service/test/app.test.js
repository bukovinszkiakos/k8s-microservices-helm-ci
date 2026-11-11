import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

const TEST_TOKEN = 'test-token-flotilla-abc123';

function startApp(opts = {}) {
  const { apiToken = TEST_TOKEN, isShuttingDown = () => false } = opts;
  const app = createApp({ apiToken, isShuttingDown });
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
  it('returns 200 when not shutting down', async () => {
    const { server, url } = await startApp({ isShuttingDown: () => false });
    try {
      const res = await fetch(`${url}/ready`);
      assert.equal(res.status, 200);
    } finally {
      await stopServer(server);
    }
  });

  it('returns 503 while shutting down', async () => {
    const { server, url } = await startApp({ isShuttingDown: () => true });
    try {
      const res = await fetch(`${url}/ready`);
      assert.equal(res.status, 503);
    } finally {
      await stopServer(server);
    }
  });
});

describe('GET /validate', () => {
  let server, url;
  before(async () => { ({ server, url } = await startApp()); });
  after(() => stopServer(server));

  it('returns 200 for a valid token', async () => {
    const res = await fetch(`${url}/validate`, {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { valid: true });
  });

  it('returns 401 for a wrong token', async () => {
    const res = await fetch(`${url}/validate`, {
      headers: { Authorization: 'Bearer wrong-token' },
    });
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { valid: false });
  });

  it('returns 401 when Authorization header is missing', async () => {
    const res = await fetch(`${url}/validate`);
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { valid: false });
  });

  it('returns 401 for a malformed header without Bearer prefix', async () => {
    const res = await fetch(`${url}/validate`, {
      headers: { Authorization: TEST_TOKEN },
    });
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { valid: false });
  });
});
