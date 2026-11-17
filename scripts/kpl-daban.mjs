// 开盘啦 · 打板页数据：每个交易日收盘后运行（.github/workflows/kpl-tabs.yml），生成 public/data/kpl-daban.json。
// 来源：东财涨停 / 炸板 / 跌停 / 昨日涨停 / 次新股池（只能查当天）、新浪全市场分页行情（开高低收）、腾讯报价（逐只确认跌停价）。
// 历史：data-raw/kpl-daban/history.json 存每日涨停名单、炸板名单与昨日涨停股的次日表现（溢价基因样本）；首次运行用每日复盘归档补出早期涨停名单。
// 参考资料（失败不影响当日数据）：涨停股的东财 F10 核心题材要点（data-raw/kpl-daban/f10.json 缓存，30 天内不重抓）；
// 涨停历史检索导出 public/data/kpl-daban-history.json（每日涨停名单 + 名录 data-raw/kpl-daban/stocks.json）。
// 用法：node scripts/kpl-daban.mjs   （FORCE=1 跳过收盘时间检查；FORCE=1 DATE=YYYY-MM-DD 指定日期，只用于排查形状，产出不要提交）
//       REFS_ONLY=1 node scripts/kpl-daban.mjs  只给现有 kpl-daban.json 补题材要点并重新导出涨停历史，不碰行情数据
import fs from 'node:fs'
import { isTradingDay } from './market-mood-lib.mjs'
import {
  attachTopics, buildDaban, buildHistoryExport, f10Code, f10Due, mapDt, mapNew, mapYzt, mapZb, mapZt, mergeStocks, mergeStore, parseF10,
  parseSinaFull, parseTencent, poolRaw, pruneF10, seedFromArchive, touchCandidates,
} from './kpl-daban-lib.mjs'

const OUT = 'public/data/kpl-daban.json'
const RAW = 'data-raw/kpl-daban'
const POOL_TOKEN = '7eea3edcaed734bea9cbfc24409ed989' // 东财公开页面使用的固定参数（与 scripts/market-mood.mjs 相同）
const SINA = 'https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function get(url, { kind = 'json', headers = {} } = {}) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, ...headers }, signal: AbortSignal.timeout(15000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      if (kind === 'text') return await res.text()
      if (kind === 'gbk') return new TextDecoder('gbk').decode(await res.arrayBuffer())
      return await res.json()
    } catch (e) {
      if (attempt >= 2) throw e
      await sleep(2000 * (attempt + 1))
    }
  }
}

const HISTORY_OUT = 'public/data/kpl-daban-history.json'
const readJson = (f, fallback) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return fallback } }
const secidOf = (code) => `${/^6/.test(code) ? 1 : 0}.${code}`

/**
 * 参考资料：给 out.zt 挂 F10 题材要点，更新名录并导出涨停历史。只读写参考文件，任何一步失败都只记日志。
 * fetchDate 为抓取当天（北京日期），用于缓存过期判断。
 */
