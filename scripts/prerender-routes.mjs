// 构建后为每个收录页生成独立的 index.html：写入该页的 title / description / canonical / Open Graph，
// 并在 #root 里放一份正文（React 挂载时会替换掉），让不执行 JS 的爬虫也能读到内容。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { marked } from 'marked'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DIST = resolve(ROOT, 'dist')
const ORIGIN = (process.env.VITE_SITE_URL || 'https://business-web-black.vercel.app').replace(/\/+$/, '')

// 复用前端的路由 SEO 表，保证预渲染与运行时一致
const bundled = await build({
  entryPoints: [resolve(ROOT, 'src/utils/seo.ts')], bundle: true, format: 'esm', write: false,
  define: { 'import.meta.env.VITE_SITE_URL': JSON.stringify(ORIGIN) },
})
const { resolveSeo, formatTitle } = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'))

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const template = readFileSync(resolve(DIST, 'index.html'), 'utf8')

const book = new Map()
for (const m of readFileSync(resolve(ROOT, 'src/pages/FirstBook.tsx'), 'utf8').matchAll(/no: '([^']*)', title: '([^']*)', file: '([^']+\.md)', status: '(?:done|draft)'/g)) {
  book.set(m[3], { no: m[1], title: m[2] })
}
const companies = new Map()
for (const market of ['us', 'cn', 'hk', 'adr']) {
  for (const c of JSON.parse(readFileSync(resolve(ROOT, `public/data/${market}.json`), 'utf8'))) companies.set(`/research-notes/${market}/${encodeURIComponent(c.code)}`, c)
}

function describe(path) {
  const seo = resolveSeo(path)
  const file = path.startsWith('/first-book/read/') && decodeURIComponent(path.slice('/first-book/read/'.length))
  const chapter = file && book.get(file)
  if (chapter) {
    return {
      title: `${chapter.title}｜《正念投资》${chapter.no}`,
      description: `《正念投资》${chapter.no}：${chapter.title}。`,
      body: marked.parse(readFileSync(resolve(ROOT, 'public/first-book', file), 'utf8')),
    }
  }
  const c = companies.get(path)
  if (c) {
    const list = (label, items) => items?.length ? `<h2>${label}</h2><ul>${items.map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : ''
    return {
      title: `${c.name}（${c.code}）研究笔记`,
      description: `${c.name}（${c.code}）：${c.headline}`.slice(0, 160),
      body: `<p>${esc(c.headline)}</p>${list('核心逻辑', c.thesis)}${list('风险与证伪', c.risk)}`,
    }
  }
  return { title: seo.title, description: seo.description ?? '', body: seo.description ? `<p>${esc(seo.description)}</p>` : '' }
}

const sitemap = readFileSync(resolve(DIST, 'sitemap.xml'), 'utf8')
const paths = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => new URL(m[1]).pathname).filter(p => p !== '/')

function render(path) {
  const { title, description, body } = describe(path)
  const full = formatTitle(title)
  const url = ORIGIN + path
  return template
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(full)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*"/, `$1${esc(description)}"`)
    .replace(/(<meta property="og:title" content=")[^"]*"/, `$1${esc(full)}"`)
    .replace(/(<meta property="og:description" content=")[^"]*"/, `$1${esc(description)}"`)
    .replace(/(<link rel="canonical" href=")[^"]*"/, `$1${url}"`)
    .replace('<div id="root"></div>', `<div id="root"><main><h1>${esc(title)}</h1>${body}</main></div>`)
}

let count = 0
for (const path of paths) {
  const dir = join(DIST, ...decodeURIComponent(path).split('/').filter(Boolean))
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.html'), render(path))
  count++
}
console.log(`prerender: ${count} pages`)
