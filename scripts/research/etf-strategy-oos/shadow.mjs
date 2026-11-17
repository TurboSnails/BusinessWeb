// 第 ② 步：影子运行。每个工作日收盘后记录一次冻结名单（universe.json）上「择时＋只认金叉」的状态，只存档，不在网站展示。
// 输出：data-raw/etf-timing-shadow/<YYYY-MM-DD>.json（以最近交易日命名，节假日重跑覆盖同一文件），并刷新 public/data/etf-timing.json（实验页与择时观察邮件读取）。
// 数据：腾讯前复权日线（GitHub Actions 网络）；单只失败记入 missing，不中断。历史统计，不构成投资建议。
import fs from 'node:fs'
import { ratioTiming, timingGold } from './strategies.mjs'
import { publish } from './publish.mjs'

const here = new URL('.', import.meta.url).pathname
const universe = JSON.parse(fs.readFileSync(here + 'universe.json', 'utf8'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
// 整轮抓取的时间预算：GitHub 任务限时 45 分钟，超时被杀会连已取到的一起丢掉，所以到点就停下保存已有结果
const DEADLINE = Date.now() + 25 * 60_000
const overBudget = () => Date.now() > DEADLINE
// 北京时间：15:30 前当天的日线还没收盘（盘中手动或 push 触发时），一律丢掉当天这根，避免用盘中 MACD 记录信号
const bj = new Date(Date.now() + 8 * 3600_000)
const bjToday = bj.toISOString().slice(0, 10)
const beforeClose = bj.getUTCHours() * 60 + bj.getUTCMinutes() < 15 * 60 + 30
// 兜底排程（SKIP_IF_COMPLETE=1）：今天已有完整快照就不再跑，免得重复抓取加重限流、重复提交
if (process.env.SKIP_IF_COMPLETE === '1' && !beforeClose) {
  const f = `data-raw/etf-timing-shadow/${bjToday}.json`
  if (fs.existsSync(f) && (JSON.parse(fs.readFileSync(f, 'utf8')).missing ?? [1]).length === 0) { console.log(`今天（${bjToday}）已有完整快照，跳过`); process.exit(0) }
}
// 腾讯对连续请求会返回 HTML 拦截页：退避重试一次，仍失败交给第二轮补抓
async function getJson(url) {
  for (let attempt = 0; ; attempt++) {
    try { return await (await fetch(url, { signal: AbortSignal.timeout(10000) })).json() } catch (e) {
      if (attempt >= 1 || overBudget()) throw e
      await sleep(5000)
    }
  }
}
const sym = (c) => (/^(5|6)/.test(c) ? 'sh' : 'sz') + c
async function bars(code) {
  const out = new Map(); const end = new Date().getFullYear()
  for (let y = 2010; y <= end; y += 3) {
    const host = y % 2 ? 'https://proxy.finance.qq.com/ifzqgtimg' : 'https://web.ifzq.gtimg.cn'
    const url = `${host}/appstock/app/fqkline/get?param=${sym(code)},day,${y}-01-01,${y + 2}-12-31,1000,qfq`
    const j = await getJson(url)
    const d = j?.data?.[sym(code)]; for (const r of d?.qfqday || d?.day || []) out.set(r[0], { date: r[0], open: +r[1], close: +r[2], high: +r[3], low: +r[4] })
    await sleep(400)
  }
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date)).filter((b) => b.open > 0 && b.close > 0 && !(beforeClose && b.date === bjToday))
}

const [hs300, div, cybEtf] = [await bars('510300'), await bars('510880'), await bars('159915')]
const tHs = ratioTiming(hs300, div), tCyb = ratioTiming(cybEtf, div)
const asOf = div.at(-1).date
const items = []
let missing = []
const pick = (r) => ({ holding: r.pos.at(-1) === 1, pending: r.pending ?? null, lastSignal: r.lastSignal ?? null })
async function collect(list) {
  const failed = []
  for (const { code, name } of list) {
    if (overBudget()) { failed.push({ code, name, error: 'time budget exceeded' }); continue }
    try {
      const b = await bars(code); if (b.length < 150) throw new Error('too few ' + b.length)
      items.push({ code, name, close: b.at(-1).close, date: b.at(-1).date, hs: pick(timingGold(b, tHs)), cyb: pick(timingGold(b, tCyb)) })
    } catch (e) { failed.push({ code, name, error: e.message.slice(0, 80) }) }
  }
  return failed
}
let failed = await collect(universe.items)
// 第二轮：歇一分钟再补抓失败的（拦截通常是短时限流）
if (failed.length && !overBudget()) { await sleep(60000); failed = await collect(failed) }
missing = failed.map(({ code, error }) => ({ code, error }))
items.sort((a, b) => universe.items.findIndex((u) => u.code === a.code) - universe.items.findIndex((u) => u.code === b.code))
const snap = {
  asOf, generatedAt: new Date().toISOString(), universeVersion: universe.version,
  timing: { hs300Bull: [...tHs.values()].at(-1), cybBull: [...tCyb.values()].at(-1) },
  summary: { n: items.length, hsHolding: items.filter((x) => x.hs.holding).length, cybHolding: items.filter((x) => x.cyb.holding).length, missing: missing.length },
  items, missing,
  note: '影子运行存档：用于事后检验规则，不是买卖指令。',
}
fs.mkdirSync('data-raw/etf-timing-shadow', { recursive: true })
const file = `data-raw/etf-timing-shadow/${asOf}.json`
// 同一数据日期重跑（兜底排程、节假日）时，不用更不完整的结果覆盖已有快照
const prevN = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, 'utf8')).summary?.n ?? 0) : -1
if (items.length >= prevN) fs.writeFileSync(file, JSON.stringify(snap, null, 1))
else console.log(`保留已有快照：已有 ${prevN} 只，本次只取到 ${items.length} 只`)
console.log(JSON.stringify({ asOf, timing: snap.timing, summary: snap.summary }))
console.log(publish())
