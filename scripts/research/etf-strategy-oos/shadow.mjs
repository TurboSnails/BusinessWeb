// 第 ② 步：影子运行。每个工作日收盘后记录一次冻结名单（universe.json）上「择时＋只认金叉」的状态，只存档，不在网站展示。
// 输出：data-raw/etf-timing-shadow/<YYYY-MM-DD>.json（以最近交易日命名，节假日重跑覆盖同一文件），并刷新 public/data/etf-timing.json（实验页与择时观察邮件读取）。
// 数据：腾讯前复权日线为主；腾讯拦截（GitHub 机器常见）时回落东财前复权日线（fqt=1），每只记录 src。
// 单只两个源都失败记入 missing，不中断。新浪日线不复权（分红日跳空会造成假死叉），不作备用。历史统计，不构成投资建议。
import fs from 'node:fs'
import { ratioTiming, timingGold } from './strategies.mjs'
import { publish } from './publish.mjs'
import { eastmoneyUrl, parseEastmoney } from './sources.mjs'

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
async function getJson(url, headers = {}, retries = 1) {
  for (let attempt = 0; ; attempt++) {
    try { return await (await fetch(url, { headers, signal: AbortSignal.timeout(10000) })).json() } catch (e) {
      if (attempt >= retries || overBudget()) throw e
      await sleep(5000)
    }
  }
}
const sym = (c) => (/^(5|6)/.test(c) ? 'sh' : 'sz') + c
const clean = (list) => list.sort((a, b) => a.date.localeCompare(b.date)).filter((b) => b.open > 0 && b.close > 0 && b.date <= bjToday && !(beforeClose && b.date === bjToday))
async function tencentBars(code) {
  const out = new Map(); const end = new Date().getFullYear()
  for (let y = 2010; y <= end; y += 3) {
    const host = y % 2 ? 'https://proxy.finance.qq.com/ifzqgtimg' : 'https://web.ifzq.gtimg.cn'
    // 结束日期不能写到未来：腾讯在结束日晚于今天时只返回到昨天（2026-11-17 实测），所以最多截到北京当天
    const stop = `${y + 2}-12-31` < bjToday ? `${y + 2}-12-31` : bjToday
    const url = `${host}/appstock/app/fqkline/get?param=${sym(code)},day,${y}-01-01,${stop},1000,qfq`
    const j = await getJson(url)
    const d = j?.data?.[sym(code)]; for (const r of d?.qfqday || d?.day || []) out.set(r[0], { date: r[0], open: +r[1], close: +r[2], high: +r[3], low: +r[4] })
    await sleep(400)
  }
  return clean([...out.values()])
}
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
async function eastmoneyBars(code) {
  const b = clean(parseEastmoney(await getJson(eastmoneyUrl(code, bjToday), { 'user-agent': UA, referer: 'https://quote.eastmoney.com/' }), code))
  await sleep(300)
  return b
}
// 腾讯连续失败 5 次后认为整轮被拦，后面的直接先走东财，省掉每只的退避等待
let tencentStreak = 0
async function bars(code) {
  const sources = tencentStreak >= 5 ? [['em', eastmoneyBars], ['tencent', tencentBars]] : [['tencent', tencentBars], ['em', eastmoneyBars]]
  const errors = []
  for (const [src, get] of sources) {
    if (overBudget()) break
    try {
      const b = await get(code)
      if (b.length < 150) throw new Error('too few ' + b.length)
      if (src === 'tencent') tencentStreak = 0
      return { bars: b, src }
    } catch (e) {
      if (src === 'tencent') tencentStreak++
      errors.push(`${src}: ${String(e.message).slice(0, 60)}`)
    }
  }
  throw new Error(errors.join('; ') || 'time budget exceeded')
}

// 基准决定择时状态：三只日期不齐时择时会落后一天（腾讯偶尔缺当天这根，2026-11-17 实测 510300），
// 所以基准缺最新交易日时再取东财，用最后日期更新的那份
async function benchBars(code) {
  const first = await bars(code)
  const want = beforeClose ? null : bjToday
  if (first.src !== 'tencent' || !want || first.bars.at(-1).date >= want) return first
  try {
    const em = await eastmoneyBars(code)
    if (em.length >= 150 && em.at(-1).date > first.bars.at(-1).date) return { bars: em, src: 'em' }
  } catch { /* 用腾讯那份 */ }
  return first
}
const bench = [await benchBars('510300'), await benchBars('510880'), await benchBars('159915')]
const [hs300, div, cybEtf] = bench.map((x) => x.bars)
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
      const { bars: b, src } = await bars(code)
      items.push({ code, name, close: b.at(-1).close, date: b.at(-1).date, src, hs: pick(timingGold(b, tHs)), cyb: pick(timingGold(b, tCyb)) })
    } catch (e) { failed.push({ code, name, error: e.message.slice(0, 160) }) }
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
  // 数据来源：腾讯与东财都是前复权，但复权算法可能有细微差别，事后检验时可按 src 分开看
  sources: { benchmarks: Object.fromEntries(['510300', '510880', '159915'].map((c, i) => [c, bench[i].src])), tencent: items.filter((x) => x.src === 'tencent').length, em: items.filter((x) => x.src === 'em').length },
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
