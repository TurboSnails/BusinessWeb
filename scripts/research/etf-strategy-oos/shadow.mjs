// 第 ② 步：影子运行。每个工作日收盘后记录一次冻结名单（universe.json）上「择时＋只认金叉」的状态，只存档，不在网站展示。
// 输出：data-raw/etf-timing-shadow/<YYYY-MM-DD>.json（以最近交易日命名，节假日重跑覆盖同一文件），并刷新 public/data/etf-timing.json（实验页与择时观察邮件读取）。
// 数据：腾讯前复权日线（GitHub Actions 网络）；单只失败记入 missing，不中断。历史统计，不构成投资建议。
import fs from 'node:fs'
import { ratioTiming, timingGold } from './strategies.mjs'
import { publish } from './publish.mjs'

const here = new URL('.', import.meta.url).pathname
const universe = JSON.parse(fs.readFileSync(here + 'universe.json', 'utf8'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const sym = (c) => (/^(5|6)/.test(c) ? 'sh' : 'sz') + c
async function bars(code) {
  const out = new Map(); const end = new Date().getFullYear()
  for (let y = 2010; y <= end; y += 3) {
    const host = y % 2 ? 'https://proxy.finance.qq.com/ifzqgtimg' : 'https://web.ifzq.gtimg.cn'
    const url = `${host}/appstock/app/fqkline/get?param=${sym(code)},day,${y}-01-01,${y + 2}-12-31,1000,qfq`
    const j = await (await fetch(url, { signal: AbortSignal.timeout(20000) })).json()
    const d = j?.data?.[sym(code)]; for (const r of d?.qfqday || d?.day || []) out.set(r[0], { date: r[0], open: +r[1], close: +r[2], high: +r[3], low: +r[4] })
    await sleep(400)
  }
  return [...out.values()].sort((a, b) => a.date.localeCompare(b.date)).filter((b) => b.open > 0 && b.close > 0)
}

const [hs300, div, cybEtf] = [await bars('510300'), await bars('510880'), await bars('159915')]
const tHs = ratioTiming(hs300, div), tCyb = ratioTiming(cybEtf, div)
const asOf = div.at(-1).date
const items = [], missing = []
for (const { code, name } of universe.items) {
  try {
    const b = await bars(code); if (b.length < 150) throw new Error('too few ' + b.length)
    const pick = (r) => ({ holding: r.pos.at(-1) === 1, pending: r.pending ?? null, lastSignal: r.lastSignal ?? null })
    items.push({ code, name, close: b.at(-1).close, date: b.at(-1).date, hs: pick(timingGold(b, tHs)), cyb: pick(timingGold(b, tCyb)) })
  } catch (e) { missing.push({ code, error: e.message.slice(0, 80) }) }
}
const snap = {
  asOf, generatedAt: new Date().toISOString(), universeVersion: universe.version,
  timing: { hs300Bull: [...tHs.values()].at(-1), cybBull: [...tCyb.values()].at(-1) },
  summary: { n: items.length, hsHolding: items.filter((x) => x.hs.holding).length, cybHolding: items.filter((x) => x.cyb.holding).length, missing: missing.length },
  items, missing,
  note: '影子运行存档：用于事后检验规则，不是买卖指令。',
}
fs.mkdirSync('data-raw/etf-timing-shadow', { recursive: true })
fs.writeFileSync(`data-raw/etf-timing-shadow/${asOf}.json`, JSON.stringify(snap, null, 1))
console.log(JSON.stringify({ asOf, timing: snap.timing, summary: snap.summary }))
console.log(publish())
