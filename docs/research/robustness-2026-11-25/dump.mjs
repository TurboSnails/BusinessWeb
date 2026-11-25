#!/usr/bin/env node
// 用生产代码导出稳健性检验（PREREG.md 的 A–D）所需的输入，写到 inputs.json；只导出读数与收益，不计算任何业绩。
// 之后的检验（run.mjs）只读这个文件，可离线复现。
// 用法：node docs/research/robustness-2026-11-25/dump.mjs [--curl]
//   --curl：本机 Node fetch 访问 FRED 不稳定时改用 curl 取数（不影响数据内容）。
import { execFile } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectCore } from '../../../scripts/macro-posture.mjs'
import { makePanel, monthEnd, panelAt } from '../../../scripts/lib/macro-posture/panel.mjs'
import { backtestMonthEnds, buildVintageBacktest, monthlyReturns } from '../../../scripts/lib/macro-posture/backtest.mjs'
import { loadVintages, panelWithVintages } from '../../../scripts/lib/macro-posture/vintages.mjs'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const OUT = fileURLToPath(new URL('./inputs.json', import.meta.url))
const HOLDOUT_FROM = '1950-01'
const HOLDOUT_TO = '1972-12'

const curl = (url) => new Promise((resolveFetch, reject) => {
  execFile('curl', ['-sS', '-L', '--http1.1', '-m', '90', '-w', '\n%{http_code}', String(url)],
    { encoding: 'buffer', maxBuffer: 512 * 1024 * 1024 }, (err, stdout) => {
      if (err) return reject(new Error('fetch failed'))
      const idx = stdout.lastIndexOf(10)
      const body = stdout.subarray(0, idx)
      const status = Number(stdout.subarray(idx + 1).toString())
      resolveFetch({ ok: status >= 200 && status < 300, status, text: async () => body.toString('utf8') })
    })
})
const fetcher = process.argv.includes('--curl') ? curl : fetch

const macro = JSON.parse(readFileSync(resolve(ROOT, 'public/data/macro-posture.json'), 'utf8'))
const today = macro.generatedAt.slice(0, 10)
const lastComplete = monthEnd(today, -1)
const core = await collectCore(today, fetcher, { warn: () => {} })
const panel = makePanel(core)
const ends = backtestMonthEnds(today)
const { vintages, incomplete = [] } = await loadVintages(ends, { fetcher, includeHours: true })
if (!vintages || incomplete.length) throw new Error('实时版本数据不完整，停止')

// 复现门槛：用同一份数据重建的月度档位须与页面逐月相同
const rebuilt = buildVintageBacktest(panel, today, vintages).backtest.timeline
const page = macro.backtest.timeline
const mismatch = page.filter((row, i) => rebuilt[i]?.d !== row.d || rebuilt[i]?.final !== row.final || rebuilt[i]?.regime !== row.regime)
if (rebuilt.length !== page.length || mismatch.length) throw new Error(`重建档位与页面不一致：${mismatch.length} 个月`)

const FIELDS = ['value', 'delta', 'delta6', 'inverted12', 'inverted24', 'yoy']
const slim = frame => ({
  below: frame.tactical.below ?? null,
  components: Object.fromEntries(Object.entries(frame.components).map(([id, reading]) => [id,
    reading ? Object.fromEntries(FIELDS.filter(key => reading[key] !== undefined).map(key => [key, reading[key]])) : null])),
})
const month = date => date.slice(0, 7)
const realtime = page.map(({ d }) => {
  const date = monthEnd(d)
  return { d, pageFinal: page.find(row => row.d === d).final, ...slim(panelAt(panelWithVintages(panel, vintages, date), date, null)) }
})
const holdout = []
for (let d = HOLDOUT_FROM; d <= HOLDOUT_TO; d = month(monthEnd(d, 1))) holdout.push({ d, ...slim(panelAt(panel, monthEnd(d), null)) })

const returns = monthlyReturns(panel, lastComplete)
const gs5Text = await (await fetcher('https://fred.stlouisfed.org/graph/fredgraph.csv?id=GS5')).text()
const gs5 = gs5Text.trim().split(/\r?\n/).slice(1).map(line => line.split(','))
  .filter(([day, v]) => /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Number(v)) && v !== '').map(([day, v]) => [day.slice(0, 7), Number(v)])

writeFileSync(OUT, JSON.stringify({
  note: '由 dump.mjs 用生产代码生成。realtime：1973 起每个月末的实时口径读数（与页面档位逐月复现一致）；holdout：1950–1972 每个月末的修订后数据读数；'
    + 'returns：monthlyReturns(panel)（标普月均价涨跌加股息率，现金为 3 个月国库券）；price：标普月均价；gs5：FRED GS5（5 年期国债收益率月均值，%）。',
  generatedFrom: { macroGeneratedAt: macro.generatedAt, ruleVersion: macro.ruleVersion, lastComplete },
  pageVariants: macro.backtest.variants,
  realtime,
  holdout,
  price: panel.price.map(p => [month(p.observedOn), p.value]),
  returns: [...returns].map(([d, r]) => [d, r.spx, r.cash]),
  gs5,
}))
console.log(`写入 ${OUT}：实时 ${realtime.length} 个月（档位与页面一致），留出 ${holdout.length} 个月，收益 ${returns.size} 个月，GS5 ${gs5.length} 个月（${gs5[0][0]} 起）`)
