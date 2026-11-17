// 同花顺 · ETF资金：交易所每日 ETF 份额 × 收盘价 → 申购净流入；中证指数定期调整名单。
// 用法：node scripts/ths-etf.mjs              日常：重抓最近 6 个交易日份额（深交所 T 日晚间值次日早间会修订），补当日收盘价
//       node scripts/ths-etf.mjs --backfill   回补最近 62 个交易日（上交所逐日、深交所区间 xlsx、东财日 K 价格）
// 份额与价格都是带日期的数据源；目标日任一交易所未公布时不写文件，保留上一份。
// 例外：深交所站点连不上（GitHub Actions 境外 IP 被拒）时降级——深交所份额改用腾讯行情总份额字段补上一交易日（日期按规则推断并与存档交叉校验），
// 目标日只发布沪市数据，输出里 exchanges.szse.status = 'unavailable'，页面给出说明；之后境内重跑或次日会补齐。
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  BROAD_ETFS, CSI_LIST_URL, EM_GROUPS, REBALANCE_TITLE, SZSE_REFERER, TENCENT_SHARES, buildBroad, buildMarket, buildRebalance, checkLaggedShares, classify, csiDetailUrl,
  emListUrl, exchangeCount, isExchangeSzse, keepArchive, klineUrl, makeFlow, marketOf, notListed, parseKline, parseSse, parseSzseRows, parseTencent, parseTencentShares,
  pickTencentShares, prevTradingDay, readXlsxRows, shouldReplace, sseOnlyTotal, sseUrl, szseUrl, targetDate, tencentSharesDate, tencentUrl, tradingDaysBack, universeOk, validDate,
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
  // undici 的「fetch failed」不带原因，补上底层错误码与主机名，便于判断是被拒连、超时还是 DNS
  const cause = last?.cause ? `${last.cause.code ?? ''} ${last.cause.message ?? ''}`.trim() : ''
  throw new Error(`${new URL(url).host}：${last?.message ?? last}${cause ? `（${cause}）` : ''}`)
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
    if (x?.date === d) days[d] = { date: d, shares: x.shares ?? {}, close: x.close ?? {}, src: x.src ?? {}, via: x.via ?? {}, seeded: !!x.seeded }
  }
  return days
}

async function fetchEmList() {
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
  return meta
}
function mergeMeta(em, fallbackNames) {
  const meta = { ...em }
  const old = readJson(META, {})
  for (const [code, name] of Object.entries(fallbackNames)) if (!meta[code]) meta[code] = old[code]?.name ? old[code] : { name, cat: classify(name) }
  return meta
}

function pdfText(buf) {
  const r = spawnSync('python3', ['-I', 'scripts/market-cycle-pdf-text.py'], { input: buf, maxBuffer: 20 * 1024 * 1024, timeout: 60000 })
  if (r.status !== 0) return null
  try { return JSON.parse(r.stdout.toString('utf8')).pages.join('\n') } catch { return null }
}

