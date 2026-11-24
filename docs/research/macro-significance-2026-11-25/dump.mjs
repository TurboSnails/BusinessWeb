#!/usr/bin/env node
// 用生产代码导出检验所需的输入，写到 inputs.json；之后的检验（run.mjs）只读这个文件，可离线复现。
// 用法：node docs/research/macro-significance-2026-11-25/dump.mjs [--curl]
//   --curl：本机 Node fetch 访问 FRED 不稳定时改用 curl 取数（不影响数据内容）。
import { execFile } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectCore } from '../../../scripts/macro-posture.mjs'
import { makePanel, monthEnd } from '../../../scripts/lib/macro-posture/panel.mjs'
import { monthlyReturns } from '../../../scripts/lib/macro-posture/backtest.mjs'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const OUT = fileURLToPath(new URL('./inputs.json', import.meta.url))

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

const macro = JSON.parse(readFileSync(resolve(ROOT, 'public/data/macro-posture.json'), 'utf8'))
const today = macro.generatedAt.slice(0, 10)
const lastComplete = monthEnd(today, -1)
const core = await collectCore(today, process.argv.includes('--curl') ? curl : fetch)
const panel = makePanel(core)
const returns = monthlyReturns(panel, lastComplete)
const price = panel.price.map(p => [p.observedOn.slice(0, 7), p.value])

writeFileSync(OUT, JSON.stringify({
  note: '由 dump.mjs 用生产代码生成：returns 为 monthlyReturns(panel)，price 为标普月均价，tiers 为 macro-posture.json 的实时最终档位。',
  generatedFrom: { macroGeneratedAt: macro.generatedAt, ruleVersion: macro.ruleVersion, lastComplete },
  pageVariants: macro.backtest.variants,
  tiers: macro.backtest.timeline.map(row => [row.d, row.final]),
  price,
  returns: [...returns].map(([d, r]) => [d, r.spx, r.cash]),
}))
console.log(`写入 ${OUT}：档位 ${macro.backtest.timeline.length} 个月，收益 ${returns.size} 个月`)
