import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createVault } from './vault.mjs';
import { createKnowledgeServer } from './http.mjs';
import { isLocalKnowledgeRequest } from './local-access.mjs';

const token = 'test-secret-'.repeat(4);
async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'knowledge-http-'));
  const vault = createVault(root);
  await vault.init();
  const server = createKnowledgeServer({ vault, token });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  t.after(async () => { await new Promise(r => server.close(r)); await rm(root, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}/api/knowledge`;
  const vaultId = (await vault.status()).vaultId;
  const call = (path, method = 'GET', data) => fetch(base + path, { method, headers: { Authorization: `Bearer ${token}`, ...(data ? { 'Content-Type': 'application/json' } : {}) }, body: data ? JSON.stringify({ vaultId, ...data }) : undefined });
  return { base, call };
}

test('HTTP authenticates reads and writes, rejects foreign origins, reports conflicts', async t => {
  const { base, call } = await fixture(t);
  assert.equal((await fetch(base + '/status')).status, 401);
  assert.equal((await fetch(base + '/status', { headers: { Authorization: `Bearer ${token}`, Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await call('/status')).status, 200);
  const note = await (await call('/note', 'PUT', { path: 'test.md', content: '# Test', version: null })).json();
  assert.equal(note.path, 'test.md');
  assert.equal((await call('/note?path=test.md')).status, 200);
  assert.equal((await call('/note', 'PUT', { path: 'test.md', content: 'stale', version: null })).status, 409);
  assert.equal((await call('/note', 'PUT', { path: '../leak.md', content: 'bad', version: null })).status, 403);
  assert.equal((await call('/note', 'PUT', { path: 'x.md', content: 'no-version' })).status, 400);
  assert.equal((await call('/search?q=Test')).status, 200);
});

test('Inbox append validates dates and preserves earlier entries', async t => {
  const { call } = await fixture(t);
  const first = await (await call('/inbox', 'POST', { date: '2026-10-05', content: 'first', version: null })).json();
  const second = await (await call('/inbox', 'POST', { date: '2026-10-05', content: 'second', version: first.version })).json();
  assert.match(second.content, /first[\s\S]*second/);
  assert.equal((await call('/inbox', 'POST', { date: '2026-02-30', content: 'bad', version: null })).status, 400);
  assert.equal((await call('/inbox', 'POST', { date: '../escape', content: 'bad', version: null })).status, 400);
  assert.equal((await call('/inbox', 'POST', { date: '2026-10-05', content: 'third', version: first.version })).status, 409);
});

test('proxy guard permits only loopback connections with matching origin and host', () => {
  const req = (host, origin, address = '127.0.0.1') => ({ headers: { host, origin }, socket: { remoteAddress: address } });
  assert.equal(isLocalKnowledgeRequest(req('localhost:5173', 'http://localhost:5173')), true);
  assert.equal(isLocalKnowledgeRequest(req('localhost:5173', 'http://evil.example')), false);
  assert.equal(isLocalKnowledgeRequest(req('localhost:5173', 'http://localhost:5173', '192.168.1.2')), false);
  assert.equal(isLocalKnowledgeRequest(req('evil.example:5173')), false);
  assert.equal(isLocalKnowledgeRequest(req('127.0.0.1:5173', undefined, '::ffff:127.0.0.1')), true);
  assert.equal(isLocalKnowledgeRequest(req('localhost:5173', 'null')), false);
});

test('mutations reject missing or mismatched Vault identity, including new notes', async t => {
  const { call } = await fixture(t);
  const status = await (await call('/status')).json();
  assert.match(status.vaultId, /^[a-f0-9]{64}$/);
  assert.equal((await call('/note', 'PUT', { path: 'x.md', content: 'wrong vault', version: null, vaultId: 'f'.repeat(64) })).status, 409);
  assert.equal((await call('/note', 'PUT', { path: 'x.md', content: 'no identity', version: null, vaultId: null })).status, 400);
  assert.equal((await call('/inbox', 'POST', { date: '2026-10-05', content: 'wrong vault', version: null, vaultId: 'f'.repeat(64) })).status, 409);
});
