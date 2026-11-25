import React from 'react'
import { TableWrap } from '../../components/ui'

/** 研究中页签的表格积木：候选对比表、下跌对比条、筛选按钮。 */

export function fmtNum(value: number | null | undefined, digits = 3): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value < 0 ? `−${Math.abs(value).toFixed(digits)}` : value.toFixed(digits)
}

export function fmtPct(value: number | null | undefined, digits = 1, signed = false): string {
  if (value == null || !Number.isFinite(value)) return '—'
  const body = `${Math.abs(value * 100).toFixed(digits)}%`
  if (value < 0) return `−${body}`
  return signed && value > 0 ? `+${body}` : body
}

/** 带符号的差值：夏普 +0.017；百分比列按「个百分点」写成 +3.0 点 */
function fmtDelta(d: number, unit: 'num' | 'pp'): string {
  const sign = d > 0 ? '+' : d < 0 ? '−' : '±'
  return unit === 'pp' ? `${sign}${Math.abs(d * 100).toFixed(1)} 点` : `${sign}${Math.abs(d).toFixed(3)}`
}

export type CompareCol<S> = {
  key: string
  head: string
  sub?: string
  get: (s: S) => number | null | undefined
  fmt: (v: number | null | undefined) => string
  /** 哪个方向算更好；不写则差值不着色 */
  better?: 'higher' | 'lower'
  unit?: 'num' | 'pp'
  /** 判定列：差值须达到这个门槛 */
  threshold?: number
}

export type CompareRow<S> = { id: string; name: string; rule: string; stats: S; verdict?: string }

function verdictParts(text: string): { tag: string; why: string } {
  const i = text.indexOf('：')
  return i < 0 ? { tag: text, why: '' } : { tag: text.slice(0, i), why: text.slice(i + 1) }
}

export function CompareTable<S>({ label, testId, baseId, rows, cols }: {
  label: string
  testId: string
  baseId: string
  rows: CompareRow<S>[]
  cols: CompareCol<S>[]
}): JSX.Element {
  const base = rows.find(r => r.id === baseId)!
  const gate = cols.find(c => c.threshold != null)
  return (
    <>
      {gate ? (
        <p className="lab-legend">
          <span className="lab-legend__gate">判定</span>
          看「{gate.head}」：须比基线高 {fmtNum(gate.threshold, 2)}。格内小字是与基线的差：
          <span className="lab-delta is-better">更好</span>
          <span className="lab-delta is-worse">更差</span>
        </p>
      ) : null}
      <TableWrap label={label} className="lab-wrap">
        <table className="cs-table lab-table lab-compare" data-testid={testId}>
          <thead>
            <tr>
              <th scope="col" className="lab-sticky">写法</th>
              {cols.map(c => (
                <th key={c.key} scope="col" className={c.threshold != null ? 'num is-gate' : 'num'}>
                  {c.head}
                  {c.sub ? <span className="lab-th-sub">{c.sub}</span> : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const isBase = row.id === baseId
              const v = row.verdict ? verdictParts(row.verdict) : null
              return (
                <tr key={row.id} className={isBase ? 'is-base' : undefined}>
                  <th scope="row" className="lab-sticky">
                    <span className="lab-name">
                      {row.name}
                      {isBase ? <span className="lab-tag lab-tag--base">基线</span> : null}
                      {v ? <span className={`lab-tag ${v.tag.includes('通过') && !v.tag.includes('不') ? 'lab-tag--pass' : 'lab-tag--fail'}`} title={row.verdict}>{v.tag}</span> : null}
                    </span>
                    <span className="lab-rule">{row.rule}</span>
                  </th>
                  {cols.map(c => {
                    const value = c.get(row.stats)
                    const ref = c.get(base.stats)
                    let delta: React.ReactNode = null
                    if (!isBase && value != null && ref != null && Number.isFinite(value) && Number.isFinite(ref)) {
                      const d = value - ref
                      let tone = ''
                      if (c.threshold != null) tone = d >= c.threshold ? 'is-better' : 'is-worse'
                      else if (c.better && Math.abs(d) > 1e-9) tone = (c.better === 'higher') === d > 0 ? 'is-better' : 'is-worse'
                      delta = (
                        <span className={`lab-delta ${tone}`}>
                          {fmtDelta(d, c.unit ?? 'num')}
                          {c.threshold != null && d < c.threshold ? <span className="lab-delta__note"> 未达 +{c.threshold}</span> : null}
                        </span>
                      )
                    }
                    return (
                      <td key={c.key} className={c.threshold != null ? 'num is-gate' : 'num'}>
                        <span className="lab-val">{c.fmt(value)}</span>
                        {delta}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableWrap>
    </>
  )
}

export type BarSeries = { key: string; label: string; tone: 'ref' | 'main' | 'main-soft' | 'alt' }

/** 一格内的横向条：每条一行，左侧名称、右侧数值；涨（正值）不画条只写数。 */
export function LossBars({ series, values, scale, caption }: {
  series: BarSeries[]
  values: Record<string, number | null | undefined>
  scale: number
  caption: string
}): JSX.Element {
  return (
    <div className="lab-bars" role="group" aria-label={caption}>
      {series.map(s => {
        const v = values[s.key]
        const w = v != null && v < 0 ? Math.min(1, Math.abs(v) / scale) * 100 : 0
        return (
          <div key={s.key} className="lab-bars__row" title={`${s.label} ${fmtPct(v, 1, true)}`}>
            <span className="lab-bars__label">{s.label}</span>
            <svg className="lab-bars__track" viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true">
              {w > 0 ? <rect className={`lab-bars__bar is-${s.tone}`} x="0" y="0" width={w} height="8" /> : null}
            </svg>
            <span className="lab-bars__value">{fmtPct(v, 1, true)}</span>
          </div>
        )
      })}
    </div>
  )
}

/** 0–1 的参与度条，虚线标恒定七成（0.7） */
export function RatioBar({ value, refValue = 0.7 }: { value: number; refValue?: number }): JSX.Element {
  const w = Math.max(0, Math.min(1, value)) * 100
  return (
    <span className="lab-ratio">
      <svg className="lab-ratio__track" viewBox="0 0 100 14" preserveAspectRatio="none" aria-hidden="true">
        <rect className="lab-ratio__bg" x="0" y="3" width="100" height="8" />
        <rect className="lab-ratio__bar" x="0" y="3" width={w} height="8" />
        <line className="lab-ratio__ref" x1={refValue * 100} x2={refValue * 100} y1="0" y2="14" />
      </svg>
      <span className="lab-ratio__value">{fmtNum(value, 2)}</span>
    </span>
  )
}

export function BarLegend({ series, note }: { series: BarSeries[]; note?: string }): JSX.Element {
  return (
    <p className="lab-legend">
      {series.map(s => (
        <span key={s.key} className="lab-legend__item"><span className={`lab-legend__swatch is-${s.tone}`} aria-hidden="true" />{s.label}</span>
      ))}
      {note ? <span className="lab-legend__note">{note}</span> : null}
    </p>
  )
}

export function FilterChips<K extends string>({ label, options, value, onChange }: {
  label: string
  options: { key: K; label: string; count: number }[]
  value: K
  onChange: (k: K) => void
}): JSX.Element {
  return (
    <div className="lab-chips" role="group" aria-label={label}>
      {options.map(o => (
        <button
          key={o.key}
          type="button"
          className="lab-chip"
          aria-pressed={o.key === value}
          onClick={() => onChange(o.key)}
        >
          {o.label}<span className="lab-chip__count">{o.count}</span>
        </button>
      ))}
    </div>
  )
}