async function refreshRefs(out, store, fetchDate) {
  let cache = readJson(`${RAW}/f10.json`, {})
  try {
    const due = f10Due(out.zt.map((r) => r.code), cache, fetchDate)
    let ok = 0, fail = 0
    for (const code of due) {
      try {
        const body = await get(`https://emweb.securities.eastmoney.com/PC_HSF10/CoreConception/PageAjax?code=${f10Code(code)}`, { headers: { referer: 'https://emweb.securities.eastmoney.com/' } })
        cache[code] = { at: fetchDate, points: parseF10(body, code) }
        ok++
      } catch (e) { fail++; console.log(`${code} F10 题材获取失败：${e.message}`) }
      await sleep(250)
    }
    cache = pruneF10({ ...cache, ...Object.fromEntries(out.zt.filter((r) => cache[r.code]).map((r) => [r.code, cache[r.code]])) }, fetchDate)
    out.zt = attachTopics(out.zt, cache)
    out.f10 = { label: '东方财富 F10 核心题材', ttl: 30, fetched: ok, failed: fail, cached: out.zt.filter((r) => r.topics).length }
    if (!out.sources.some((x) => x.id === 'f10')) out.sources.push({ id: 'f10', label: '东方财富 F10 核心题材（公司资料，非当日涨停原因）', url: 'https://emweb.securities.eastmoney.com/' })
    fs.mkdirSync(RAW, { recursive: true })
    fs.writeFileSync(`${RAW}/f10.json`, JSON.stringify(cache))
  } catch (e) { console.log(`F10 题材要点不可用：${e.message}`) }

  try {
    let stocks = readJson(`${RAW}/stocks.json`, {})
    // 名称：先用每日复盘归档（按日期升序，晚的覆盖早的），再用当日股池
    const archive = readJson('public/data/daily-analysis.json', {}).snapshots ?? []
    for (const snap of [...archive].sort((a, b) => String(a.dataDate).localeCompare(String(b.dataDate)))) {
      stocks = mergeStocks(stocks, (snap.upStocks ?? []).filter((r) => !stocks[r.code]).map((r) => ({ code: r.code, name: r.name })))
    }
    stocks = mergeStocks(stocks, [...(out.zb ?? []), ...out.zt])
    const exp = buildHistoryExport(store, stocks)
    // 行业缺失的（只在归档里出现过的）用东财个股所属行业补
    const need = Object.entries(exp.stocks).filter(([, v]) => !v[1]).map(([c]) => c)
    for (let i = 0; i < need.length; i += 50) {
      try {
        const body = await quote(`/api/qt/ulist.np/get?${new URLSearchParams({ secids: need.slice(i, i + 50).map(secidOf).join(','), fields: 'f12,f14,f100', fltt: '2', invt: '2' })}`)
        for (const r of body?.data?.diff ?? []) {
          const ind = typeof r.f100 === 'string' && r.f100.trim() && r.f100.trim() !== '-' ? r.f100.trim() : null
          if (/^\d{6}$/.test(r.f12) && ind && stocks[r.f12]) stocks[r.f12] = [stocks[r.f12][0], ind]
        }
      } catch (e) { console.log(`所属行业补全失败：${e.message}`) }
      await sleep(250)
    }
    const final = buildHistoryExport(store, stocks)
    fs.writeFileSync(`${RAW}/stocks.json`, JSON.stringify(final.stocks)) // 只留历史窗口里出现过的股票
    fs.writeFileSync(HISTORY_OUT, JSON.stringify({ ...final, generatedAt: new Date().toISOString() }))
  } catch (e) { console.log(`涨停历史导出失败：${e.message}`) }
  return out
}
const QUOTE_HOSTS = ['https://push2.eastmoney.com', 'https://push2delay.eastmoney.com', 'https://82.push2.eastmoney.com']
async function quote(path) {
  let last
  for (const host of QUOTE_HOSTS) {
    try { return await get(`${host}${path}`, { headers: { referer: 'https://quote.eastmoney.com/' } }) } catch (e) { last = e }
  }
  throw last
}

if (process.env.REFS_ONLY === '1') {
  const out = readJson(OUT, null)
  if (!out?.asOf || !Array.isArray(out.zt)) { console.log('没有现成的 kpl-daban.json，跳过'); process.exit(0) }
  const store = readJson(`${RAW}/history.json`, { days: {} })
  await refreshRefs(out, store, new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10))
  fs.writeFileSync(OUT, JSON.stringify(out))
  console.log(JSON.stringify({ asOf: out.asOf, f10: out.f10 }))
  process.exit(0)
}

const force = process.env.FORCE === '1'
const bj = new Date(Date.now() + 8 * 3600_000)
const today = force && /^\d{4}-\d{2}-\d{2}$/.test(process.env.DATE ?? '') ? process.env.DATE : bj.toISOString().slice(0, 10)
const minutes = bj.getUTCHours() * 60 + bj.getUTCMinutes()
if (!isTradingDay(today)) { console.log(`${today} 非交易日，跳过`); process.exit(0) }
if (minutes < 15 * 60 + 10 && !force) { console.log(`${today} 未收盘（北京 ${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}），跳过`); process.exit(0) }

const poolUrl = (ep, sort) => `https://push2ex.eastmoney.com/${ep}?${new URLSearchParams({ ut: POOL_TOKEN, dpt: 'wz.ztzt', Pageindex: '0', pagesize: '10000', sort, date: today.replaceAll('-', '') })}`
// 排序字段必须是该池有的列，否则东财返回空池（tc 仍有值），校验会失败
async function pool(ep, sort) { return poolRaw(await get(poolUrl(ep, sort), { headers: { referer: 'https://quote.eastmoney.com/' } }), today) }

