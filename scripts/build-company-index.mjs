// ⌘K 面板用的公司搜索索引：public/data/company-index.json
// 公司列表和 UI 一致（companyCore.resolveMarket 合并手工研究页 + public/data/{m}.json 程序化补全），
// 只保留搜索要用的字段，避免为了搜索去加载 cn.json 这类大文件。
// 输出不带时间戳，内容不变就不产生 diff；生成失败时保留已提交的旧文件，不让构建失败。
// 拼音首字母：仓库没有拼音库，为了不加依赖暂不生成。
import { readFile, writeFile, rm, mkdtemp } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public/data/company-index.json')
const MARKETS = ['us', 'ndx', 'adr', 'hk', 'cn']

async function collectCompanies() {
  const { build } = await import('esbuild')
  const entry = `
    import { resolveMarket } from './companyCore'
    export async function collect(markets, readJson) {
      const out = []
      for (const m of markets) {
        const r = await resolveMarket(m)
        for (const c of r.merge(readJson(m))) out.push({ c: c.code, n: c.name, m: c.market, s: c.sector || '' })
      }
      return out
    }`
  const res = await build({
    stdin: { contents: entry, resolveDir: join(ROOT, 'src/data'), loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent',
    define: { 'import.meta.env': '{"BASE_URL":"/"}' },
  })
  const dir = await mkdtemp(join(tmpdir(), 'company-index-'))
  const file = join(dir, 'bundle.mjs')
  try {
    await writeFile(file, res.outputFiles[0].text)
    const { collect } = await import(pathToFileURL(file).href)
    const jsonOf = {}
    for (const m of MARKETS) {
      try { jsonOf[m] = JSON.parse(await readFile(join(ROOT, 'public/data', `${m}.json`), 'utf8')) } catch { jsonOf[m] = [] }
    }
    return await collect(MARKETS, m => jsonOf[m])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

export function toIndex(rows) {
  const seen = new Set()
  const items = []
  for (const r of rows) {
    const code = String(r.c || '').trim()
    const name = String(r.n || '').trim()
    if (!code || !name || !MARKETS.includes(r.m)) continue
    const key = `${r.m}:${code}`
    if (seen.has(key)) continue
    seen.add(key)
    items.push({ c: code, n: name, m: r.m, ...(r.s ? { s: String(r.s) } : {}) })
  }
  return items
}

// 每家公司一行，方便看 diff
export const serialize = items => `{"version":1,"count":${items.length},"items":[\n${items.map(i => JSON.stringify(i)).join(',\n')}\n]}\n`

async function main() {
  let items
  try {
    items = toIndex(await collectCompanies())
    if (!items.length) throw new Error('公司列表为空')
  } catch (e) {
    console.warn(`[company-index] 生成失败，保留现有文件：${e.message}`)
    return
  }
  const text = serialize(items)
  let prev = ''
  try { prev = await readFile(OUT, 'utf8') } catch { /* 首次生成 */ }
  if (prev === text) {
    console.log(`[company-index] 未变化（${items.length} 家）`)
    return
  }
  await writeFile(OUT, text)
  console.log(`[company-index] 已写入 ${items.length} 家，${(Buffer.byteLength(text) / 1024).toFixed(1)} KB`)
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await main()
