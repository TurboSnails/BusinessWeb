// 同花顺 · ETF资金：交易所每日 ETF 份额 × 收盘价 → 申购净流入；中证指数定期调整名单。
// 用法：node scripts/ths-etf.mjs              日常：重抓最近 6 个交易日份额（深交所 T 日晚间值次日早间会修订），补当日收盘价
//       node scripts/ths-etf.mjs --backfill   回补最近 62 个交易日（上交所逐日、深交所区间 xlsx、东财日 K 价格）
// 份额与价格都是带日期的数据源；目标日任一交易所未公布时不写文件，保留上一份。
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  BROAD_ETFS, CSI_LIST_URL, EM_GROUPS, REBALANCE_TITLE, SZSE_REFERER, buildBroad, buildMarket, buildRebalance, classify, csiDetailUrl,
  emListUrl, klineUrl, makeFlow, parseKline, parseSse, parseSzseRows, parseTencent, readXlsxRows, sseUrl, szseUrl, targetDate,
  tencentUrl, tradingDaysBack, validDate,
} from './ths-etf-lib.mjs'

const OUT = 'public/data/ths-tab-etf.json'
const RAW = 'data-raw/ths-tab-etf'
const DAYS_DIR = `${RAW}/days`
const META = `${RAW}/meta.json`
const CSI_DIR = `${RAW}/csi`
const backfill = process.argv.includes('--backfill')
const WINDOW = backfill ? 62 : 6
const KEEP = 80
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a)
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function http(url, { headers = {}, as = 'json', retries = 2, timeout = 25000, method = 'GET', body } = {}) {
  let last
  for (let i = 0; i <= retries; i += 1) {
    try {
      const res = await fetch(url, { method, body, headers: { 'User-Agent': UA, ...headers }, signal: AbortSignal.timeout(timeout) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      if (as === 'buffer') return Buffer.from(await res.arrayBuffer())
      if (as === 'gbk') return new TextDecoder('gbk').decode(await res.arrayBuffer())
      const text = await res.text()
      if (as === 'text') return text
      if (/^\s*</.test(text)) throw new Error('返回 HTML 而非 JSON')
      return JSON.parse(text)
    } catch (e) { last = e; if (i < retries) await sleep(800 * (i + 1)) }
  }
  throw last
}
async function pool(items, n, fn) {
  let next = 0
  await Promise.all(Array.from({ length: n }, async () => { while (next < items.length) { const i = next++; await fn(items[i], i) } }))
}
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return d } }
const writeJson = (f, data) => {
  fs.mkdirSync(path.dirname(f), { recursive: true })
  const text = JSON.stringify(data) + '\n'
  if (fs.existsSync(f) && fs.readFileSync(f, 'utf8') === text) return
  fs.writeFileSync(`${f}.tmp`, text); fs.renameSync(`${f}.tmp`, f)
}

function loadDays() {
  const days = {}
  if (!fs.existsSync(DAYS_DIR)) return days
  for (const f of fs.readdirSync(DAYS_DIR)) {
    const d = f.replace(/\.json$/, '')
    if (!validDate(d)) continue
    const x = readJson(path.join(DAYS_DIR, f), null)
    if (x?.date === d) days[d] = { date: d, shares: x.shares ?? {}, close: x.close ?? {}, src: x.src ?? {}, seeded: !!x.seeded }
  }
  return days
}

async function fetchMeta(fallbackNames) {
  const meta = {}
  try {
    for (const g of EM_GROUPS) {
      for (let pn = 1, total = Infinity; (pn - 1) * 100 < total && pn <= 30; pn += 1) {
        const j = await http(emListUrl(g, pn), { headers: { Referer: 'https://quote.eastmoney.com/' } })
        total = j?.data?.total ?? 0
        const rows = Array.isArray(j?.data?.diff) ? j.data.diff : Object.values(j?.data?.diff ?? {})
        if (!rows.length) break
        for (const r of rows) { const code = String(r.f12 ?? ''); const name = String(r.f14 ?? '').trim(); if (/^\d{6}$/.test(code) && name) meta[code] = { name, cat: classify(name, g) } }
      }
    }
  } catch (e) { log(`⚠ 东方财富 ETF 清单不可用（${e.message}），名称/分类改用交易所简称`) }
  const old = readJson(META, {})
  for (const [code, name] of Object.entries(fallbackNames)) if (!meta[code]) meta[code] = old[code]?.name ? old[code] : { name, cat: classify(name) }
  return meta
}

