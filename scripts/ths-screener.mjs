// 同花顺 · 技术选股：读开盘啦「复盘」页维护的全市场日线快照仓（只读），收盘后机械筛选 + 市场宽度，生成 public/data/ths-tab-screener.json。
// 不发任何网络请求。快照仓由 .github/workflows/kpl-tabs.yml 维护，与本脚本所在的 ths-tabs.yml 各自运行：
// 快照仓还没有目标交易日时直接退出（不写文件，保留上一份），下一次运行（17:15 / 18:30）再补上。
// 用法：node scripts/ths-screener.mjs                  目标日 = 北京时间交易日 15:10 之后为当天，否则为上一交易日
//       DATE=YYYY-MM-DD node scripts/ths-screener.mjs  用快照仓里 ≤ 该日的数据重算该日
import fs from 'node:fs'
import { isTradingDay, prevTradingDay } from './market-mood-lib.mjs'
import { parseCloses } from './kpl-review-lib.mjs'
import { buildScreener, expectedDate } from './ths-screener-lib.mjs'

const OUT = 'public/data/ths-tab-screener.json'
const STORE = 'data-raw/kpl-review'
const CLOSES = `${STORE}/closes`
const MIN_ROWS = 4000

const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return d } }
const override = /^\d{4}-\d{2}-\d{2}$/.test(process.env.DATE ?? '') ? process.env.DATE : null
const date = override ?? expectedDate(new Date(), isTradingDay)
const quit = (msg) => { console.log(`技术选股：${msg}，不写文件`); process.exit(0) }

if (!fs.existsSync(CLOSES)) quit('快照仓不存在')
const dates = fs.readdirSync(CLOSES).filter((f) => /^\d{4}-\d{2}-\d{2}\.csv$/.test(f)).map((f) => f.slice(0, 10)).filter((d) => d <= date).sort()
if (dates.at(-1) !== date) quit(`快照仓还没有 ${date}（最新 ${dates.at(-1) ?? '无'}）`)
const bf = readJson(`${STORE}/backfill.json`, null)
if (!bf?.complete) quit('快照仓回补尚未完成')

const days = dates.map((d) => {
  const { meta, rows } = parseCloses(fs.readFileSync(`${CLOSES}/${d}.csv`, 'utf8'))
  if (meta.date && meta.date !== d) quit(`${d}.csv 头部日期为 ${meta.date}`)
  return { date: d, source: meta.source ?? '', rows }
})
const i = days.length - 1
if (days[i].rows.size < MIN_ROWS) quit(`${date} 只有 ${days[i].rows.size} 行，疑似不完整`)
if (days[i - 1]?.date !== prevTradingDay(date)) quit(`快照仓缺上一交易日 ${prevTradingDay(date)}`)

const metaList = readJson(`${STORE}/meta.json`, { list: [] }).list ?? []
const meta = new Map(metaList.map((u) => [u.code, { name: u.name, industry: u.industry }]))

const t0 = Date.now()
const r = buildScreener(days, i, meta)
const out = {
  version: 1, asOf: date, generatedAt: new Date().toISOString(),
  store: {
    from: days[0].date, to: date, days: days.length, stocks: r.universe,
    source: days[i].source.startsWith('em-kline') ? 'kline' : 'sina',
    backfillEnd: bf.end ?? null,
  },
  presets: r.presets, stocks: r.stocks, breadth: r.breadth,
  sources: [
    { label: '东方财富日 K（前复权，快照仓回补）', url: 'https://quote.eastmoney.com/' },
    { label: '新浪财经沪深 A 股行情（快照仓每日追加）', url: 'https://vip.stock.finance.sina.com.cn/mkt/#hs_a' },
  ],
}
const text = JSON.stringify(out) + '\n'
fs.writeFileSync(`${OUT}.tmp`, text); fs.renameSync(`${OUT}.tmp`, OUT)
console.log(JSON.stringify({ date, ms: Date.now() - t0, kb: Math.round(text.length / 1024), stocks: r.universe, breadth: r.breadth.length, presets: Object.fromEntries(r.presets.map((p) => [p.id, p.count])) }))
