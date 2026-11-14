// LwChart 配色：canvas 不认 CSS 变量，绘制前从 :root 读出 src/index.css 里 token 的实际值（不在代码里重复写色值）。
// 读不到（SSR / 未加载样式表）时退回中性灰，保证图仍能画出来。
import type { LevelKey } from './levelsModel'

export function token(name: string): string {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
    if (v) return v
  } catch { /* SSR */ }
  return 'gray'
}

/** 价位线配色：避开涨跌色；情景用虚线，DCF 用点线 */
export const LEVEL_STYLE: Record<LevelKey, { color: string; dash: 'dashed' | 'dotted' }> = {
  bear: { color: '--warm-ink', dash: 'dashed' },
  base: { color: '--accent-ink', dash: 'dashed' },
  bull: { color: '--system-purple', dash: 'dashed' },
  'dcf-buy': { color: '--accent-warm', dash: 'dotted' },
  'dcf-fair': { color: '--text-secondary', dash: 'dotted' },
}
export const MA_COLOR: Record<number, string> = { 20: '--system-yellow', 60: '--system-teal' }

