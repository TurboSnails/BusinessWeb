// 开盘啦「龙虎榜」页签数据：每个交易日盘后运行（.github/workflows/kpl-tabs.yml，兜底北京 18:30），生成 public/data/kpl-lhb.json。
// 来源：东方财富数据中心公开报表（每日上榜明细、买入/卖出前五席位）。龙虎榜约北京 17:00–18:30 公布；
// 当天还没公布时不写任何文件、正常退出；晚间或次日凌晨补跑也可以（会补齐最近 20 个交易日里缺的日期）。
// 原始数据：data-raw/kpl-lhb/days/<日期>.json（每日完整上榜记录与席位，保留最近 KEEP_RAW 个交易日）。
// 用法：node scripts/kpl-lhb.mjs   （FORCE=1 时 16:30 前也尝试当天，只用于排查）
import fs from 'node:fs'
import path from 'node:path'
import { assembleDay, buildLatest, buildWindow, candidateDays, checkComplete, dayStats, mergeHistory, parseList, parseSeats, pickDay } from './kpl-lhb-lib.mjs'

const OUT = 'public/data/kpl-lhb.json'
const RAW = 'data-raw/kpl-lhb/days'
const WINDOW = 20 // 营业部排行、个股上榜次数的统计窗口（交易日）
const KEEP_RAW = 60
const REFRESH = 2 // 最近两个交易日每次都重抓一遍（防止首次抓到的是未发全的数据）
const API = 'https://datacenter-web.eastmoney.com/api/data/v1/get'
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function getJson(url) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': UA, referer: 'https://data.eastmoney.com/stock/lhb.html' }, signal: AbortSignal.timeout(15000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.json()
    } catch (e) {
      if (attempt >= 2) throw e
      await sleep(2000 * (attempt + 1))
    }
  }
}

/** 分页取完整张报表；「返回数据为空」（code 9201）返回空数组 */
async function report(reportName, date, sortColumns) {
  const rows = []
  let count = null
  for (let page = 1; ; page++) {
    const q = new URLSearchParams({ reportName, columns: 'ALL', pageSize: '500', pageNumber: String(page), sortColumns, sortTypes: sortColumns.split(',').map(() => '1').join(','), filter: `(TRADE_DATE='${date}')`, source: 'WEB', client: 'WEB' })
    const body = await getJson(`${API}?${q}`)
    if (body?.code === 9201 || (body?.success === false && /为空/.test(body?.message ?? ''))) return []
    if (!body?.success || !Array.isArray(body?.result?.data)) throw new Error(`${reportName} 返回异常：${body?.message ?? '无结果'}`)
    count ??= body.result.count
    rows.push(...body.result.data)
    if (page >= body.result.pages) break
    await sleep(300)
  }
  return checkComplete(rows, count, reportName)
}

async function fetchDay(date) {
  const list = parseList(await report('RPT_DAILYBILLBOARD_DETAILSNEW', date, 'TRADE_ID'), date)
  if (!list.length) return null
  const buy = parseSeats(await report('RPT_BILLBOARD_DAILYDETAILSBUY', date, 'TRADE_ID,OPERATEDEPT_CODE,BUY'), date, 'buy')
  const sell = parseSeats(await report('RPT_BILLBOARD_DAILYDETAILSSELL', date, 'TRADE_ID,OPERATEDEPT_CODE,SELL'), date, 'sell')
  return assembleDay(date, list, buy, sell)
}

const bj = new Date(Date.now() + 8 * 3600_000)
const today = bj.toISOString().slice(0, 10)
const minutes = bj.getUTCHours() * 60 + bj.getUTCMinutes()
const candidates = candidateDays(today, minutes, WINDOW, process.env.FORCE === '1')

const readDay = (d) => { try { return JSON.parse(fs.readFileSync(path.join(RAW, `${d}.json`), 'utf8')) } catch { return null } }
const saved = new Map(fs.existsSync(RAW) ? fs.readdirSync(RAW).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map((f) => [f.slice(0, 10), readDay(f.slice(0, 10))]).filter(([, v]) => v) : [])

const changed = []
for (const [i, date] of candidates.entries()) {
  const old = saved.get(date)
  if (old && i >= REFRESH) continue
  let day
  try { day = await fetchDay(date) } catch (e) { console.log(`${date} 获取失败或未发全，跳过：${e.message}`); continue }
  if (!day) { console.log(`${date} 龙虎榜尚未公布（或休市），跳过`); continue }
  const keep = pickDay(old, day)
  if (keep === old || (old && JSON.stringify(old) === JSON.stringify(day))) continue
  saved.set(date, day)
  changed.push(date)
  await sleep(300)
}
if (!changed.length) { console.log(`${today} 没有新的龙虎榜数据，不写文件`); process.exit(0) }

const dates = [...saved.keys()].sort()
const latestDate = dates.at(-1)
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : null
const history = mergeHistory(prev?.history ?? [], dates.map((d) => dayStats(saved.get(d))))
const latest = buildLatest(saved.get(latestDate))
const window = buildWindow(dates.filter((d) => d <= latestDate).slice(-WINDOW).map((d) => saved.get(d)))

const out = {
  version: 1, generatedAt: new Date().toISOString(), asOf: latestDate,
  note: '盘后统计，不是买卖建议。龙虎榜只披露上榜个股的买入、卖出金额最大的前五个席位，不代表全部资金。',
  latest, window, history,
  sources: [
    { id: 'lhb', label: '东方财富数据中心 · 龙虎榜单（每日上榜明细）', url: 'https://data.eastmoney.com/stock/lhb.html' },
    { id: 'seats', label: '东方财富数据中心 · 龙虎榜买入/卖出前五席位', url: 'https://data.eastmoney.com/stock/lhb.html' },
  ],
}
fs.mkdirSync(RAW, { recursive: true })
for (const d of changed) fs.writeFileSync(path.join(RAW, `${d}.json`), JSON.stringify(saved.get(d)))
for (const d of dates.slice(0, -KEEP_RAW)) fs.rmSync(path.join(RAW, `${d}.json`), { force: true })
fs.writeFileSync(OUT, JSON.stringify(out))
console.log(JSON.stringify({ asOf: latestDate, changed, stocks: latest.stockCount, entries: latest.entryCount, net: latest.totals.net, instNet: latest.inst.net, window: `${window.from}~${window.to}`, history: history.length }))
