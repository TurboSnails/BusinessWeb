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

/**
 * 五档仓位比例：与 macro-posture 规则表一致（offense→defense）。
 * combined-strategy.json 不含档位表；用这份常量把 official/previous 档位换成比例。
 */
export const TIER_EQUITY_SHARE: Record<TierId, number> = {
  offense: 1,
  'lean-offense': 0.85,
  neutral: 0.7,
  'lean-defense': 0.5,
  defense: 0.3,
}

function shareOf(
  id: TierId | null | undefined,
  cur: TierId | null | undefined,
  equityShare: number | null | undefined,
): number | null {
  if (id == null) return null
  // 当前档位以数据里的比例为准；官方档、上月档才查常量表
  if (id === cur && equityShare != null && Number.isFinite(equityShare)) return equityShare
  return TIER_EQUITY_SHARE[id] ?? null
}

function impliedPct(cap: number, share: number): number {
  return Math.round(cap * share)
}

export type ExecutableKind = 'hold' | 'adjust' | 'provisional' | 'fallback'

/** 可执行仓位：标题文案 + 换算卡要用的持有档位 */
export type ExecutablePosition = {
  kind: ExecutableKind
  text: string
  /** 现在应持有的档位比例（情况 3 为官方档） */
  holdShare: number | null
  /** 公式旁「× …档位」的称呼 */
  holdShareLabel: string | null
  /** 月底可能变为的绝对仓位 %（仅 provisional） */
  pendingImplied: number | null
}

/**
 * 按 buildInstruction 三种情况组装可执行仓位文案（绝对值 + 乘式）。
 * 不解析 instruction 文本；缺比例时回退原 instruction。
 */
export function resolveExecutable(opts: {
  instruction: string
  macroTier: TierId | null | undefined
  equityShare: number | null | undefined
  official: { tier: TierId | null; previousTier: TierId | null } | null | undefined
  cap: number
}): ExecutablePosition {
  const { instruction, macroTier: cur, equityShare, official, cap } = opts
  const fallback = (): ExecutablePosition => ({
    kind: 'fallback',
    text: visibleText(instruction),
    holdShare: equityShare != null && Number.isFinite(equityShare) ? equityShare : null,
    holdShareLabel: equityShare != null && Number.isFinite(equityShare) ? '当前档位' : null,
    pendingImplied: null,
  })

  if (cur == null) return fallback()

  const off = official?.tier ?? null
  const prev = official?.previousTier ?? null
  const n = shareOf(cur, cur, equityShare)
  if (n == null) return fallback()

  // 情况 1 / 收尾：档位未变（含 prev 为空）
  if (cur === off && (off === prev || prev == null)) {
    const implied = impliedPct(cap, n)
    const sharePct = formatSharePct(n)
    return {
      kind: 'hold',
      text: visibleText(
        `美股股票仓位约 ${implied}%（你的上限 ${cap}% × 当前档位 ${sharePct}），本月不用调。`,
      ),
      holdShare: n,
      holdShareLabel: '当前档位',
      pendingImplied: null,
    }
  }

  // 情况 2：本月换档
  if (cur === off && off !== prev && prev != null) {
    const m = shareOf(prev, cur, equityShare)
    if (m == null) return fallback()
    const implied = impliedPct(cap, n)
    const prevImplied = impliedPct(cap, m)
    const sharePct = formatSharePct(n)
    return {
      kind: 'adjust',
      text: visibleText(
        `本月内把美股股票仓位调到约 ${implied}%（上限 ${cap}% × 新档位 ${sharePct}），上月约 ${prevImplied}%。`,
      ),
      holdShare: n,
      holdShareLabel: '新档位',
      pendingImplied: null,
    }
  }

  // 情况 3：读数与官方档不同——先按官方档持有
  if (cur !== off) {
    const k = shareOf(off, cur, equityShare)
    if (k == null) return fallback()
    const holdImplied = impliedPct(cap, k)
    const pending = impliedPct(cap, n)
    const offPct = formatSharePct(k)
    return {
      kind: 'provisional',
      text: visibleText(
        `美股股票仓位先保持约 ${holdImplied}%（上限 ${cap}% × 官方档位 ${offPct}）；按目前数据，月底可能变为约 ${pending}%，等月底定档再调。`,
      ),
      holdShare: k,
      holdShareLabel: '官方档位',
      pendingImplied: pending,
    }
  }

  return fallback()
}

/** 只要标题文案时用 */
export function executableInstruction(opts: Parameters<typeof resolveExecutable>[0]): string {
  return resolveExecutable(opts).text
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
