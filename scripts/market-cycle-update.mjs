import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { writeReport } from './market-cycle-report.mjs'

export async function update(run = runScript, report = writeReport) {
  const failures = []
  // Isolate both data sources and collectors. A failed collector cannot discard another source's valid update.
  for (const script of ['market-cycle-snapshot.mjs', 'market-cycle-auto.mjs', 'market-cycle-breadth.mjs']) {
    try { await run(script) } catch (error) { failures.push(`${script}: ${error.message}`) }
  }
  return report(failures)
}
function runScript(name) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL(name, import.meta.url))], { stdio: 'inherit', timeout: 12 * 60 * 1000 })
    child.once('error', reject)
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`退出 ${code ?? signal}`)))
  })
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await update()
