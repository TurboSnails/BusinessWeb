import { number, percent } from './components/format'
import type { CompareSet, PriceIndex, RunInput, RunResult } from './types'

const MATERIAL_DIFFERENCE = 0.005
const COMPARISON_TOLERANCE = 1e-9
const INSUFFICIENT = '该项数据不足，暂不自动概括；请查看已计算的原始指标。'
const QUALITY_NOTICE = '部分输入数据存在质量提示，自动结论仅作描述，解释前请先核对数据状态。'
const FIXED_ENDING = '以上是所选历史区间的事后回测描述；选股与规则存在事后挑选和幸存者偏差，不代表未来，也不构成买卖建议。'

type ConclusionInput = {
  comparison: CompareSet
  input: RunInput
  index: PriceIndex
}

export function hasCompletedYears(result: Pick<RunResult, 'start' | 'end'>, years: number): boolean {
  const anniversary = new Date(`${result.start}T00:00:00Z`)
  if (Number.isNaN(anniversary.getTime())) return false
  anniversary.setUTCFullYear(anniversary.getUTCFullYear() + years)
  return anniversary.getTime() <= Date.parse(`${result.end}T00:00:00Z`)
}

function periodDays(result: RunResult): number {
  return Math.max(0, Math.round((Date.parse(result.end) - Date.parse(result.start)) / 86400000))
}

function meetsMaterialThreshold(difference: number): boolean {
  return Math.abs(difference) + COMPARISON_TOLERANCE >= MATERIAL_DIFFERENCE
}

function sameWindow(result: RunResult, baseline: RunResult): boolean {
  return result.start === baseline.start && result.end === baseline.end
}

function drawdownDifference(result: RunResult, baseline: RunResult): number {
  return Math.abs(result.maxDrawdown.value) - Math.abs(baseline.maxDrawdown.value)
}

function drawdownPhrase(difference: number): string {
  if (difference > 0) return `加深 ${number(difference * 100, 1)} 个百分点`
  if (difference < 0) return `变浅 ${number(Math.abs(difference) * 100, 1)} 个百分点`
  return '幅度相同'
}

function displayName(symbol: string, index: PriceIndex, note?: string): string {
  const name = index.items.find(item => item.symbol === symbol)?.name
  const inner = [name && name !== symbol ? symbol : '', note ?? ''].filter(Boolean).join('，')
  const label = name && name !== symbol ? name : symbol
  return inner ? `${label}（${inner}）` : label
}

function finiteRuleOneValues(active: RunResult, hold: RunResult): boolean {
  return [
    active.final,
    hold.final,
    active.cagr,
    hold.cagr,
    active.maxDrawdown.value,
    hold.maxDrawdown.value,
  ].every(Number.isFinite) && hold.final !== 0
}

function ruleOne(input: RunInput, active: RunResult, hold: RunResult): string {
  const cagrDifference = active.cagr - hold.cagr
  const mddDifference = drawdownDifference(active, hold)
  const drawdowns = `最大回撤为 ${percent(active.maxDrawdown.value)}（不动 ${percent(hold.maxDrawdown.value)}，${drawdownPhrase(mddDifference)}）`
  const switchOnly = input.rule.kind === 'buyHold' && input.switch

  if (!meetsMaterialThreshold(cagrDifference)) {
    const text = switchOnly
      ? `按当前『不再平衡，只做大跌切换』，与不动的年化差不足 0.5 个百分点（${percent(active.cagr)} 对 ${percent(hold.cagr)}）；${drawdowns}。请结合调仓次数与成本判断，不据此归纳规则优劣。`
      : `当前规则与不动的年化差不足 0.5 个百分点（${percent(active.cagr)} 对 ${percent(hold.cagr)}）；${drawdowns}。请结合调仓次数与成本判断，不据此归纳规则优劣。`
    if (switchOnly) return `${text}这些差额来自大跌切换。`
    return input.switch
      ? `${text}这些差额包含大跌切换的影响，不能全部归因于普通再平衡。`
      : text
  }

  if (input.switch) {
    const finalDifference = active.final / hold.final - 1
    const label = switchOnly ? '不再平衡，只做大跌切换' : '再平衡＋大跌切换'
    const attribution = switchOnly ? '这些差额来自大跌切换。' : '这些差额包含大跌切换的影响，不能全部归因于普通再平衡。'
    return `按当前『${label}』，期末金额比不动${finalDifference >= 0 ? '高' : '低'} ${percent(Math.abs(finalDifference))}；年化收益为 ${percent(active.cagr)}（不动 ${percent(hold.cagr)}），${drawdowns}。${attribution}`
  }

  const finalDifference = active.final / hold.final - 1
  return `按当前规则，期末金额比不动${finalDifference >= 0 ? '高' : '低'} ${percent(Math.abs(finalDifference))}；年化收益为 ${percent(active.cagr)}（不动 ${percent(hold.cagr)}，${cagrDifference >= 0 ? '高' : '低'} ${number(Math.abs(cagrDifference) * 100, 1)} 个百分点），${drawdowns}。`
}

function concentrationNotice(input: RunInput, index: PriceIndex): string {
  const maxWeight = Math.max(...input.weights)
  if (!(maxWeight > 0.5)) return ''
  const position = input.weights.indexOf(maxWeight)
  const symbol = input.symbols[position]
  return `${displayName(symbol, index)}的原目标权重为 ${percent(maxWeight)}，组合权重较集中；剔除实验会显著改变组合结构，差值不能理解为该股票的独立收益贡献。`
}

