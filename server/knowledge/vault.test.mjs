import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createVault } from './vault.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'knowledge-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const vault = createVault(root);
  await vault.init();
  return { root, vault };
}

test('real Markdown create, search, append and rebuild after external changes', async t => {
  const { vault, root } = await fixture(t);
  const note = await vault.write('01-Investment/META.md', '# META\n广告 ROI [[AI|人工智能]]', null);
  assert.equal((await readFile(join(root, note.path), 'utf8')), note.content);
  assert.equal((await vault.search('广告'))[0].path, note.path);
  const added = await vault.append(note.path, '\n新观察', note.version);
  assert.match(added.content, /ROI.*\n新观察/s);
  await writeFile(join(root, note.path), '# META\n外部修改');
  assert.equal((await vault.search('外部修改')).length, 1);
  await assert.rejects(vault.write(note.path, 'old', added.version), { code: 'CONFLICT' });
  assert.match((await vault.read(note.path)).content, /外部修改/);
  assert.equal((await vault.list()).length, 1);
});

test('create cannot overwrite, stale append and parallel writers cannot lose data', async t => {
  const { vault, root } = await fixture(t);
  const note = await vault.write('00-Inbox/today.md', 'start', null);
  await assert.rejects(vault.write(note.path, 'overwrite', null), { code: 'CONFLICT' });
  const other = createVault(root);
  const results = await Promise.allSettled([
    vault.append(note.path, '\none', note.version),
    other.append(note.path, '\ntwo', note.version),
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(results.find(r => r.status === 'rejected').reason.code, 'CONFLICT');
});

test('path traversal, hidden files and symlinks are excluded from all operations', async t => {
  const { vault, root } = await fixture(t);
  const outside = await mkdtemp(join(tmpdir(), 'outside-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(join(outside, 'secret.md'), 'private');
  await symlink(outside, join(root, 'leak'));
  await mkdir(join(root, '.obsidian'));
  await writeFile(join(root, '.obsidian', 'private.md'), 'private');
  await symlink(join(outside, 'secret.md'), join(root, 'shortcut.md'));
  for (const path of ['../secret.md', '/secret.md', '.obsidian/private.md', 'leak/secret.md', 'shortcut.md', 'a\\b.md', 'x.txt']) {
    await assert.rejects(vault.read(path));
    await assert.rejects(vault.write(path, 'bad', null));
  }
  assert.deepEqual(await vault.list(), []);
  assert.deepEqual(await vault.search('private'), []);
  assert.equal(await readFile(join(outside, 'secret.md'), 'utf8'), 'private');
});

test('links resolve aliases and headings, prefer siblings, report ambiguity and backlinks', async t => {
  const { vault } = await fixture(t);
  await vault.write('02-AI/AI.md', '# AI', null);
  await vault.write('01-Investment/Topic.md', '# Topic', null);
  await vault.write('03-Development/Topic.md', '# Topic', null);
  await vault.write('00-Inbox/test.md', '[[AI#RAG|别名]] [[Topic]] [[不存在]] [[01-Investment/Topic]]', null);
  const links = await vault.related('00-Inbox/test.md');
  assert.equal(links.outgoing[0].path, '02-AI/AI.md');
  assert.equal(links.outgoing[1].status, 'ambiguous');
  assert.equal(links.outgoing[2].status, 'missing');
  assert.equal(links.outgoing[3].path, '01-Investment/Topic.md');
  assert.equal((await vault.related('02-AI/AI.md')).backlinks[0].path, '00-Inbox/test.md');
  await vault.write('01-Investment/source.md', '[[Topic]]', null);
  assert.equal((await vault.related('01-Investment/source.md')).outgoing[0].path, '01-Investment/Topic.md');
});

test('initialization preserves files; invalid content and oversized notes are rejected', async t => {
  const { vault } = await fixture(t);
  const n = await vault.write('home.md', '# existing', null);
  await vault.init();
  assert.equal((await vault.read(n.path)).content, n.content);
  await assert.rejects(vault.write('bad.md', {}, null), { code: 'INVALID' });
  await assert.rejects(vault.write('big.md', 'x'.repeat(1024 * 1024 + 1), null), { code: 'TOO_LARGE' });
});

test('explicit Markdown extension and dotted note names resolve as notes', async t => {
  const { vault } = await fixture(t);
  await vault.write('release-1.0.md', '# release', null);
  await vault.write('source.md', '[[release-1.0.md]] [[release-1.0]] [[report.pdf]]', null);
  const relations = await vault.related('source.md');
  assert.equal(relations.outgoing[0].path, 'release-1.0.md');
  assert.equal(relations.outgoing[1].path, 'release-1.0.md');
  assert.equal(relations.outgoing[2].status, 'attachment');
});

test('unsupported legacy filenames do not break the rest of an existing Vault', async t => {
  const { root, vault } = await fixture(t);
  await writeFile(join(root, 'legacy:note.md'), 'legacy');
  await vault.write('valid.md', '# Valid', null);
  assert.equal((await vault.list()).length, 1);
  assert.equal((await vault.search('Valid')).length, 1);
  assert.equal(await readFile(join(root, 'legacy:note.md'), 'utf8'), 'legacy');
});
