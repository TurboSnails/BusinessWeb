// 重建公司估值覆盖层 public/data/company-valuations/*.json（无网络，只读仓库内行情快照、Yahoo 批量报价、林奇、DCF 证据）。
// 研究范围用 export-company-valuation-universe.mjs 从当前公司数据现导出（与研究页同口径），
// 不用 comprehensive-valuation-2026-10-22 冻结范围：冻结范围里的研究倍数已落后于站内公司数据。
// 全部 5 个市场先写到临时目录，全部生成成功并通过 verify-company-valuations 后才替换正式文件，
// 任一市场失败则保持原文件不动（数据新鲜度巡检会继续告警）。
//
// 用法：node scripts/rebuild-company-valuations.mjs --as-of YYYY-MM-DD
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const asOf = args.includes('--as-of') ? args[args.indexOf('--as-of') + 1] : ''
if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) {
  console.error('用法：node scripts/rebuild-company-valuations.mjs --as-of YYYY-MM-DD')
  process.exit(2)
}

const MARKETS = [
  { market: 'us', script: 'build-company-valuations-us.py' },
  { market: 'ndx', script: 'build-company-valuations-us.py' },
  { market: 'cn', script: 'build-company-valuations-cn.py' },
  { market: 'hk', script: 'build-company-valuations-international.py', extra: ['--market', 'hk'] },
  { market: 'adr', script: 'build-company-valuations-international.py', extra: ['--market', 'adr'] },
]
const target = market => `public/data/company-valuations/${market}.json`
const run = (cmd, argv) => execFileSync(cmd, argv, { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' })

const work = mkdtempSync(join(tmpdir(), 'company-valuations-'))
const backup = join(work, 'backup')
try {
  const universe = join(work, 'universe')
  const out = join(work, 'out')
  process.stdout.write(run('node', ['scripts/export-company-valuation-universe.mjs', '--out', universe]))
  mkdirSync(out, { recursive: true }); mkdirSync(backup, { recursive: true })
  for (const { market, script, extra = [] } of MARKETS) {
    const summary = run('python3', ['-B', `scripts/${script}`, '--universe', join(universe, `${market}.json`), '--as-of', asOf, '--output', join(out, `${market}.json`), ...extra])
    console.log(`${market}: ${summary.trim().split('\n').at(-1)}`)
  }
  // verify-company-valuations 读正式路径：先备份再替换，校验失败就还原
  for (const { market } of MARKETS) copyFileSync(target(market), join(backup, `${market}.json`))
  for (const { market } of MARKETS) copyFileSync(join(out, `${market}.json`), target(market))
  try {
    run('node', ['scripts/verify-company-valuations.mjs'])
  } catch (error) {
    for (const { market } of MARKETS) copyFileSync(join(backup, `${market}.json`), target(market))
    throw new Error(`verify-company-valuations 未通过，已还原原文件：${error.message}`)
  }
  const dates = MARKETS.map(({ market }) => {
    const doc = JSON.parse(readFileSync(target(market), 'utf8'))
    const latest = doc.records.map(r => r.price?.date).filter(Boolean).sort().at(-1) ?? '—'
    return `${market} 最新价格日 ${latest}`
  })
  console.log(`估值覆盖层已重建（asOf ${asOf}）：${dates.join('，')}`)
} finally {
  rmSync(work, { recursive: true, force: true })
}