function pdfText(buf) {
  const r = spawnSync('python3', ['-I', 'scripts/market-cycle-pdf-text.py'], { input: buf, maxBuffer: 20 * 1024 * 1024, timeout: 60000 })
  if (r.status !== 0) return null
  try { return JSON.parse(r.stdout.toString('utf8')).pages.join('\n') } catch { return null }
}

async function fetchRebalance() {
  const list = await http(CSI_LIST_URL, { method: 'POST', headers: { 'Content-Type': 'application/json;charset=UTF-8', Referer: 'https://www.csindex.com.cn/' }, body: JSON.stringify({ lang: 'cn', page: { key: '', page: 1, rows: 100 }, classList: [], indexList: [], relatedTopics: [], typeList: [] }) })
  if (list?.code !== '200' || !Array.isArray(list.data)) throw new Error('中证公告列表异常')
  const anns = list.data.filter(a => REBALANCE_TITLE.test(a.title ?? '') && validDate(a.publishDate)).sort((a, b) => b.publishDate.localeCompare(a.publishDate)).slice(0, 3)
  const out = []
  for (const a of anns) {
    const det = await http(csiDetailUrl(a.id), { headers: { Referer: 'https://www.csindex.com.cn/' } })
    const d = det?.data
    if (!d || String(d.id) !== String(a.id)) throw new Error(`中证公告详情异常 ${a.id}`)
    const pdf = (d.enclosureList ?? []).find(e => /\.pdf$/i.test(e.fileUrl ?? ''))
    const cache = `${CSI_DIR}/${a.id}.txt`
    let text = fs.existsSync(cache) ? fs.readFileSync(cache, 'utf8') : null
    if (!text && pdf) {
      try {
        const buf = await http(encodeURI(pdf.fileUrl), { as: 'buffer', timeout: 60000 })
        text = pdfText(buf)
        if (text) { fs.mkdirSync(CSI_DIR, { recursive: true }); fs.writeFileSync(cache, text) }
      } catch (e) { log(`⚠ 附件下载失败 ${a.id}：${e.message}`) }
    }
    const item = buildRebalance({ ...a, attachmentUrl: pdf?.fileUrl ?? null }, d.content, text)
    log(`调仓公告 ${a.publishDate} ${a.title}：${item.status}（生效 ${item.effectiveDate}）`)
    out.push(item)
  }
  return out
}

