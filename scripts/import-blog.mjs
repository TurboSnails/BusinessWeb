import { readFile, realpath, mkdir, copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const markdownTarget = /^src\/content\/blog\/posts\/([a-z0-9-]+)\.md$/;

function inside(root, relative) {
  if (!relative || path.isAbsolute(relative)) throw new Error(`Invalid path: ${relative}`);
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error(`Path escapes root: ${relative}`);
  return resolved;
}

async function sourcePath(root, relative) {
  const requested = inside(root, relative);
  const actual = await realpath(requested);
  const actualRoot = await realpath(root);
  if (!actual.startsWith(`${actualRoot}${path.sep}`)) throw new Error(`Source path outside checkout: ${relative}`);
  return actual;
}

function validate(entries) {
  if (!Array.isArray(entries)) throw new Error('Blog manifest must be an array');
  const slugs = new Set();
  for (const entry of entries) {
    if (!slugPattern.test(entry.slug || '')) throw new Error(`Invalid slug: ${entry.slug}`);
    if (slugs.has(entry.slug)) throw new Error(`Duplicate slug: ${entry.slug}`);
    slugs.add(entry.slug);
    if (!['published', 'draft'].includes(entry.status)) throw new Error(`Invalid status: ${entry.slug}`);
    if (entry.status !== 'published') continue;
    if (!entry.title || !entry.summary || !entry.category || !Array.isArray(entry.tags)) throw new Error(`Missing metadata: ${entry.slug}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.publishedAt || '') || Number.isNaN(Date.parse(entry.publishedAt))) throw new Error(`Invalid publishedAt: ${entry.slug}`);
    const match = markdownTarget.exec(entry.file || '');
    if (!match || match[1] !== entry.slug) throw new Error(`Invalid file: ${entry.slug}`);
    if (entry.sourceFile) inside('.', entry.sourceFile);
  }
}

function localUrl(raw) {
  return !/^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(raw);
}

export async function importBlog({ sourceRoot, targetRoot, manifestPath }) {
  const entries = JSON.parse(await readFile(manifestPath, 'utf8'));
  validate(entries);
  const canonicalSourceRoot = await realpath(sourceRoot);
  const published = entries.filter((entry) => entry.status === 'published' && entry.sourceFile);
  const bySource = new Map(published.map((entry) => [path.resolve(canonicalSourceRoot, entry.sourceFile), entry.slug]));
  const changes = [];
  for (const entry of published) {
    const source = await sourcePath(canonicalSourceRoot, entry.sourceFile);
    let markdown = await readFile(source, 'utf8');
    const assets = [];
    const replacements = [];
    // Preserve Markdown syntax, changing only URLs in inline links and images.
    const pattern = /(!?\[[^\]]*\]\()([^\s)]+)(\))/g;
    for (const match of markdown.matchAll(pattern)) {
      const url = match[2];
      if (!localUrl(url)) continue;
      const clean = decodeURIComponent(url.split(/[?#]/, 1)[0]);
      const relative = path.relative(canonicalSourceRoot, path.resolve(path.dirname(source), clean));
      const resolved = await sourcePath(canonicalSourceRoot, relative);
      if (/\.md$/i.test(clean)) {
        const slug = bySource.get(resolved);
        if (!slug) throw new Error(`Unpublished or unregistered Markdown link: ${url}`);
        replacements.push([match.index + match[1].length, url.length, `/blog/${slug}`]);
      } else {
        const assetRelative = path.relative(path.dirname(source), resolved).replaceAll(path.sep, '/');
        if (assetRelative.startsWith('../')) throw new Error(`Asset outside post directory: ${url}`);
        assets.push({ source: resolved, target: `public/blog/assets/${entry.slug}/${assetRelative}` });
        replacements.push([match.index + match[1].length, url.length, `/blog/assets/${entry.slug}/${assetRelative}`]);
      }
    }
    for (const [start, length, replacement] of replacements.reverse()) {
      markdown = markdown.slice(0, start) + replacement + markdown.slice(start + length);
    }
    changes.push({ entry, markdown, assets });
  }
  let assets = 0;
  for (const change of changes) {
    const target = inside(targetRoot, change.entry.file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, change.markdown);
    for (const asset of change.assets) {
      const destination = inside(targetRoot, asset.target);
      await mkdir(path.dirname(destination), { recursive: true });
      await copyFile(asset.source, destination);
      assets++;
    }
  }
  return { articles: changes.length, assets };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const sourceIndex = process.argv.indexOf('--source');
  if (sourceIndex < 0 || !process.argv[sourceIndex + 1]) {
    console.error('Usage: npm run blog:import -- --source /path/to/gupiaoWS');
    process.exitCode = 1;
  } else {
    importBlog({ sourceRoot: path.resolve(process.argv[sourceIndex + 1]), targetRoot: process.cwd(), manifestPath: path.resolve('src/content/blog/manifest.json') })
      .then((result) => console.log(`Imported ${result.articles} articles and ${result.assets} assets.`))
      .catch((error) => { console.error(error.message); process.exitCode = 1; });
  }
}
