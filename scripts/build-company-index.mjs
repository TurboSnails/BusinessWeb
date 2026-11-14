// ⌘K 面板用的公司搜索索引：public/data/company-index.json
// 公司列表和 UI 一致（companyCore.resolveMarket 合并手工研究页 + public/data/{m}.json 程序化补全），
// 只保留搜索要用的字段，避免为了搜索去加载 cn.json 这类大文件。
// 输出不带时间戳，内容不变就不产生 diff；生成失败时保留已提交的旧文件，不让构建失败。
// 拼音：含汉字的名称在构建时用 pinyin-pro（devDependency，不进前端包）算出首字母 p 和全拼 q（无声调无空格），
// 供 ⌘K 输入 txkg / tengxun 找到腾讯控股；pinyin-pro 按词组处理多音字（重庆 chong、长江 chang、银行 hang）。
//
// 同一次合并顺带生成 public/data/company-refs.json：每家公司的名称、研究评级和公司页价格锚点（marketRefresh），
// 供服务端每日候选池提醒邮件（server/functions/candidate-alerts-digest.js）按站内同一口径判断，不用下载 cn.json 这类大文件。
import { readFile, writeFile, rm, mkdtemp } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { pinyin, customPinyin } from 'pinyin-pro'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public/data/company-index.json')
const REFS_OUT = join(ROOT, 'public/data/company-refs.json')
const MARKETS = ['us', 'ndx', 'adr', 'hk', 'cn']

async function collectCompanies() {
  const { build } = await import('esbuild')
  const entry = `
    import { resolveMarket } from './companyCore'
    export async function collect(markets, readJson) {
      const out = []
      for (const m of markets) {
        const r = await resolveMarket(m)
        for (const c of r.merge(readJson(m))) out.push({ c: c.code, n: c.name, m: c.market, s: c.sector || '', r: c.rating || '', q: c.marketRefresh })
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

// pinyin-pro 词库在公司名上读错的个别多音字：公司名里的「都」都是地名读 dū（成都、洪都、大都会），
// 厦钨新能的「厦」读 xià，藏格矿业的「藏」读 zàng（西藏）
customPinyin({ 都: 'dū', 厦钨: 'xià wū', 藏格: 'zàng gé' })

const CJK = /[\u3400-\u9fff\uf900-\ufaff]/

/**
 * 名称的拼音首字母和全拼（小写、无声调、ü 写 v）；名称不含汉字返回 null。
 * 汉字以外只保留英文字母和数字（万科A → wka / wankea），去掉开头的 *ST / ST 风险警示标记。
 */
export function namePinyin(name) {
  const text = String(name || '').trim().replace(/^\*?ST\s*/i, '')
  if (!CJK.test(text)) return null
  let p = ''
  let q = ''
  for (const t of pinyin(text, { type: 'all', toneType: 'none', v: true, nonZh: 'consecutive' })) {
    if (t.isZh && t.pinyin) {
      const py = t.pinyin.toLowerCase().replace(/[^a-z]/g, '')
      p += py[0] || ''
      q += py
    } else {
      const raw = t.origin.toLowerCase().replace(/[^a-z0-9]/g, '')
      p += raw
      q += raw
    }
  }
  return p ? { p, q } : null
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
    const py = namePinyin(name)
    items.push({ c: code, n: name, m: r.m, ...(r.s ? { s: String(r.s) } : {}), ...(py ? py : {}) })
  }
  return items
}

/** 提醒邮件用的参考数据：键 market:code；q 只保留价位判断要用的 marketRefresh 字段（同 Company.marketRefresh） */
export function toRefs(rows) {
  const items = {}
  for (const r of rows) {
    const code = String(r.c || '').trim()
    if (!code || !MARKETS.includes(r.m)) continue
    const key = `${r.m}:${code}`
    if (Object.hasOwn(items, key)) continue
    const q = r.q && Number.isFinite(r.q.price) && r.q.price > 0 && /^\d{4}-\d{2}-\d{2}$/.test(r.q.priceDate ?? '')
      ? { price: r.q.price, priceDate: r.q.priceDate, ...(r.q.currency ? { currency: r.q.currency } : {}), source: String(r.q.source ?? ''), ...(r.q.tradability ? { tradability: r.q.tradability } : {}) }
      : undefined
    items[key] = { n: String(r.n || '').trim(), ...(r.r ? { r: String(r.r) } : {}), ...(q ? { q } : {}) }
  }
  return items
}
export const serializeRefs = items => `{"version":1,"items":{\n${Object.entries(items).map(([k, v]) => `${JSON.stringify(k)}:${JSON.stringify(v)}`).join(',\n')}\n}}\n`

async function writeIfChanged(file, text, label) {
  let prev = ''
  try { prev = await readFile(file, 'utf8') } catch { /* 首次生成 */ }
  if (prev === text) return console.log(`[company-index] ${label} 未变化`)
  await writeFile(file, text)
  console.log(`[company-index] 已写入 ${label}，${(Buffer.byteLength(text) / 1024).toFixed(1)} KB`)
}

// 每家公司一行，方便看 diff
export const serialize = items => `{"version":1,"count":${items.length},"items":[\n${items.map(i => JSON.stringify(i)).join(',\n')}\n]}\n`

async function main() {
  let rows, items
  try {
    rows = await collectCompanies()
    items = toIndex(rows)
    if (!items.length) throw new Error('公司列表为空')
  } catch (e) {
    console.warn(`[company-index] 生成失败，保留现有文件：${e.message}`)
    return
  }
  await writeIfChanged(OUT, serialize(items), `company-index.json（${items.length} 家）`)
  await writeIfChanged(REFS_OUT, serializeRefs(toRefs(rows)), 'company-refs.json')
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) await main()