async function main() {
  const asOf = process.env.DATE && validDate(process.env.DATE) ? process.env.DATE : targetDate()
  const dates = tradingDaysBack(asOf, WINDOW)
  const days = loadDays()
  log(`目标交易日 ${asOf}，窗口 ${dates[0]} ~ ${asOf}`)

  // 1) 份额：上交所逐日（回补时已存在且非最近 6 日的跳过）
  const recent = new Set(tradingDaysBack(asOf, 6))
  const sse = {}
  await pool(dates.filter(d => recent.has(d) || !days[d]?.src?.sse), 4, async (d) => {
    try { sse[d] = parseSse(await http(sseUrl(d), { headers: { Referer: 'https://www.sse.com.cn/' } }), d) } catch (e) { log(`⚠ 上交所 ${d}：${e.message}`); sse[d] = undefined }
  })
  if (!sse[asOf]) { log(`上交所 ${asOf} ETF 份额尚未公布，不写文件`); return }
  // 深交所区间 xlsx
  const buf = await http(szseUrl(dates[0], asOf), { as: 'buffer', headers: { Referer: SZSE_REFERER }, timeout: 90000 })
  const szse = parseSzseRows(readXlsxRows(buf))
  if (!szse[asOf] || Object.keys(szse[asOf]).length < 300) { log(`深交所 ${asOf} ETF 份额尚未公布，不写文件`); return }
  for (const d of Object.keys(szse)) if (!dates.includes(d)) throw new Error(`深交所返回了窗口外/非交易日日期 ${d}`)

  const names = {}
  for (const d of dates) {
    const a = sse[d]; const b = szse[d]
    if (!a && !b) continue
    const day = days[d] ?? { date: d, shares: {}, close: {}, src: {} }
    if (a) { for (const [c, v] of Object.entries(a)) { day.shares[c] = v.shares; names[c] ??= v.name } day.src.sse = true }
    if (b) { for (const [c, v] of Object.entries(b)) { day.shares[c] = v.shares; names[c] ??= v.name } day.src.szse = true }
    days[d] = day
  }

  // 2) 价格：目标日用腾讯（时间戳校验），其余缺口用东财日 K
  const codes = Object.keys(days[asOf].shares)
  for (let i = 0; i < codes.length; i += 60) {
    const batch = codes.slice(i, i + 60)
    try { Object.assign(days[asOf].close, parseTencent(await http(tencentUrl(batch), { as: 'gbk' }), asOf)) } catch (e) { log(`⚠ 腾讯行情：${e.message}`) }
  }
  const need = new Map()
  for (const d of dates) {
    const day = days[d]; const prev = days[tradingDaysBack(d, 2)[0]]
    if (!day || !prev) continue
    for (const [c, s] of Object.entries(day.shares)) if (Number.isFinite(prev.shares[c]) && prev.shares[c] !== s && !Number.isFinite(day.close[c])) need.set(c, [...(need.get(c) ?? []), d])
  }
  for (const b of BROAD_ETFS) if (!Number.isFinite(days[asOf].close[b.code]) && days[asOf].shares[b.code] !== undefined) need.set(b.code, [...new Set([...(need.get(b.code) ?? []), asOf])])
  log(`需补收盘价：${need.size} 只`)
  let kfail = 0
  await pool([...need.keys()], 8, async (code) => {
    const want = need.get(code)
    try {
      const back = tradingDaysBack(asOf, 120).reverse().indexOf(want.slice().sort()[0])
      const k = parseKline(await http(klineUrl(code, back < 0 ? 120 : back + 3), { headers: { Referer: 'https://quote.eastmoney.com/' } }), code)
      for (const d of want) if (k[d] !== undefined) days[d].close[code] = k[d]
    } catch { kfail += 1 }
  })
  if (kfail) log(`⚠ 日 K 失败 ${kfail} 只（对应流入记为缺失）`)

  // 3) 名称/分类、调仓
  const meta = await fetchMeta(names)
  let rebalance = readJson(OUT, null)?.rebalance ?? []
  try { rebalance = await fetchRebalance() } catch (e) { log(`⚠ 指数调仓：${e.message}（沿用上一份）`) }

  // 4) 汇总与校验
  const flow = makeFlow(days)
  const nameOf = Object.fromEntries(Object.entries(meta).map(([c, m]) => [c, m.name]))
  const broad = buildBroad(asOf, days, nameOf, flow)
  const market = buildMarket(asOf, days, meta, flow)
  const coreMissing = broad.list.filter(r => r.flow1 === null && r.shares !== null)
  if (coreMissing.length > 3) throw new Error(`宽基名单当日流入缺失过多：${coreMissing.map(r => r.code).join(',')}`)
  if (backfill) writeJson(`${RAW}/backfill.json`, { ranAt: new Date().toISOString(), from: dates[0], to: asOf })
  const bf = readJson(`${RAW}/backfill.json`, null)
  const data = {
    version: 1, asOf, generatedAt: new Date().toISOString(),
    historyStart: Object.keys(days).filter(d => d <= asOf).sort()[0] ?? asOf,
    backfill: bf && validDate(bf.from) && validDate(bf.to) ? { from: bf.from, to: bf.to } : null,
    broad, market, rebalance,
    sources: [
      { label: '上交所 · ETF 规模（每日份额）', url: sseUrl(asOf) },
      { label: '深交所 · 基金规模（每日份额）', url: 'https://www.szse.cn/market/fund/volume/etf/index.html' },
      { label: '腾讯行情 · ETF 收盘价', url: 'https://qt.gtimg.cn/q=sh510300' },
      { label: '东方财富 · ETF 日 K（不复权收盘价）', url: klineUrl('510300', 5) },
      { label: '中证指数 · 公告', url: 'https://www.csindex.com.cn/#/about/newsCenter' },
    ],
  }

  // 5) 落盘
  for (const d of dates) if (days[d]) writeJson(`${DAYS_DIR}/${d}.json`, { date: d, src: days[d].src, shares: days[d].shares, close: days[d].close })
  const keep = new Set(tradingDaysBack(asOf, KEEP))
  for (const f of fs.existsSync(DAYS_DIR) ? fs.readdirSync(DAYS_DIR) : []) if (!keep.has(f.replace(/\.json$/, ''))) fs.unlinkSync(path.join(DAYS_DIR, f))
  writeJson(META, meta)
  writeJson(OUT, data)
  log(`写盘完成 ${asOf}：宽基当日 ${broad.total.flow1 === null ? '—' : (broad.total.flow1 / 1e8).toFixed(2)} 亿，全市场 ${market.n} 只`)
}

main().catch(e => { console.error(`ETF资金采集失败，未发布：${e.message}`); process.exitCode = 1 })
