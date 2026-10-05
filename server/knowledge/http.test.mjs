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
  return { base, call, vault };
}

test('HTTP authenticates reads, rejects foreign origins, reports read-only status', async t => {
  const { base, call, vault } = await fixture(t);
  await vault.write('test.md', '# Test', null);
  assert.equal((await fetch(base + '/status')).status, 401);
  assert.equal((await fetch(base + '/status', { headers: { Authorization: `Bearer ${token}`, Origin: 'https://evil.example' } })).status, 403);
  const status = await (await call('/status')).json();
  assert.equal(status.readOnly, true);
  assert.equal((await call('/note?path=test.md')).status, 200);
  assert.equal((await call('/note?path=../leak.md')).status, 403);
  assert.equal((await call('/search?q=Test')).status, 200);
  assert.equal((await call('/graph')).status, 200);
});

test('web writes are rejected so notes are only edited in Obsidian', async t => {
  const { call, vault } = await fixture(t);
  assert.equal((await call('/note', 'PUT', { path: 'x.md', content: '# X', version: null })).status, 405);
  assert.equal((await call('/inbox', 'POST', { date: '2026-10-05', content: 'idea', version: null })).status, 405);
  assert.equal((await call('/append', 'POST', { path: 'x.md', content: 'more', version: null })).status, 405);
  await assert.rejects(vault.read('x.md'));
  await assert.rejects(vault.read('00-Inbox/2026-10-05.md'));
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
