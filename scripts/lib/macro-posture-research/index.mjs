export {
  CANDIDATES, CRITERIA, PREREGISTERED, HISTORY_YEARS_MIN,
  REVISION_BIAS_NOTE, REVISION_BIAS_IDS, ROUND2_CANDIDATES, ROUND2_CRITERIA_EXTRA,
  MIN_SHARPE_IMPROVEMENT, MIN_DD_IMPROVEMENT,
} from './defs.mjs'
export {
  availableOnFor, formatCandidateCurrent, latestObserved, makeCandidateSeries, nextQuarterFirstMonthEnd,
  percentChange, pointAt, readCandidates, readCandidatesCurrent,
  scoreBreakevenShock, scoreEps, scoreHikeStart, scoreHours, scoreLongRateShock,
  scorePceMomentum, scorePermits, scoreRateExp, scoreSloos, valuationCapActive,
} from './series.mjs'
export { evaluateWithCandidates } from './evaluate.mjs'
export { fetchCandidateExtras, loadCapeFromLocal, parseFred, parseMultplMonthly, CACHE_DIR } from './fetch.mjs'
export { buildTimeline, measureCandidate, measureCombined } from './metrics.mjs'
export { judge, judgeCombined, splitRanges, historyYears, emptyMetrics } from './verdict.mjs'
export { renderResearchMarkdown, renderWorkerReport } from './report.mjs'
export { runResearch } from './run.mjs'
