import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectCore } from '../../macro-posture.mjs'
import { backtestMonthEnds } from '../macro-posture/backtest.mjs'
import { makePanel, monthEnd } from '../macro-posture/panel.mjs'
import { loadVintages } from '../macro-posture/vintages.mjs'
import {
  CANDIDATES, CRITERIA, PREREGISTERED, REVISION_BIAS_IDS, REVISION_BIAS_NOTE,
} from './defs.mjs'
import { fetchCandidateExtras } from './fetch.mjs'
import { measureCandidate, measureCombined } from './metrics.mjs'
import { renderResearchMarkdown } from './report.mjs'
import { formatCandidateCurrent, readCandidates } from './series.mjs'
import { judge, judgeCombined } from './verdict.mjs'

const ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const DATA = resolve(ROOT, 'public/data')
const VINTAGE_DIR = resolve(ROOT, 'data-raw/macro-posture-vintages')
const BASELINE_LABEL = 'v2.1（实时数据口径）'
const REVISED_LABEL = 'v2.1（修订值口径）'

const exactFields = new Set([
  'cagr', 'vol', 'maxDd', 'sharpe', 'avgEquity', 'recessionsCaught', 'falseAlarmMonths', 'historyYears',
])
const json = file => JSON.stringify(file, (key, item) =>
  typeof item === 'number' && Number.isFinite(item) && !exactFields.has(key)
    ? Number(item.toFixed(4)) : item) + '\n'

function offlineVintageFetcher() {
  throw new Error('离线运行：vintage 缓存缺失，禁止联网回填')
}

function packCandidate(def, measured, judged, current) {
  const bias = REVISION_BIAS_IDS.has(def.id) ? REVISION_BIAS_NOTE : ''
  return {
    id: def.id,
    name: def.name,
    pillar: def.pillar,
    masters: def.masters,
    data: def.data,
    rule: def.rule,
    historyYears: measured.historyYears,
    split: measured.splits.label,
    baseline: measured.baseline,
    withCandidate: measured.withCandidate,
    checks: judged.checks,
    verdict: judged.verdict,
    reason: bias ? `${judged.reason}${bias}` : judged.reason,
    current,
  }
}

function evaluateSet(panel, extras, today, vintages) {
  const readings = readCandidates(extras, today, panel.FEDFUNDS)
  const candidates = []
  for (const def of CANDIDATES) {
    const measured = measureCandidate(panel, extras, today, def, [def.id], vintages)
    const judged = judge(measured.baseline, measured.withCandidate, measured.historyYears)
    const current = formatCandidateCurrent(def.id, readings[def.id])
    candidates.push(packCandidate(def, measured, judged, current))
  }

  const adoptIds = candidates.filter(c => c.verdict === 'adopt').map(c => c.id)
  let combined
  if (adoptIds.length) {
    const earliest = adoptIds
      .map(id => CANDIDATES.find(c => c.id === id).historyStart)
      .sort()[0]
    const measured = measureCombined(panel, extras, today, adoptIds, earliest, vintages)
    const judged = judgeCombined(measured.baseline, measured.withCandidate)
    combined = {
      ids: adoptIds,
      baseline: measured.baseline,
      withCandidate: measured.withCandidate,
      pass: judged.pass,
      detail: judged.detail,
    }
  }
  return { candidates, combined }
}

export async function runResearch({
  fetcher = fetch,
  now = new Date(),
  directory = DATA,
  vintageDirectory = VINTAGE_DIR,
  outputJson = resolve(directory, 'macro-posture-candidates.json'),
  outputMd = resolve(ROOT, 'docs/research/macro-posture-candidates-2026-11-23.md'),
  includeRevisedComparison = true,
  writeDocs = false,
  noCache = false,
} = {}) {
  const generatedAt = now.toISOString()
  const today = generatedAt.slice(0, 10)
  const completeThrough = monthEnd(today, -1)

  const [core, usMarketData] = await Promise.all([
    collectCore(today, fetcher),
    readFile(resolve(directory, 'us-market-data.json'), 'utf8').then(JSON.parse),
  ])
  const panel = makePanel(core)
  const extras = await fetchCandidateExtras(fetcher, {
    completeThrough,
    usMarketData,
    noCache,
    now,
  })

  const monthEnds = backtestMonthEnds(today)
  const { vintages } = await loadVintages(monthEnds, {
    directory: vintageDirectory,
    fetcher: offlineVintageFetcher,
  })

  // 修订值对照（只进研究记录，不进 JSON）
  const revised = includeRevisedComparison
    ? evaluateSet(panel, extras, today, null)
    : null

  const realtime = evaluateSet(panel, extras, today, vintages)

  const file = {
    generatedAt,
    baselineLabel: BASELINE_LABEL,
    preregistered: PREREGISTERED,
    criteria: CRITERIA,
    candidates: realtime.candidates,
    ...(realtime.combined ? { combined: realtime.combined } : {}),
  }

  const mdFile = {
    ...file,
    revisedComparison: revised ? {
      baselineLabel: REVISED_LABEL,
      candidates: revised.candidates,
      combined: revised.combined ?? null,
    } : null,
  }

  await mkdir(dirname(outputJson), { recursive: true })
  await writeFile(outputJson, json(file))
  if (writeDocs) {
    await mkdir(dirname(outputMd), { recursive: true })
    await writeFile(outputMd, renderResearchMarkdown(mdFile))
  }
  return { ...file, revisedComparison: mdFile.revisedComparison }
}
