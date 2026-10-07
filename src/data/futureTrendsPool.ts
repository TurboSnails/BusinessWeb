/**
 * 未来趋势候选池：把九个赛道的中国与海外公司按发行人去重，先不看股价，只按“增长 + 确定性”打基本面分，
 * 再按买点距离标记能否现在投资。全部由各赛道排序数据在运行时汇总，刷新数据后自动更新。
 * 基本面分是研究打分规则，不是预测；投资状态沿用各赛道的程序化价位，未经公司级三情景认证。
 */
import { ADAS_LEVELS, ADAS_PICKS } from './futureTrendsAdasPicks'
import { AI_LEVELS, AI_PICKS } from './futureTrendsAiPicks'
import type { AiLevel, AiPick } from './futureTrendsAiPicks'
import { TRENDS } from './futureTrends'
import { ADAS_EXTRA_LEVELS, ADAS_EXTRA_PICKS, AI_EXTRA_LEVELS, AI_EXTRA_PICKS, SECTOR_PICKS, TREND_METRICS, US_PICKS } from './futureTrendsSectorPicks'

export type PoolStatus = '可现在投资' | '接近买点' | '股价偏高' | '基本面待验证'
export const POOL_STATUS_ORDER: PoolStatus[] = ['可现在投资', '接近买点', '股价偏高', '基本面待验证']

export interface PoolItem {
  key: string
  pick: AiPick
  level?: AiLevel
  market: '中国' | '海外'
  trends: string[]
  revGrowth: number | null
  profitGrowth: number | null
  growthScore: number
  certaintyScore: number
  score: number
  growthLevel: '高' | '中' | '低'
  certaintyLevel: '高' | '中' | '低'
  grade: 'A' | 'B' | 'C' | 'D'
  status: PoolStatus
  statusNote: string
  /** 现价到 2:1 买点的距离（%），负数表示还需下跌；未建模为 null。 */
  gap: number | null
}

const num = (s: string): number => Number(s.replace('−', '-'))

/** 从“营收 +54% / 归母 +96%（2026H1）”取出两个增速。 */
export function parseGrowth(text?: string): [number | null, number | null] {
  if (!text) return [null, null]
  const m = text.match(/营收\s*([+\-−]?\d+(?:\.\d+)?)%.*?(?:归母|盈利)\s*([+\-−]?\d+(?:\.\d+)?)%/)
  return m ? [num(m[1]), num(m[2])] : [null, null]
}

/** “现价附近”记 0；“−21%”记 −21；其他文字（重估价等）为 null。 */
export function parseGap(gap?: string): number | null {
  if (!gap) return null
  if (gap.includes('现价附近')) return 0
  const m = gap.match(/^([+\-−]?\d+(?:\.\d+)?)%$/)
  return m ? num(m[1]) : null
}

const LEVEL3 = { 高: 3, 中: 2, 低: 1, 待核: 1 } as const

function growthScore(pick: AiPick, rev: number | null, profit: number | null): number {
  let s = { 3: 25, 2: 15, 1: 5 }[LEVEL3[pick.growth]]
  // 数据部分连续计分：营收增速 0–60% 对应 0–15 分，利润增速 −20%~50% 对应 −4~10 分
  if (rev !== null) s += Math.min(Math.max(rev, 0), 60) / 4
  if (profit !== null) s += Math.min(Math.max(profit, -20), 50) / 5
  return Math.round(Math.max(0, s))
}

/** 利润含一次性项、处于周期高点或口径失真：确定性扣分。只看不建模原因与明确的周期/一次性表述。 */
const ONE_OFF = /一次性|授权首付|失真|高峰|周期高点|周期利润|周期品|强周期|涨价周期/

function certaintyScore(pick: AiPick, level?: AiLevel): number {
  let s = { 3: 20, 2: 12, 1: 4 }[LEVEL3[pick.moat]]
  const loss = pick.pe?.startsWith('亏损') || /亏损/.test(level?.buy ?? '')
  if (!loss) s += 10
  s += level?.risk === '低' ? 15 : level?.risk === '中' ? 8 : 0
  if (ONE_OFF.test(`${pick.risk} ${level?.buy ?? ''}`)) s -= 8
  if (pick.tier === '证据不足') s -= 10
  return Math.max(0, Math.min(50, s))
}

function statusOf(pick: AiPick, level: AiLevel | undefined, gap: number | null): [PoolStatus, string] {
  const buy = level?.buy ?? ''
  const modeled = buy.startsWith('≤') || buy.startsWith('价位过远')
  if (modeled && gap !== null && gap >= -5) return ['可现在投资', '现价在 2:1 买点附近，可按买入区分批']
  if (pick.tier === '条件关注') return ['接近买点', '原赛道评为条件关注，但赔率未经模型认证，先补三情景']
  if (modeled && gap !== null && gap >= -20) return ['接近买点', `还需回落约 ${Math.abs(gap)}% 到 2:1 买点`]
  if (modeled || /PE\s*[>≥≈]|PE 偏高|估值/.test(buy) || pick.upDown.startsWith('基准<现价')) {
    return ['股价偏高', gap !== null ? `距 2:1 买点 ${gap}%，价格已透支基本面` : '估值过高，倍数模型不给买点']
  }
  return ['基本面待验证', /亏损/.test(buy + (pick.pe ?? '')) ? '尚未盈利，先看扭亏' : '利润含一次性项或数据不足']
}

