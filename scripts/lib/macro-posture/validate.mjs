import { COMPONENTS, PILLARS, RULE_VERSION, TIERS } from './model.mjs'
import { BASE_VARIANT_IDS, LIVE_RULE_VERSION, LIVE_SINCE, TRADE_COSTS, VARIANT_IDS, VINTAGE_SOURCE } from './backtest.mjs'

const nonempty = v => typeof v === 'string' && v.length > 0
const number = Number.isFinite
const int = n => Number.isInteger(n) && n >= 0
const boolean = v => typeof v === 'boolean'
const isoDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v
const isoMonth = v => typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(v)
const timestamp = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && Number.isFinite(Date.parse(v))
const oneOf = (...values) => value => values.includes(value)
const nullable = predicate => (value, path) => value === null || predicate(value, path)
const optional = predicate => (value, path) => value === undefined || predicate(value, path)
const list = predicate => (value, path) => Array.isArray(value) && value.every((v, i) => check(predicate, v, `${path}[${i}]`))
const pair = (a, b) => (value, path) => Array.isArray(value) && value.length === 2
  && check(a, value[0], `${path}[0]`) && check(b, value[1], `${path}[1]`)
const shape = fields => (value, path) => value != null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).every(key => Object.hasOwn(fields, key))
  && Object.entries(fields).every(([key, predicate]) => check(predicate, value[key], `${path}.${key}`))
function check(predicate, value, path) {
  if (!predicate(value, path)) throw new Error(`CompositeFile 无效：${path}`)
  return true
}

const tierIds = TIERS.map(t => t.id)
const tier = oneOf(...tierIds)
const pillar = oneOf(...PILLARS.map(p => p.id))
const component = oneOf(...COMPONENTS.map(c => c.id))
const score = oneOf(-2, -1, 0, 1)
const ratio = n => number(n) && n >= 0 && n <= 1
const nullableNumber = nullable(number)
const texts = list(nonempty)

const liveReturns = { spxReturn: nullableNumber, portfolioReturn: nullableNumber }
const estimateLiveRow = shape({
  d: isoMonth, final: nullable(tier), equityShare: nullable(ratio), status: oneOf('estimate'), ...liveReturns,
})
// 月末正式定档冻结行：档位、仓位与判定依据写入后不再改动（见 scripts/check-live-ledger.mjs）。
const officialLiveRow = shape({
  d: isoMonth, final: tier, equityShare: ratio, status: oneOf('official'), recordedAt: isoDate, ruleVersion: nonempty,
  regime: nullable(tier), score: nullableNumber,
  pillars: (value, path) => check(shape(Object.fromEntries(PILLARS.map(p => [p.id, nullableNumber]))), value, path),
  breakers: texts, driver: oneOf('insufficient', 'repair', 'tactical', 'breaker', 'macro'), ...liveReturns,
})
const threshold = shape({ threshold: number, score, text: nonempty })
const move = shape({ tier, scoreGap: n => number(n) && n >= 0, text: nonempty })

