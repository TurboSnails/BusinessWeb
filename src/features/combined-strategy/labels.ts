import type { Heat, MacroSide } from './types'
import type { TierId } from '../macro-posture/composite/types'

export const HEAT_ORDER: Heat[] = ['cold', 'mid', 'hot']
export const MACRO_SIDE_ORDER: MacroSide[] = ['offense', 'neutral', 'defense']

export const HEAT_LABEL: Record<Heat, string> = {
  cold: '偏冷',
  mid: '居中',
  hot: '偏热',
}

export const MACRO_SIDE_LABEL: Record<MacroSide, string> = {
  offense: '进攻侧',
  neutral: '中性',
  defense: '防守侧',
}

export const TIER_LABEL: Record<TierId, string> = {
  offense: '进攻',
  'lean-offense': '偏进攻',
  neutral: '中性',
  'lean-defense': '偏防守',
  defense: '防守',
}

/** ASCII 负号换成「−」；小数点前的除外 */
export function visibleText(text: string): string {
  return text.replace(/(?<![\d.])-(?=\d)/g, '−')
}

export function formatNum2(value: number | null | undefined, opts?: { signed?: boolean }): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const body = Math.abs(value).toFixed(2)
  if (opts?.signed) {
    if (value === 0) return '0.00'
    return `${value > 0 ? '+' : '−'}${body}`
  }
  return value < 0 ? `−${body}` : body
}

export function formatPct1(value: number | null | undefined, opts?: { signed?: boolean }): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const pct = value * 100
  const body = Math.abs(pct).toFixed(1)
  if (opts?.signed) {
    if (pct === 0) return '0.0%'
    return `${pct > 0 ? '+' : '−'}${body}%`
  }
  return `${pct < 0 ? '−' : ''}${body}%`
}

export function formatSharePct(share: number | null | undefined): string | null {
  if (share == null || !Number.isFinite(share)) return null
  return `${(share * 100).toFixed(1).replace(/\.0$/, '')}%`
}

export function tierLabel(id: TierId | null | undefined): string {
  if (!id) return '证据不足'
  return TIER_LABEL[id]
}

export function heatLabel(heat: Heat | null | undefined): string {
  if (!heat) return '—'
  return HEAT_LABEL[heat]
}

export function macroSideLabel(side: MacroSide | null | undefined): string {
  if (!side) return '—'
  return MACRO_SIDE_LABEL[side]
}
