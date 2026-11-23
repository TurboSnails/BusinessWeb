#!/usr/bin/env node
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runResearch } from './lib/macro-posture-research/run.mjs'

export { runResearch }

function parseArgs(argv) {
  return {
    writeDocs: argv.includes('--write-docs'),
    noCache: argv.includes('--no-cache'),
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { writeDocs, noCache } = parseArgs(process.argv.slice(2))
  runResearch({ writeDocs, noCache }).then(file => {
    const counts = Object.fromEntries(['adopt', 'watch', 'reject'].map(v =>
      [v, file.candidates.filter(c => c.verdict === v).length]))
    console.log(`候选检验完成（${file.baselineLabel}）：采用 ${counts.adopt}、观察 ${counts.watch}、不采用 ${counts.reject}。`)
    for (const c of file.candidates) {
      console.log(`  ${c.id}: ${c.verdict} — ${c.reason}`)
    }
    if (file.combined) console.log(`合测 [${file.combined.ids.join(',')}]: ${file.combined.pass ? '通过' : '未通过'} — ${file.combined.detail}`)
    if (writeDocs) console.log('已写入研究记录（--write-docs）。')
  }).catch(error => {
    console.error(error)
    process.exitCode = 1
  })
}