/** 深交所备用：腾讯行情总份额字段 → { [份额日期]: { code: { name, shares } } }；日期推断或交叉校验不过时返回 {}。 */
async function fetchSzseTencent(days, dates, em) {
  const when = tencentSharesDate()
  if (!when) { log('北京 07:00–09:30 行情份额字段可能已换日而时间戳未换，不用腾讯份额'); return {} }
  const d = when.date
  if (!dates.includes(d)) return {}
  if (isExchangeSzse(days[d])) { log(`深交所 ${d} 已有交易所数据，不用腾讯份额覆盖`); return {} }
  // 代码范围：最近一份有深交所数据的存档 + 东财 ETF 清单里的深市代码（含新上市）
  const ref = Object.keys(days).filter(x => x <= d && days[x].src?.szse).sort().at(-1)
  const codes = [...new Set([...Object.keys(days[ref]?.shares ?? {}), ...Object.keys(em)].filter(c => /^\d{6}$/.test(c) && marketOf(c) === 'sz'))]
  const parsed = {}
  for (let i = 0; i < codes.length; i += 60) Object.assign(parsed, parseTencentShares(await http(tencentUrl(codes.slice(i, i + 60)), { as: 'gbk' })))
  const got = pickTencentShares(parsed, when.tsDate)
  const chk = checkLaggedShares(got, days[d], days[prevTradingDay(d)])
  if (!chk.ok) { log(`⚠ 腾讯份额（推断为 ${d}）校验未过：${chk.reason}，不用`); return {} }
  log(`腾讯行情份额：${Object.keys(got).length}/${codes.length} 只，时间戳 ${when.tsDate} → 份额日期 ${d}`)
  return { [d]: got }
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

/** 各交易所份额在目标日的状态与来源（页面据此给出深市缺席/行情推断的说明）。 */
function exchangeStatus(days, asOf, quality, szseErr) {
  const recent = tradingDaysBack(asOf, 20).filter(d => days[d])
  const szseDates = recent.filter(d => days[d].src?.szse)
  const szseToday = !!days[asOf]?.src?.szse && quality.szse > 0
  return {
    sse: { status: 'ok', source: 'sse', date: asOf, n: quality.sse },
    szse: {
      status: szseToday ? 'ok' : 'unavailable', source: szseToday ? (days[asOf].via?.szse ?? 'szse') : null, date: szseDates.at(-1) ?? null, n: quality.szse,
      inferredDates: szseDates.filter(d => days[d].via?.szse === TENCENT_SHARES), reason: szseToday ? null : `深交所站点不可达（${szseErr ?? '未知原因'}）`,
    },
  }
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
  // 深交所区间 xlsx（主源）。GitHub Actions（境外 IP）上 *.szse.cn 全部拒连（2026-11-18 探测：TLS 握手即被重置），
  // 此时改用腾讯行情份额补上一交易日，目标日降级为只发布沪市（见文件头）
  let buf, szseErr = null
  try { buf = await http(szseUrl(dates[0], asOf), { as: 'buffer', headers: { Referer: SZSE_REFERER }, timeout: 90000, retries: 3 }) } catch (e) {
    szseErr = e.message; log(`⚠ 深交所基金规模不可达（${e.message}），改用腾讯行情份额补上一交易日，目标日深市降级`)
  }
  let szse = buf ? parseSzseRows(readXlsxRows(buf)) : {}
  for (const d of Object.keys(szse)) if (!dates.includes(d)) throw new Error(`深交所返回了窗口外/非交易日日期 ${d}`)
  const em = await fetchEmList()
  const szseVia = szseErr ? TENCENT_SHARES : 'szse'
  if (szseErr) { try { szse = await fetchSzseTencent(days, dates, em) } catch (e) { log(`⚠ 腾讯行情份额：${e.message}`); szse = {} } }
  // 条数完整性：与同日已存档（没有则前一交易日存档）的条数比，明显变少视为截断——目标日截断则整份不写，其余日期只是不用这次的数据
  for (const [ex, got] of [['sse', sse], ['szse', szse]]) {
    for (const d of dates) {
      if (!got[d]) continue
      const n = Object.keys(got[d]).length
      const ref = exchangeCount(days[d], ex) ?? exchangeCount(days[prevTradingDay(d)], ex)
      if (!universeOk(n, ref)) { log(`⚠ ${ex} ${d} 只有 ${n} 条（参照 ${ref ?? '无'}），视为不完整`); delete got[d] }
    }
  }
  if (!sse[asOf]) { log(`上交所 ${asOf} ETF 份额尚未公布或不完整，不写文件`); return }
  // 深交所可达但目标日未公布/不完整：照旧等下次；不可达：降级发布（沪市当日 + 深市缺席说明）
  if (!szse[asOf] && !szseErr) { log(`深交所 ${asOf} ETF 份额尚未公布或不完整，不写文件`); return }
  // 同日存档里已有深交所数据（如境内先跑过）时照常使用
  const szseOk = !!szse[asOf] || !!days[asOf]?.src?.szse
  if (!szseOk) {
    log(`深交所 ${asOf} 份额不可用（站点不可达），降级：目标日只发布沪市`)
    if (process.env.GITHUB_ACTIONS) console.log(`::warning::ETF资金：深交所不可达，${asOf} 降级为只发布沪市`)
  }

  const names = {}
  for (const d of dates) {
    const a = sse[d]; const b = szse[d]
    if (!a && !b) continue
    const day = days[d] ?? { date: d, shares: {}, close: {}, src: {}, via: {} }
    if (a) { for (const [c, v] of Object.entries(a)) { day.shares[c] = v.shares; names[c] ??= v.name } day.src.sse = true }
    if (b) { for (const [c, v] of Object.entries(b)) { day.shares[c] = v.shares; names[c] ??= v.name } day.src.szse = true; day.via = { ...day.via, szse: szseVia } }
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
  const meta = mergeMeta(em, names)
  let rebalance = readJson(OUT, null)?.rebalance ?? []
  try { rebalance = await fetchRebalance() } catch (e) { log(`⚠ 指数调仓：${e.message}（沿用上一份）`) }

  // 4) 汇总与校验
  const flow = makeFlow(days)
  const nameOf = Object.fromEntries(Object.entries(meta).map(([c, m]) => [c, m.name]))
  const broad = buildBroad(asOf, days, nameOf, flow)
  const market = buildMarket(asOf, days, meta, flow)
  // 宽基当日流入缺失（含缺份额记录），尚未上市的除外；深市降级时只看沪市名单
  const coreMissing = broad.list.filter(r => r.flow1 === null && !notListed(days, r.code, asOf) && (szseOk || marketOf(r.code) === 'sh'))
  if (!szseOk) broad.partial = { scope: 'sse', ...sseOnlyTotal(broad.list) }
  if (coreMissing.length > 3) throw new Error(`宽基名单当日流入缺失过多：${coreMissing.map(r => r.code).join(',')}`)
  // 全市场：份额有变化却没有收盘价的只数（这些流入为 null，会让排行缺人）；超过 2%（至少 5 只）不发布
  const prevDay = days[prevTradingDay(asOf)]
  const changed = Object.entries(days[asOf].shares).filter(([c, v]) => Number.isFinite(prevDay?.shares?.[c]) && prevDay.shares[c] !== v)
  const priceMissing = changed.filter(([c]) => !Number.isFinite(days[asOf].close[c])).length
  if (priceMissing > Math.max(5, changed.length * 0.02)) throw new Error(`当日缺收盘价 ${priceMissing}/${changed.length} 只，排行不完整`)
  const quality = { sse: Object.keys(sse[asOf]).length, szse: szse[asOf] ? Object.keys(szse[asOf]).length : szseOk ? exchangeCount(days[asOf], 'szse') : 0, changed: changed.length, priceMissing, broadMissing: coreMissing.length }
  const published = readJson(OUT, null)
  if (backfill) writeJson(`${RAW}/backfill.json`, { ranAt: new Date().toISOString(), from: dates[0], to: asOf })
  const bf = readJson(`${RAW}/backfill.json`, null)
  const data = {
    version: 1, asOf, generatedAt: new Date().toISOString(), quality,
    historyStart: Object.keys(days).filter(d => d <= asOf).sort()[0] ?? asOf,
    backfill: bf && validDate(bf.from) && validDate(bf.to) ? { from: bf.from, to: bf.to } : null,
    broad, market, rebalance, exchanges: exchangeStatus(days, asOf, quality, szseErr),
    sources: [
      { label: '上交所 · ETF 规模（每日份额）', url: sseUrl(asOf) },
      { label: '深交所 · 基金规模（每日份额）', url: 'https://www.szse.cn/market/fund/volume/etf/index.html' },
      { label: '腾讯行情 · ETF 收盘价（深交所不可达时也取其总份额字段）', url: 'https://qt.gtimg.cn/q=sh510300' },
      { label: '东方财富 · ETF 日 K（不复权收盘价）', url: klineUrl('510300', 5) },
      { label: '中证指数 · 公告', url: 'https://www.csindex.com.cn/#/about/newsCenter' },
    ],
  }

  // 5) 落盘
  for (const d of dates) if (days[d]) writeJson(`${DAYS_DIR}/${d}.json`, { date: d, src: days[d].src, ...(Object.keys(days[d].via ?? {}).length ? { via: days[d].via } : {}), shares: days[d].shares, close: days[d].close })
  const keep = new Set(tradingDaysBack(asOf, KEEP))
  for (const f of fs.existsSync(DAYS_DIR) ? fs.readdirSync(DAYS_DIR) : []) if (!keepArchive(f.replace(/\.json$/, ''), asOf, keep)) fs.unlinkSync(path.join(DAYS_DIR, f))
  writeJson(META, meta)
  if (!shouldReplace(published, { asOf, quality })) { log(`保留已发布的 ${published.asOf}（${JSON.stringify(published.quality ?? null)}），本次 ${asOf}（${JSON.stringify(quality)}）不替换公开文件`); return }
  writeJson(OUT, data)
  log(`写盘完成 ${asOf}：宽基当日 ${broad.total.flow1 === null ? '—' : (broad.total.flow1 / 1e8).toFixed(2)} 亿，全市场 ${market.n} 只`)
}

main().catch(e => { console.error(`ETF资金采集失败，未发布：${e.message}`); process.exitCode = 1 })
