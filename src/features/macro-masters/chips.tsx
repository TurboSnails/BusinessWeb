// 宏观大师板块共用的小标签（manager 维护）：总览页与大师页用同一套措辞和色调。
// 色调只用站内中性语义（warm / accent / neutral / muted），不借用涨跌色；含义都有文字，不只靠颜色。
import React from 'react'
import { Badge } from '../../components/ui'
import type { Horizon, Lean, MasterTake, Posture } from './types'

export const LEAN_LABELS: Record<Lean, string> = {
  caution: '偏谨慎',
  support: '偏积极',
  neutral: '中性',
  unknown: '缺数据',
}

/** 马克斯体温清单专用措辞：过热一侧对应偏谨慎，过冷一侧对应偏积极 */
export const TEMPERATURE_LABELS: Record<Lean, string> = {
  caution: '过热一侧',
  support: '过冷一侧',
  neutral: '居中',
  unknown: '缺数据',
}

export const POSTURE_LABELS: Record<Posture, string> = {
  defense: '偏防守',
  neutral: '中性',
  offense: '偏进攻',
  unknown: '数据不足',
}

export const HORIZON_LABELS: Record<Horizon, string> = {
  short: '短线（数周到数月）',
  medium: '中期（基本面）',
  long: '长期（数年的回报空间）',
  contrarian: '逆向线索',
}

export const MODE_LABELS: Record<MasterTake['mode'], string> = {
  rule: '有明确规则',
  checklist: '逐项对照',
  reference: '只列线索',
}

export const MODE_HINTS: Record<MasterTake['mode'], string> = {
  rule: '他本人给过可以直接套用的规则，本站据此给出档位。',
  checklist: '他没有给过合成规则，本站只逐项对照读数，不给档位。',
  reference: '他的方法无法用读数机械对照，这里只列相关线索。',
}

const LEAN_TONES = { caution: 'warm', support: 'accent', neutral: 'neutral', unknown: 'muted' } as const
const POSTURE_TONES = { defense: 'warm', offense: 'accent', neutral: 'neutral', unknown: 'muted' } as const

export function LeanChip({ lean, labels = LEAN_LABELS }: { lean: Lean; labels?: Record<Lean, string> }): JSX.Element {
  return <Badge tone={LEAN_TONES[lean]} className={`mm-chip mm-chip--${lean}`}>{labels[lean]}</Badge>
}

export function PostureChip({ posture, prefix }: { posture: Posture; prefix?: string }): JSX.Element {
  return (
    <Badge tone={POSTURE_TONES[posture]} className={`mm-chip mm-chip--${posture}`}>
      {prefix}{POSTURE_LABELS[posture]}
    </Badge>
  )
}

export function ModeChip({ mode }: { mode: MasterTake['mode'] }): JSX.Element {
  return <Badge tone="neutral" className="mm-chip mm-chip--mode" title={MODE_HINTS[mode]}>{MODE_LABELS[mode]}</Badge>
}

/** 读数来源的机构名；认不出的网址显示域名，纯文字原样返回 */
export function sourceLabel(source: string): string {
  const known: Array<[RegExp, string]> = [
    [/fred\.stlouisfed\.org/, '圣路易斯联储 FRED'],
    [/cboe\.com/, 'Cboe'],
    [/cnn\.com/, 'CNN'],
    [/aaii\.com/, 'AAII'],
    [/factset\.com/, 'FactSet'],
    [/finra\.org/, 'FINRA'],
    [/naaim\.org/, 'NAAIM'],
    [/multpl\.com/, 'multpl（席勒数据）'],
    [/finance\.yahoo\.com/, 'Yahoo 财经'],
    [/github\.com\/datasets\/s-and-p-500-companies/, '标普 500 成分股名单（公开数据集）'],
    [/macenews\.com/, 'MaceNews 转述美银调查'],
    [/ici\.org/, 'ICI'],
    [/financialresearch\.gov/, 'OFR'],
  ]
  const labels: string[] = []
  for (const [pattern, label] of known) {
    if (pattern.test(source) && !labels.includes(label)) labels.push(label)
  }
  if (labels.length) return labels.join('、')
  const url = source.match(/https?:\/\/([^/\s]+)/)
  return url ? url[1].replace(/^www\./, '') : source
}

/** 来源里的第一个网址（用于做成链接）；没有网址返回 undefined */
export function sourceHref(source: string): string | undefined {
  return source.match(/https?:\/\/[^\s·）)]+/)?.[0]
}
