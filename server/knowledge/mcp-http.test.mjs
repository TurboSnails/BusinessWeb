import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createVault } from './vault.mjs';
import { createMcpHttpServer, scopedReadVault } from './mcp-http.mjs';

test('real HTTP MCP exposes only read tools and enforces auth, host and directory scope', async t => {
  const root = await mkdtemp(join(tmpdir(), 'brain-http-mcp-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const vault = createVault(root); await vault.init();
  await vault.write('01-Investment/A.md', '# Company\n[[05-Life/Secret]]', null);
  await vault.write('05-Life/Secret.md', '# Secret family note', null);
  const token = 'x'.repeat(40);
  const hosts = ['pending'];
  const actual = createMcpHttpServer({ vault, token, prefixes: ['01-Investment'], allowedHosts: hosts });
  actual.listen(0, '127.0.0.1'); await once(actual, 'listening');
  t.after(() => new Promise(resolve => { actual.closeAllConnections(); actual.close(resolve); }));
  const url = new URL(`http://127.0.0.1:${actual.address().port}/mcp`);
  hosts.splice(0, 1, url.host);
  assert.equal((await fetch(url, { method: 'POST' })).status, 401);
  assert.equal((await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, Origin: 'https://foreign.test' } })).status, 403);
  const client = new Client({ name: 'third-party-agent', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(url, { requestInit: { headers: { Authorization: `Bearer ${token}` } } });
  await client.connect(transport); t.after(() => client.close());
  const names = (await client.listTools()).tools.map(t => t.name);
  assert.ok(names.includes('read_note')); assert.ok(!names.includes('write_note')); assert.ok(!names.includes('append_note'));
  const list = await client.callTool({ name: 'list_notes', arguments: {} });
  assert.deepEqual(list.structuredContent.notes.map(n => n.path), ['01-Investment/A.md']);
  const hidden = await client.callTool({ name: 'read_note', arguments: { path: '05-Life/Secret.md' } });
  assert.equal(hidden.isError, true);
  const traverse = await client.callTool({ name: 'read_note', arguments: { path: '01-Investment/../05-Life/Secret.md' } });
  assert.equal(traverse.isError, true);
  const related = await client.callTool({ name: 'find_related_notes', arguments: { path: '01-Investment/A.md' } });
  assert.deepEqual(related.structuredContent.outgoing, []);
  assert.equal((await client.callTool({ name: 'search_knowledge', arguments: { query: 'family' } })).structuredContent.notes.length, 0);
  assert.equal((await client.callTool({ name: 'read_note', arguments: { path: '01-Investment/A.md' } })).structuredContent.content, '# Company\n[[05-Life/Secret]]');
});

test('scope configuration rejects hidden, absolute and traversing prefixes', () => {
  for (const path of ['/etc', '../05-Life', 'Notion//Life', '.local', 'C:']) assert.throws(() => scopedReadVault({}, [path]));
});
