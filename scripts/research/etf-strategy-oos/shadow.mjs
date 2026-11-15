// 第 ② 步：影子运行。每周记录一次冻结名单（universe.json）上「择时＋只认金叉」的状态，只存档，不在网站展示。
// 输出：data-raw/etf-timing-shadow/<YYYY-MM-DD>.json（同一周重跑覆盖同一文件，以最近交易日命名）。
// 数据：腾讯前复权日线（GitHub Actions 网络），每只一次请求取最近约 4 年；单只失败记入 missing，不中断。
// 注：持仓状态由近 4 年数据推算，与全历史推算可能在个别 ETF 上不同；事后复算以快照为准。历史统计，不构成投资建议。
import fs from 'node:fs'
import { ratioTiming, timingGold } from './strategies.mjs'

const here = new URL('.', import.meta.url).pathname
const universe = JSON.parse(fs.readFileSync(here + 'universe.json', 'utf8'))
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const sym = (c) => (/^(5|6)/.test(c) ? 'sh' : 'sz') + c
async function bars(code) {
  // 每只一次请求：最近约 4 年（1000 根）前复权日线，足够 MACD/择时预热；被拦时退避重试
  const begin = `${new Date().getFullYear() - 4}-01-01`
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const host = attempt % 2 ? 'https://proxy.finance.qq.com/ifzqgtimg' : 'https://web.ifzq.gtimg.cn'
      const j = await (await fetch(`${host}/appstock/app/fqkline/get?param=${sym(code)},day,${begin},,1000,qfq`, { signal: AbortSignal.timeout(20000) })).json()
      const d = j?.data?.[sym(code)]
      const rows = (d?.qfqday || d?.day || []).map((r) => ({ date: r[0], open: +r[1], close: +r[2], high: +r[3], low: +r[4] })).filter((x) => x.open > 0 && x.close > 0)
      await sleep(1500)
      return rows
    } catch (e) { if (attempt === 2) throw e; await sleep(15000 * (attempt + 1)) }
  }
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
  complete: missing.length <= universe.items.length * 0.1,
  summary: { n: items.length, hsHolding: items.filter((x) => x.hs.holding).length, cybHolding: items.filter((x) => x.cyb.holding).length, missing: missing.length },
  items, missing,
  note: '影子运行存档：用于事后检验规则，不是买卖指令。',
}
fs.mkdirSync('data-raw/etf-timing-shadow', { recursive: true })
fs.writeFileSync(`data-raw/etf-timing-shadow/${asOf}.json`, JSON.stringify(snap, null, 1))
console.log(JSON.stringify({ asOf, complete: snap.complete, timing: snap.timing, summary: snap.summary }))
// 缺失超过 10% 时仍存档（标 complete:false），但以失败退出提醒复跑；同一周复跑覆盖同名文件
if (!snap.complete) process.exitCode = 1
