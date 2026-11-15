// 把影子运行存档与长历史检验结果整理成网站读取的 public/data/etf-timing.json（/lab/etf-timing）。
// 用法：node scripts/research/etf-strategy-oos/publish.mjs（在仓库根目录运行；shadow.mjs / bt-index.mjs 结束时也会调用）
import fs from 'node:fs'

const SHADOW_DIR = 'data-raw/etf-timing-shadow'
const RESEARCH = 'data-raw/etf-timing-research/long-history.json'
const OUT = 'public/data/etf-timing.json'

export function publish() {
  const files = fs.existsSync(SHADOW_DIR) ? fs.readdirSync(SHADOW_DIR).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort() : []
  const snaps = files.map((f) => JSON.parse(fs.readFileSync(`${SHADOW_DIR}/${f}`, 'utf8')))
  const latest = snaps.at(-1) ?? null
  const history = snaps.map((s) => ({
    asOf: s.asOf, complete: s.complete ?? s.missing?.length === 0, hs300Bull: s.timing?.hs300Bull ?? null, cybBull: s.timing?.cybBull ?? null,
    n: s.summary?.n ?? 0, hsHolding: s.summary?.hsHolding ?? 0, cybHolding: s.summary?.cybHolding ?? 0, missing: s.summary?.missing ?? 0,
  }))
  let research = null
  if (fs.existsSync(RESEARCH)) {
    const r = JSON.parse(fs.readFileSync(RESEARCH, 'utf8'))
    research = { generatedAt: r.generatedAt, windows: r.windows, verdict: r.verdict, results: r.results.filter((x) => !x.error), errors: r.results.filter((x) => x.error).map((x) => x.code) }
  }
  const out = {
    version: 1,
    generatedAt: new Date().toISOString(),
    note: '观察中、未验证；影子运行存档用于事后检验规则，不是买卖指令。',
    latest: latest && { asOf: latest.asOf, generatedAt: latest.generatedAt, complete: latest.complete ?? latest.missing?.length === 0, universeVersion: latest.universeVersion, timing: latest.timing, summary: latest.summary, items: latest.items, missing: latest.missing },
    history,
    research,
  }
  fs.mkdirSync('public/data', { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(out))
  return { out: OUT, snapshots: snaps.length, research: !!research }
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(publish())
