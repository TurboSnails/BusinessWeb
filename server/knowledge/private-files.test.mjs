import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { createServer, isFileServingAllowed } from 'vite';
import { knowledgePrivateDeny } from './private-files.mjs';

test('Vite denies raw private files through normal root and /@fs paths', async t => {
  const server = await createServer({ configFile: false, logLevel: 'silent', server: { fs: { deny: knowledgePrivateDeny(resolve('private-vault')) } } });
  t.after(() => server.close());
  const defaultFile = resolve('.local/SecondBrain/00-Inbox/开始使用.md');
  assert.equal(isFileServingAllowed(defaultFile, server), false);
  assert.equal(isFileServingAllowed('/@fs' + defaultFile, server), false);
  assert.equal(isFileServingAllowed(resolve('private-vault/note.md'), server), false);
  assert.equal(isFileServingAllowed(resolve('.env'), server), false);
  assert.equal(isFileServingAllowed(resolve('src/App.tsx'), server), true);
});

test('Vault configuration cannot put private data into public, src, or project root', async () => {
  const { validateVaultLocation } = await import('./private-files.mjs');
  for (const path of [resolve('.'), resolve('public/private-brain'), resolve('src/private-brain')]) {
    assert.throws(() => validateVaultLocation(path), /私人 Vault/);
  }
  assert.doesNotThrow(() => validateVaultLocation(resolve('.local/SecondBrain')));
});

test('configured Vault names containing glob characters remain private', async t => {
  const server = await createServer({ configFile: false, logLevel: 'silent', server: { fs: { deny: knowledgePrivateDeny(resolve('private[brain]')) } } });
  t.after(() => server.close());
  assert.equal(isFileServingAllowed(resolve('private[brain]/note.md'), server), false);
});

test('HTTP blocks ordinary, encoded, @fs and raw-module requests for private notes', async t => {
  const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const root = await mkdtemp(join(tmpdir(), 'brain-vite-'));
  const vault = join(root, '.local/SecondBrain');
  await mkdir(vault, { recursive: true });
  await writeFile(join(vault, '私密.md'), 'PRIVATE-NOTE-MUST-NOT-BE-SERVED');
  await writeFile(join(root, 'index.html'), '<main>public app</main>');
  const server = await createServer({ root, configFile: false, logLevel: 'silent', server: { host: '127.0.0.1', port: 0, fs: { deny: knowledgePrivateDeny(vault) } } });
  t.after(async () => { await server.close(); await rm(root, { recursive: true, force: true }); });
  await server.listen();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  for (const path of ['/.local/SecondBrain/私密.md', '/%2elocal/SecondBrain/私密.md', '/.local/SecondBrain/私密.md?raw', '/@fs' + join(vault, '私密.md'), '/@fs' + join(vault, '私密.md') + '?raw']) {
    const response = await fetch(base + path);
    assert.equal(response.status, 403, path);
    assert.ok(!(await response.text()).includes('PRIVATE-NOTE-MUST-NOT-BE-SERVED'));
  }
});