const actions = (value, path) => texts(value, path) && value.length >= 2 && value.length <= 4
const tierDef = shape({ id: tier, label: nonempty, equityShare: ratio, range: nonempty, meaning: nonempty, actions: optional(actions) })
const componentState = shape({
  id: component, pillar, label: nonempty, masters: texts, value: nullableNumber, unit: nonempty,
  display: nonempty, observedOn: nullable(isoDate), availableOn: nullable(isoDate), stale: boolean,
  score: nullable(score), rule: nonempty, worse: optional(threshold), better: optional(threshold),
  source: nonempty, history: list(pair(isoDate, number)), nearThreshold: optional(boolean),
})
const pillarState = shape({
  id: pillar, title: nonempty, weight: ratio, score: nullableNumber, contribution: nullableNumber,
  tone: oneOf('positive', 'neutral', 'caution', 'negative', 'unknown'),
  summary: nonempty, components: list(componentState), history: list(pair(isoDate, nullableNumber)),
})
const breaker = shape({
  id: oneOf('recessionCredit', 'creditStress', 'sahmTrigger', 'inflationSqueeze'),
  label: nonempty, active: boolean, effect: nonempty, rule: nonempty,
})
const current = shape({
  asOf: isoDate,
  regime: shape({ score: nullableNumber, tier: nullable(tier) }),
  tactical: shape({
    below: nullable(boolean), price: nullableNumber, sma10: nullableNumber, display: nonempty,
    mtd: optional(shape({
      month: isoMonth, days: n => Number.isInteger(n) && n > 0, remaining: int, average: number,
      prior9: number, sma10: number, threshold: nullableNumber, below: boolean,
      lastClose: shape({ date: isoDate, value: number }), source: nonempty, display: nonempty,
    })),
  }),
  repair: shape({ active: boolean, rule: nonempty, display: nonempty }),
  final: shape({ tier: nullable(tier), equityShare: nullable(ratio) }),
  driver: oneOf('macro', 'breaker', 'tactical', 'repair', 'insufficient'), headline: nonempty, reasons: texts,
  confidence: shape({
    level: oneOf('high', 'medium', 'low'), agree: int, total: int, notes: texts,
    counts: shape({ positive: int, neutral: int, negative: int }),
  }),
  dates: list(shape({ label: nonempty, date: nonempty })),
  breakers: list(breaker),
  distance: shape({ up: optional(move), down: optional(move), nearest: list(shape({ componentId: component, text: nonempty })), tactical: optional(nonempty) }),
  warnings: shape({ on: int, total: int, names: texts }),
  pillars: list(pillarState),
})
const outerItem = shape({
  id: nonempty, name: nonempty, grade: oneOf('B', 'C', 'D'), category: nonempty,
  status: oneOf('warn', 'clear', 'info', 'na'), value: optional(nonempty), observedOn: optional(isoDate), signal: optional(nonempty),
  level: optional(oneOf('high', 'low', 'neutral')),
  uncertainty: shape({ kind: oneOf('历史太短', '授权受限', '修订偏差', '择时力弱', '与核心重复', '尚未接入'), text: nonempty }),
  promote: nonempty, masters: texts, source: optional(nonempty),
})
const tierStat = shape({
  months: int, share: ratio, fwd3: nullableNumber, fwd6: nullableNumber, fwd12: nullableNumber,
  fwd12Median: nullableNumber, neg12: nullable(ratio), maxDd12: nullableNumber,
})
const backtest = shape({
  start: isoMonth, end: isoMonth, months: int, disclosures: texts,
  tiers: shape(Object.fromEntries(tierIds.map(id => [id, tierStat]))),
  variants: list(shape({
    id: oneOf(...VARIANT_IDS), label: nonempty, cagr: number, vol: number, maxDd: number,
    sharpe: number, calmar: number, avgEquity: ratio, switchesPerYear: number,
  })),
  recessions: list(shape({
    start: isoMonth, end: isoMonth, firstDefensive: nullable(isoMonth), leadMonths: nullable(Number.isInteger),
    note: optional(nonempty),
  })),
  falseAlarms: list(shape({ start: isoMonth, end: isoMonth, months: int, spxFwd12: nullableNumber, maxDd12: nullableNumber })),
  singles: list(shape({ componentId: component, label: nonempty, negMonths: int, spread12: nullableNumber, negHit12: nullable(ratio) })),
  costs: shape({
    turnoverPerYear: n => number(n) && n >= 0,
    rows: list(shape({ cost: oneOf(...TRADE_COSTS), cagr: number, drag: number })),
  }),
  live: shape({
    since: oneOf(LIVE_SINCE), ruleVersion: oneOf(LIVE_RULE_VERSION),
    rows: list((row, path) => check(row?.status === 'official' ? officialLiveRow : estimateLiveRow, row, path)),
  }),
  timeline: list(shape({ d: isoMonth, regime: nullable(tier), final: nullable(tier), spx: n => n > 0 && number(n), rec: oneOf(0, 1) })),
})
const composite = shape({
  ruleVersion: oneOf(RULE_VERSION), generatedAt: timestamp, tiers: list(tierDef), current, outer: list(outerItem), backtest, failedSources: texts,
})

export function validateComposite(file) {
  check(composite, file, 'root')
  const sameKeys = (actual, expected) => actual.length === expected.length && expected.every(id => actual.includes(id))
  check(ids => sameKeys(ids, tierIds), file.tiers.map(t => t.id), 'root.tiers')
  const expectedVariants = file.failedSources.includes(VINTAGE_SOURCE) ? [VARIANT_IDS, BASE_VARIANT_IDS] : [VARIANT_IDS]
  check(ids => expectedVariants.some(expected => ids.length === expected.length && ids.every((id, i) => id === expected[i])),
    file.backtest.variants.map(v => v.id), 'root.backtest.variants')
  check(ids => sameKeys(ids, PILLARS.map(p => p.id)), file.current.pillars.map(p => p.id), 'root.current.pillars')
  const { score: regimeScore } = file.current.regime
  const contributions = file.current.pillars.map(p => p.contribution)
  check(values => regimeScore == null ? values.every(v => v == null)
    : Math.abs(values.reduce((sum, v) => sum + (v ?? 0), 0) - regimeScore) < 1e-9,
  contributions, 'root.current.pillars.contribution')
  check(dates => dates.length === 5, file.current.dates, 'root.current.dates')
  check(counts => Object.values(counts).reduce((sum, n) => sum + n, 0) === file.current.confidence.total,
    file.current.confidence.counts, 'root.current.confidence.counts')
  const mtd = file.current.tactical.mtd
  if (mtd) check(value => (value.threshold == null) === (value.remaining === 0), mtd, 'root.current.tactical.mtd.threshold')
  check(rows => rows.length === TRADE_COSTS.length && rows.every((row, i) => row.cost === TRADE_COSTS[i]),
    file.backtest.costs.rows, 'root.backtest.costs.rows')
  check(rows => rows.every((row, i) => row.d >= LIVE_SINCE.slice(0, 7) && (i === 0 || rows[i - 1].d < row.d)),
    file.backtest.live.rows, 'root.backtest.live.rows')
  for (const p of file.current.pillars) {
    const expected = COMPONENTS.filter(c => c.pillar === p.id).map(c => c.id)
    check(ids => sameKeys(ids, expected), p.components.map(c => c.id), `root.current.pillars.${p.id}.components`)
  }
  check(rows => rows.length > 0 && rows.length === file.backtest.months &&
    rows[0].d === file.backtest.start && rows.at(-1).d === file.backtest.end,
  file.backtest.timeline, 'root.backtest.timeline')
  return true
}
