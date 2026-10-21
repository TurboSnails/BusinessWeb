import type { LimitUpConcept, LimitUpStock } from '../../types'

export type LadderStock = LimitUpStock & { concepts: string[] }
export type LadderTier = { boards: number; stocks: LadderStock[] }

/** 非「只看涨停」模式下用涨幅兜底识别涨停；ST 的 5% 涨停可能漏判，只看涨停模式则全部计入 */
const NEAR_LIMIT_PCT = 9.5

/** 把各概念下的个股去重（一只股票可属多个概念），按连板数从高到低分层，层内按涨停时间早到晚 */
export function buildLadder(concepts: LimitUpConcept[], onlyLimitUp: boolean): LadderTier[] {
  const byCode = new Map<string, LadderStock>()
  for (const concept of concepts) {
    for (const stock of concept.stocks) {
      if (!onlyLimitUp && stock.consecutiveDays <= 0 && stock.changePercent < NEAR_LIMIT_PCT) continue
      const seen = byCode.get(stock.code)
      if (seen) { if (!seen.concepts.includes(concept.name)) seen.concepts.push(concept.name) }
      else byCode.set(stock.code, { ...stock, concepts: [concept.name] })
    }
  }
  const tiers = new Map<number, LadderStock[]>()
  for (const stock of byCode.values()) {
    const boards = Math.max(1, stock.consecutiveDays)
    tiers.set(boards, [...(tiers.get(boards) ?? []), stock])
  }
  return [...tiers.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([boards, stocks]) => ({ boards, stocks: stocks.sort((a, b) => (a.limitUpTime || '99').localeCompare(b.limitUpTime || '99')) }))
}

export const ladderCopyText = (tiers: LadderTier[]): string =>
  tiers.map(t => `${t.boards}板：${t.stocks.map(s => `${s.name}(${s.code})`).join('、')}`).join('\n')