let zt
try { zt = (await pool('getTopicZTPool', 'fbt:asc')).map(mapZt) } catch (e) { console.log(`${today} 没有当日涨停池（休市或尚未更新）：${e.message}`); process.exit(0) }
const zb = (await pool('getTopicZBPool', 'fbt:asc')).map(mapZb)
const dt = (await pool('getTopicDTPool', 'fund:asc')).map(mapDt)
const yzt = (await pool('getYesterdayZTPool', 'zs:desc')).map(mapYzt)
const cx = (await pool('getTopicCXPooll', 'ods:asc')).map(mapNew)

// 新浪全市场：总数 → 分页（每页 80）→ 再核总数，任何一页不足都放弃本次（不写不完整的数据）
async function sinaMarket() {
  const count = async () => Number(String(await get(`${SINA}Market_Center.getHQNodeStockCount?node=hs_a`, { kind: 'text', headers: { referer: 'https://finance.sina.com.cn/' } })).replace(/\D/g, ''))
  const total = await count()
  if (!(total > 4000 && total < 9000)) throw new Error(`新浪全市场总数异常：${total}`)
  const pages = Math.ceil(total / 80)
  const out = Array(pages)
  let cursor = 0
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (cursor < pages) {
      const p = cursor++
      const url = `${SINA}Market_Center.getHQNodeData?${new URLSearchParams({ node: 'hs_a', sort: 'symbol', asc: '1', num: '80', page: String(p + 1) })}`
      const body = await get(url, { headers: { referer: 'https://finance.sina.com.cn/' } })
      const want = Math.min(80, total - p * 80)
      if (!Array.isArray(body) || body.length !== want) throw new Error(`新浪第 ${p + 1} 页不足`)
      out[p] = body.map(parseSinaFull)
    }
  }))
  const rows = out.flat()
  if ((await count()) !== total || new Set(rows.map((r) => r.code)).size !== total) throw new Error('新浪全市场总数变化或证券重复')
  return rows
}
const rows = await sinaMarket()

// 曾跌停：候选股逐只取腾讯报价里的当日跌停价确认（每批 60 只，只收当日行情）
const cands = touchCandidates(rows, { dtCodes: new Set(dt.map((r) => r.code)), noLimit: new Set(cx.filter((r) => r.noLimit).map((r) => r.code)) })
const limits = new Map()
for (let i = 0; i < cands.length; i += 60) {
  const text = await get(`https://qt.gtimg.cn/q=${cands.slice(i, i + 60).map((r) => r.symbol).join(',')}`, { kind: 'gbk' })
  for (const [k, v] of parseTencent(text, today)) limits.set(k, v)
}
if (cands.length && !limits.size) throw new Error('腾讯报价没有返回当日行情，放弃本次（不写曾跌停为 0 的数据）')

// 历史：已有记录 + 每日复盘归档种子
let store = fs.existsSync(`${RAW}/history.json`) ? JSON.parse(fs.readFileSync(`${RAW}/history.json`, 'utf8')) : { days: {} }
try {
  const archive = JSON.parse(fs.readFileSync('public/data/daily-analysis.json', 'utf8'))
  store = mergeStore(store, seedFromArchive(archive.snapshots ?? []))
} catch (e) { console.log(`读取每日复盘归档失败：${e.message}`) }

const { payload, store: merged } = buildDaban({ date: today, zt, zb, dt, yzt, cx, rows, limits, store })
const sources = [
  { id: 'pools', label: '东方财富涨停 / 炸板 / 跌停 / 昨日涨停 / 次新股池', url: 'https://quote.eastmoney.com/ztb/' },
  { id: 'market', label: '新浪 A 股全市场行情（开高低收）', url: 'https://finance.sina.com.cn/' },
  { id: 'limits', label: '腾讯行情报价（当日涨跌停价）', url: 'https://gu.qq.com/' },
]
const out = {
  version: 1, generatedAt: new Date().toISOString(),
  note: '盘后统计，不是买卖建议。自然涨停、曾跌停、竞价、溢价基因的口径为本站自定，见页面说明。',
  ...payload, sources,
}
await refreshRefs(out, merged, bj.toISOString().slice(0, 10))
fs.mkdirSync(RAW, { recursive: true })
fs.writeFileSync(`${RAW}/history.json`, JSON.stringify(merged))
fs.writeFileSync(OUT, JSON.stringify(out))
const s = payload.summary
console.log(JSON.stringify({ date: today, zt: s.zt, zb: s.zb, dt: s.dt, natural: s.natural, touched: s.touched, newStocks: s.newStocks, auction: s.auction, gene: payload.gene }))
