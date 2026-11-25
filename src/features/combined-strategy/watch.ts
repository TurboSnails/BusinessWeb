// 「月底会不会变档」的一句提醒：只用宏观攻守已算好的月内均线数据，不另算信号。
import { TIER_ORDER_DEFENSE_LEFT } from '../macro-posture/composite/labels'
import type { CompositeFile, TierId } from '../macro-posture/composite/types'
import { formatSharePct, tierLabel } from './labels'

export type TacticalWatch = {
  /** 一句话：剩余交易日均价低于多少点，月底降一档到哪 */
  text: string
  /** 门槛相对最新收盘的距离（负数 = 还要再跌多少）；门槛已在收盘上方时 ≥ 0 */
  gap: number
  /** 门槛已经在最新收盘之上，或月内均价已在均线下方 */
  close: boolean
}

function oneTierDown(tier: TierId): TierId | null {
  // TIER_ORDER_DEFENSE_LEFT：防守在左、进攻在右；往左一格就是降一档
  const idx = TIER_ORDER_DEFENSE_LEFT.indexOf(tier)
  return idx > 0 ? TIER_ORDER_DEFENSE_LEFT[idx - 1] : null
}

function points(value: number): string {
  return Math.round(value).toLocaleString('en-US')
}

function monthDay(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return m && d ? `${m} 月 ${d} 日` : iso
}

/**
 * 当月还没结束、正式档位没有被均线下调时，给出「月底前要留意」的一句话。
 * 已下调、数据缺失或本月已无剩余交易日时返回 null。
 */
export function tacticalWatch(file: CompositeFile | null | undefined): TacticalWatch | null {
  if (!file) return null
  const { tactical, final } = file.current
  const mtd = tactical?.mtd
  if (!mtd || tactical.below !== false) return null
  if (!(mtd.remaining > 0) || !final.tier) return null
  const next = oneTierDown(final.tier)
  if (!next) return null
  const share = formatSharePct(file.tiers.find(t => t.id === next)?.equityShare)
  const target = `月底降一档到${tierLabel(next)}${share ? `（上限的 ${share}）` : ''}`
  const month = Number(mtd.month.slice(5, 7))
  const monthText = month ? `${month} 月` : '本月'

  if (mtd.below) {
    return {
      text: `${monthText}至今标普均价已低于 10 个月均线；剩下 ${mtd.remaining} 个交易日如果拉不回来，${target}。`,
      gap: 0,
      close: true,
    }
  }
  const threshold = mtd.threshold
  const last = mtd.lastClose?.value
  if (threshold == null || !(threshold > 0) || !(last > 0)) return null
  const gap = threshold / last - 1
  const distance = gap < 0
    ? `比 ${monthDay(mtd.lastClose.date)}收盘 ${points(last)} 点低 ${Math.abs(gap * 100).toFixed(1)}%`
    : `已高于 ${monthDay(mtd.lastClose.date)}收盘 ${points(last)} 点`
  return {
    text: `${monthText}剩下 ${mtd.remaining} 个交易日，标普均价如果低于 ${points(threshold)} 点（${distance}），${target}。`,
    gap,
    close: gap >= -0.02,
  }
}