function build(): PoolItem[] {
  const trendName = Object.fromEntries(TRENDS.map(t => [t.id, t.name.replace(/（.*?）/, '')]))
  const sources: { trend: string; market: PoolItem['market']; picks: AiPick[]; levels: AiLevel[] }[] = [
    { trend: 'ai', market: '中国', picks: [...AI_PICKS, ...AI_EXTRA_PICKS], levels: [...AI_LEVELS, ...AI_EXTRA_LEVELS] },
    { trend: 'adas', market: '中国', picks: [...ADAS_PICKS, ...ADAS_EXTRA_PICKS], levels: [...ADAS_LEVELS, ...ADAS_EXTRA_LEVELS] },
    ...Object.entries(SECTOR_PICKS).map(([trend, s]) => ({ trend, market: '中国' as const, picks: s.picks, levels: s.levels })),
    ...Object.entries(US_PICKS).map(([trend, s]) => ({ trend, market: '海外' as const, picks: s.picks, levels: s.levels })),
  ]
  const map = new Map<string, PoolItem>()
  for (const src of sources) {
    for (const raw of src.picks) {
      const key = `${src.market}:${raw.code.split(/\s*[/（]\s*/)[0]}`
      const existing = map.get(key)
      if (existing) {
        if (!existing.trends.includes(trendName[src.trend])) existing.trends.push(trendName[src.trend])
        continue
      }
      const pick = { ...TREND_METRICS[raw.code], ...TREND_METRICS[raw.code.split(/\s*\/\s*/)[0]], ...raw }
      const level = src.levels.find(l => l.code === raw.code)
      const [rev, profit] = parseGrowth(pick.growthRate)
      const g = growthScore(pick, rev, profit)
      const c = certaintyScore(pick, level)
      const score = g + c
      const gap = parseGap(level?.gap)
      const [status, statusNote] = statusOf(pick, level, gap)
      map.set(key, {
        key, pick, level, market: src.market, trends: [trendName[src.trend]], revGrowth: rev, profitGrowth: profit,
        growthScore: g, certaintyScore: c, score,
        growthLevel: g >= 38 ? '高' : g >= 22 ? '中' : '低',
        certaintyLevel: c >= 35 ? '高' : c >= 22 ? '中' : '低',
        grade: score >= 75 ? 'A' : score >= 60 ? 'B' : score >= 45 ? 'C' : 'D',
        status, statusNote, gap,
      })
    }
  }
  return [...map.values()]
}

export const POOL: PoolItem[] = build()

/** 按基本面：总分 → 确定性 → 增长。 */
export const byFundamentals = (a: PoolItem, b: PoolItem): number =>
  b.score - a.score || b.certaintyScore - a.certaintyScore || b.growthScore - a.growthScore

/** 按可投资：投资状态 → 基本面分 → 离买点更近。 */
export const byInvestability = (a: PoolItem, b: PoolItem): number =>
  POOL_STATUS_ORDER.indexOf(a.status) - POOL_STATUS_ORDER.indexOf(b.status) || byFundamentals(a, b) || (b.gap ?? -999) - (a.gap ?? -999)

/** 导出用的 JSON 记录（中文键，与公司研究页的导出风格一致）。 */
export function poolItemJson(x: PoolItem): Record<string, unknown> {
  const p = x.pick; const l = x.level
  return {
    市场: x.market, 代码: p.code, 公司: p.name, 所属赛道: x.trends, 现价: p.price,
    投资状态: x.status, 状态说明: x.statusNote, 赛道评级: p.tier, 距买点: x.gap === null ? null : `${x.gap}%`,
    基本面: { 档位: x.grade, 总分: x.score, 增长分: x.growthScore, 确定性分: x.certaintyScore, 增长: x.growthLevel, 确定性: x.certaintyLevel },
    估值与增速: { PE: p.pe ?? null, PEG: p.peg ?? null, 增速: p.growthRate ?? null, 营收增速: x.revGrowth, 利润增速: x.profitGrowth },
    盈亏比: { 盈亏比: p.ratio, 上行下行: p.upDown, 胜率: p.winRate, 期望: p.expected },
    买卖点位: l ? { 买入区: l.buy, 距现价: l.gap, 认错线: l.stop, 止盈: l.takeProfit, 仓位上限: l.cap, 重估触发: l.trigger } : null,
    增长点: p.space ?? null,
    技术壁垒: { 等级: p.moat, 依据: p.barrier ?? null },
    风险: { 等级: l?.risk ?? null, 说明: p.risk, 失效条件: l?.invalid ?? null },
    要点: p.note,
  }
}

/** 浏览器下载 JSON 文件。 */
export function downloadJson(fileName: string, data: unknown): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = fileName
  document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
