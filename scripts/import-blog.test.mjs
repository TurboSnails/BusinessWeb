import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { importBlog } from './import-blog.mjs';

async function fixture(entries) {
  const root = await mkdtemp(path.join(tmpdir(), 'blog-import-'));
  const sourceRoot = path.join(root, 'source');
  const targetRoot = path.join(root, 'target');
  await mkdir(sourceRoot);
  await mkdir(targetRoot);
  const manifestPath = path.join(root, 'manifest.json');
  await writeFile(manifestPath, JSON.stringify(entries));
  return { root, sourceRoot, targetRoot, manifestPath };
}

const entry = (overrides = {}) => ({ slug: 'sample', title: '中文题目', summary: '摘要', category: '投资', tags: [], publishedAt: '2026-10-13', file: 'src/content/blog/posts/sample.md', sourceFile: 'blog/sample.md', status: 'published', ...overrides });

test('empty manifest imports nothing', async () => {
  const options = await fixture([]);
  assert.deepEqual(await importBlog(options), { articles: 0, assets: 0 });
});

test('copies a published Chinese post and its relative image, but skips drafts', async () => {
  const options = await fixture([entry(), entry({ slug: 'draft', file: 'src/content/blog/posts/draft.md', sourceFile: 'blog/draft.md', status: 'draft' })]);
  await mkdir(path.join(options.sourceRoot, 'blog', 'images'), { recursive: true });
  await writeFile(path.join(options.sourceRoot, 'blog', 'sample.md'), '# 中文题目\n![图](images/chart.png)');
  await writeFile(path.join(options.sourceRoot, 'blog', 'draft.md'), '# Draft');
  await writeFile(path.join(options.sourceRoot, 'blog', 'images', 'chart.png'), 'image');
  assert.deepEqual(await importBlog(options), { articles: 1, assets: 1 });
  assert.match(await readFile(path.join(options.targetRoot, 'src/content/blog/posts/sample.md'), 'utf8'), /\/blog\/assets\/sample\/images\/chart\.png/);
  assert.equal(await readFile(path.join(options.targetRoot, 'public/blog/assets/sample/images/chart.png'), 'utf8'), 'image');
  assert.deepEqual(await readdir(path.join(options.targetRoot, 'src/content/blog/posts')), ['sample.md']);
});

test('rejects duplicate slugs and absent publication dates', async () => {
  const duplicate = await fixture([entry(), entry({ sourceFile: 'blog/other.md' })]);
  await assert.rejects(importBlog(duplicate), /duplicate slug/i);
  const undated = await fixture([entry({ publishedAt: undefined })]);
  await assert.rejects(importBlog(undated), /publishedAt/);
});

test('rejects missing local resources and source paths that escape the checkout', async () => {
  const missing = await fixture([entry()]);
  await mkdir(path.join(missing.sourceRoot, 'blog'));
  await writeFile(path.join(missing.sourceRoot, 'blog/sample.md'), '![bad](missing.png)');
  await assert.rejects(importBlog(missing), /missing.png/);
  const escape = await fixture([entry({ sourceFile: '../secret.md' })]);
  await writeFile(path.join(escape.root, 'secret.md'), '# secret');
  await assert.rejects(importBlog(escape), /outside|escape|invalid/i);
  await assert.rejects(readdir(path.join(escape.targetRoot, 'src/content/blog/posts')));
});

test('rewrites a published relative Markdown link and rejects an unpublished target', async () => {
  const options = await fixture([entry(), entry({ slug: 'second', file: 'src/content/blog/posts/second.md', sourceFile: 'blog/second.md' })]);
  await mkdir(path.join(options.sourceRoot, 'blog'));
  await writeFile(path.join(options.sourceRoot, 'blog/sample.md'), '[继续阅读](second.md)');
  await writeFile(path.join(options.sourceRoot, 'blog/second.md'), '# Second');
  await importBlog(options);
  assert.match(await readFile(path.join(options.targetRoot, 'src/content/blog/posts/sample.md'), 'utf8'), /\/blog\/second/);
  await writeFile(path.join(options.sourceRoot, 'blog/sample.md'), '[未发布](private.md)');
  await assert.rejects(importBlog(options), /private.md/);
});
