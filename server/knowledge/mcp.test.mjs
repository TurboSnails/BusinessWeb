import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function fixture(t, root) {
  const dir = root || await mkdtemp(join(tmpdir(), 'brain-mcp-'));
  if (!root) t.after(() => rm(dir, { recursive: true, force: true }));
  const transport = new StdioClientTransport({ command: process.execPath, args: [fileURLToPath(new URL('./mcp.mjs', import.meta.url))], env: { ...process.env, KNOWLEDGE_VAULT: dir }, stderr: 'pipe' });
  const client = new Client({ name: 'knowledge-test', version: '1.0.0' });
  await client.connect(transport);
  t.after(() => client.close());
  const identity = (await client.callTool({ name: 'list_notes', arguments: {} })).structuredContent.vaultId;
  const call = async (name, args) => {
    const result = await client.callTool({ name, arguments: ['write_note', 'append_note'].includes(name) ? { vaultId: identity, ...args } : args });
    return { ...result, data: JSON.parse(result.content[0].text) };
  };
  return { client, call, dir };
}

test('real stdio MCP discovers tools and uses the same Markdown with version checks', async t => {
  const { client, call, dir } = await fixture(t);
  const listed = await client.listTools();
  for (const name of ['search_knowledge', 'read_note', 'find_related_notes', 'search_investment', 'write_note', 'append_note', 'list_notes']) assert.ok(listed.tools.some(tool => tool.name === name));
  const created = await call('write_note', { path: '01-Investment/Companies/COST.md', content: '# Costco\n我的投资研究 [[AI]]', version: null });
  assert.equal(created.isError, undefined);
  assert.equal(await readFile(join(dir, created.data.path), 'utf8'), created.data.content);
  assert.equal((await call('search_knowledge', { query: 'Costco' })).data.notes.length, 1);
  assert.equal((await call('search_investment', { company: 'Costco' })).data.notes.length, 1);
  assert.equal((await call('read_note', { path: created.data.path })).data.version, created.data.version);
  assert.equal((await call('find_related_notes', { path: created.data.path })).data.outgoing[0].status, 'missing');
  const appended = await call('append_note', { path: created.data.path, content: '\n复盘', version: created.data.version });
  assert.match(appended.data.content, /复盘/);
  const wrongVault = await call('write_note', { path: 'new.md', content: 'wrong', version: null, vaultId: 'f'.repeat(64) });
  assert.equal(wrongVault.data.code, 'CONFLICT');
  const conflict = await call('write_note', { path: created.data.path, content: 'stale', version: created.data.version });
  assert.equal(conflict.isError, true);
  assert.equal(conflict.data.code, 'CONFLICT');
  const traversal = await call('read_note', { path: '../secret.md' });
  assert.equal(traversal.isError, true);
});

test('two real MCP agents cannot both append using the same old version', async t => {
  const one = await fixture(t);
  const two = await fixture(t, one.dir);
  const note = await one.call('write_note', { path: 'shared.md', content: 'start', version: null });
  const results = await Promise.all([
    one.call('append_note', { path: 'shared.md', content: '\none', version: note.data.version }),
    two.call('append_note', { path: 'shared.md', content: '\ntwo', version: note.data.version }),
  ]);
  assert.equal(results.filter(r => r.isError).length, 1);
  assert.equal(results.find(r => r.isError).data.code, 'CONFLICT');
});
