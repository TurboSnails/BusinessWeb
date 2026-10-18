import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { writeReport } from './market-cycle-report.mjs'
import { OUT_FILE } from './market-cycle-breadth.mjs'

const MAX_BREADTH_ROUNDS = 12 // 12 rounds x 40 requests = 480 requests budget
const BREADTH_DEADLINE_MS = 8 * 60 * 1000
const ROUND_TIMEOUT_MS = 12 * 60 * 1000
const MARKETS = ['csi300', 'hsi', 'hstech']

async function readJson(file) {
  try { return JSON.parse(await readFile(file, 'utf8')) } catch { return null }
}

/** Eligible/total/not-fetched per market: progress signature; identical across rounds means no progress. */
function progressKey(snapshot) {
  return Object.values(snapshot?.markets ?? {}).map(m => `${m.universeId}:${m.eligible}/${m.total}:${m.exclusions?.not_fetched ?? 0}`).join('|')
}

/** Done only when all three markets are present, officially confirmed, past the 95% threshold, and voting real numbers. */
function breadthDone(snapshot) {
  const markets = snapshot?.markets ?? {}
  return MARKETS.every(id => {
    const m = markets[id]
    return !!m && m.kind === 'observed' && m.coverage >= 0.95 && m.breadth !== null && m.breadth !== undefined
      && m.priorBreadth !== null && m.priorBreadth !== undefined
  })
}

const clampRounds = v => Math.min(MAX_BREADTH_ROUNDS, Math.max(1, Math.floor(Number(v) || MAX_BREADTH_ROUNDS)))
const clampDeadline = v => Math.min(BREADTH_DEADLINE_MS, Math.max(1000, Number(v) || BREADTH_DEADLINE_MS))

/**
 * One bounded update pass. The breadth collector runs in resumable rounds (<=40 requests, concurrency 2,
 * enforced inside the collector) until all three markets are observed past the 95% breadth threshold, a round
 * makes no progress or the round/wall-clock budget is
 * exhausted. The remaining wall-clock budget is handed to each spawned round as its hard timeout.
 * Snapshot/auto failures are isolated from the breadth fill.
 */
export async function update(run = runScript, report = writeReport, opts = {}) {
  const failures = []
  // Isolate both data sources and collectors. A failed collector cannot discard another source's valid update.
  for (const script of ['market-cycle-snapshot.mjs', 'market-cycle-auto.mjs']) {
    try { await run(script) } catch (error) { failures.push(`${script}: ${error.message}`) }
  }
  const maxRounds = clampRounds(opts.maxRounds)
  const deadline = Date.now() + clampDeadline(opts.deadlineMs)
  const outFile = opts.outFile ?? OUT_FILE
  let lastKey = null
  for (let round = 1; round <= maxRounds; round++) {
    const remainingMs = deadline - Date.now()
    if (remainingMs <= 0) break
    try { await run('market-cycle-breadth.mjs', { timeoutMs: Math.min(remainingMs, ROUND_TIMEOUT_MS) }) }
    catch (error) { failures.push(`market-cycle-breadth.mjs: ${error.message}`); break }
    const snapshot = await readJson(outFile)
    if (breadthDone(snapshot)) break
    // A breaker belongs to its market. Another market can still fill its cache in the next round;
    // the progress signature and hard budgets stop repeated failures without blocking that work.
    const key = progressKey(snapshot)
    if (key === lastKey) break // no progress: further rounds would only repeat the same failures
    lastKey = key
  }
  return report(failures)
}
function runScript(name, { timeoutMs } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(new URL(name, import.meta.url))], { stdio: 'inherit', timeout: timeoutMs ?? ROUND_TIMEOUT_MS })
    child.once('error', reject)
    child.once('exit', (code, signal) => code === 0 ? resolve() : reject(new Error(`退出 ${code ?? signal}`)))
  })
}
if (process.argv[1] === fileURLToPath(import.meta.url)) await update()