function ruleTwo(input: RunInput, comparison: CompareSet, index: PriceIndex): string {
  const rows = comparison.leaveOneOut
  const base = comparison.custom.active
  const differences = rows.map(row => row.active.cagr - base.cagr)
  const qualifying = rows
    .map((row, position) => ({ row, difference: differences[position] }))
    .filter(item => item.difference < 0 && meetsMaterialThreshold(item.difference))
    .sort((left, right) => left.difference - right.difference)

  let text: string
  if (qualifying.length > 0) {
    const { row, difference } = qualifying[0]
    const symbolPosition = input.symbols.indexOf(row.dropped)
    const weight = input.weights[symbolPosition]
    text = `历史敏感性：剔除 ${displayName(row.dropped, index, `原目标权重 ${percent(weight)}`)}后，动态年化由 ${percent(base.cagr)} 降至 ${percent(row.active.cagr)}，下降 ${number(Math.abs(difference) * 100, 1)} 个百分点；其余权重已按比例重分。这说明本区间结果对它较敏感，不代表应保留或买入。`
  } else if (differences.every(difference => difference >= 0)) {
    text = '本区间剔除任何一只后，动态年化都未下降，因此不生成『收益最依赖』结论；请同时比较各行的回撤变化。'
  } else if (differences.every(difference => !meetsMaterialThreshold(difference))) {
    text = '逐一剔除后的年化与原组合差异都不到 0.5 个百分点，本区间未显示突出的单只敏感性。'
  } else {
    text = '本区间未出现剔除后年化下降至少 0.5 个百分点的成员，不生成『收益最依赖』结论；请同时比较各行的回撤变化。'
  }
  return `${text}${concentrationNotice(input, index)}`
}

function ruleThree(input: RunInput, comparison: CompareSet, index: PriceIndex): string {
  const stableSymbols = input.symbols.filter(symbol => index.items.find(item => item.symbol === symbol)?.group === 'stable')
  if (stableSymbols.length === 0) {
    return '当前没有页面分类为『稳定』的成员，不生成稳定资产结论；这不代表其余股票必然高波动或高风险。'
  }
  if (stableSymbols.length === input.symbols.length) {
    return '全部成员都属于页面的『稳定』分组，缺少其他分组对照，不自动概括稳定股作用。'
  }
  if (stableSymbols.length > 1) {
    return '组合有多只稳定组成员，不自动挑一只代表全组；请逐行比较剔除后的收益与回撤。'
  }

  const row = comparison.leaveOneOut.find(item => item.dropped === stableSymbols[0])
  if (!row) return INSUFFICIENT
  const base = comparison.custom.active
  const cagrDifference = row.active.cagr - base.cagr
  const mddDifference = drawdownDifference(row.active, base)
  if (cagrDifference > 0 && meetsMaterialThreshold(cagrDifference)
    && mddDifference > 0 && meetsMaterialThreshold(mddDifference)) {
    return `稳定组成员的历史取舍：剔除 ${displayName(row.dropped, index)}后，年化由 ${percent(base.cagr)} 升至 ${percent(row.active.cagr)}（+${number(cagrDifference * 100, 1)} 个百分点），最大回撤由 ${percent(base.maxDrawdown.value)} 变为 ${percent(row.active.maxDrawdown.value)}（加深 ${number(mddDifference * 100, 1)} 个百分点）。它在本组合、本区间呈现了『年化较低、回撤较浅』的取舍，不代表未来仍能降风险。`
  }
  return '稳定组成员的历史剔除结果见下表；本区间未呈现统一的收益—回撤取舍。'
}

export function buildConclusions({ comparison, input, index }: ConclusionInput): string[] {
  const { active, hold } = comparison.custom
  const oneYear = hasCompletedYears(active, 1)
  const threeYears = hasCompletedYears(active, 3)
  const selected = index.items.filter(item => input.symbols.includes(item.symbol))
  const hasQualityNotice = selected.some(item => item.status === 'stale'
    || item.dividendStatus === 'missing' || item.crossCheck === 'unavailable')
  const finish = (lines: string[]): string[] => {
    if (oneYear && !threeYears) lines.push('区间不足三年，以下仅描述本次结果，不用于归纳一般规律。')
    if (hasQualityNotice) lines.push(QUALITY_NOTICE)
    lines.push(FIXED_ENDING)
    return lines
  }

  if (!finiteRuleOneValues(active, hold)) return finish([INSUFFICIENT])
  if (!oneYear) {
    return finish([`本区间仅 ${periodDays(active)} 天：当前规则累计收益 ${percent(active.final - 1)}，不动 ${percent(hold.final - 1)}；最大回撤 ${percent(active.maxDrawdown.value)}，不动 ${percent(hold.maxDrawdown.value)}。区间不足一年，不展示年化差，也不生成规律判断。`])
  }
  if (input.rule.kind === 'buyHold' && !input.switch) {
    return finish(['当前未启用再平衡，两种结果相同，无法据此判断再平衡效果。'])
  }
  if (active.tradeCount === 0) {
    return finish(['本区间没有发生调仓，当前规则与不动结果相同；这段样本不能检验该规则的效果。'])
  }

  const lines = [ruleOne(input, active, hold)]
  if (input.symbols.length === 2) {
    lines.push('当前仅两只股票；逐一剔除后会变成单资产，不能据此判断谁在拉高分散组合，也不生成收益集中结论。')
  } else if (input.symbols.length >= 3 && !input.switch) {
    const rows = comparison.leaveOneOut
    if (rows.length !== input.symbols.length
      || rows.some(row => !sameWindow(row.active, active)
        || !Number.isFinite(row.active.cagr)
        || !Number.isFinite(row.active.maxDrawdown.value))) {
      lines.push(INSUFFICIENT)
    } else {
      lines.push(ruleTwo(input, comparison, index), ruleThree(input, comparison, index))
    }
  }
  return finish(lines)
}
