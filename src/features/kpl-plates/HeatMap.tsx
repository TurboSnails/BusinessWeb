// 板块资金热力图：面积 ∝ |主力净流入|，颜色 = 涨跌幅分档（红涨绿跌，CSS 变量见 kpl-plates.css 的 kp-heat--*）。
// 宽屏：SVG 矩形树图（squarify 按比例切分）；手机：按 |主力净流入| 排序的方块网格，大小三档。两者由 CSS 媒体查询切换。
// 悬停 / 点按 / 键盘聚焦方块，在图下方显示明细；另有表格视图。
import React, { useMemo, useState } from 'react'
import { TableWrap } from '../../components/ui'
import { HEAT_STEPS, heatItems, heatStep, sizeBucket, squarify, type Board } from './model'

const W = 960
const H = 520
const num = (x: number | null | undefined, d = 2): string => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(d).replace('-', '−'))
const pct = (x: number | null | undefined): string => (x == null || !Number.isFinite(x) ? '—' : `${x > 0 ? '+' : ''}${num(x)}%`)
const yi = (x: number | null | undefined, d = 2): string => (x == null || !Number.isFinite(x) ? '—' : `${x > 0 ? '+' : ''}${num(x, d)} 亿`)
const tone = (x: number | null | undefined): string => (x == null || x === 0 ? '' : x > 0 ? 'mm-up' : 'mm-down')
/** 方块太窄时截断板块名（按每字约 13 个视图单位估算） */
const fit = (name: string, w: number): string => { const n = Math.max(2, Math.floor((w - 10) / 13)); return name.length > n ? `${name.slice(0, n - 1)}…` : name }
const tileLabel =(b: Board): string => `${b.name}：涨跌幅 ${pct(b.pct)}，主力净额 ${yi(b.mainNet)}`

export default function HeatMap({ rows, label }: { rows: Board[]; label: string }): JSX.Element {
  const { items, skipped } = useMemo(() => heatItems(rows), [rows])
  const rects = useMemo(() => squarify(items.map(b => Math.abs(b.mainNet!)), W, H), [items])
  const [sel, setSel] = useState<string | null>(null)
  const [table, setTable] = useState(false)
  const picked = items.find(b => b.code === sel) ?? null
  const max = items.length ? Math.abs(items[0].mainNet!) : 0
  if (!items.length) return <p className="mm-empty">暂无主力净流入数据</p>
  return (
    <div className="kp-heat">
      <svg className="kp-heat__svg" viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`${label}（矩形树图）`}>
        {items.map((b, i) => {
          const r = rects[i]
          const big = r.w > 70 && r.h > 34
          return (
            <g key={b.code} className={`kp-heat__cell${sel === b.code ? ' is-on' : ''}`} tabIndex={0} role="button" aria-label={tileLabel(b)}
              onMouseEnter={() => setSel(b.code)} onFocus={() => setSel(b.code)} onClick={() => setSel(b.code)}>
              <title>{tileLabel(b)}</title>
              <rect className={`kp-heat__rect kp-heat--${heatStep(b.pct)}`} x={r.x} y={r.y} width={r.w} height={r.h} rx="4" />
              {big && (
                <text className="kp-heat__text" x={r.x + 6} y={r.y + 18}>
                  <tspan className="kp-heat__name">{fit(b.name, r.w)}</tspan>
                  {r.w > 120 && <tspan x={r.x + 6} dy="16">{pct(b.pct)} · {yi(b.mainNet, 1)}</tspan>}
                  {r.w <= 120 && <tspan x={r.x + 6} dy="16">{pct(b.pct)}</tspan>}
                </text>
              )}
            </g>
          )
        })}
      </svg>
      <div className="kp-heat__grid" role="group" aria-label={`${label}（方块网格）`}>
        {items.map(b => (
          <button key={b.code} type="button" aria-pressed={sel === b.code} aria-label={tileLabel(b)}
            className={`kp-heat__tile kp-heat__tile--${sizeBucket(b.mainNet!, max)} kp-heat--${heatStep(b.pct)}${sel === b.code ? ' is-on' : ''}`}
            onClick={() => setSel(b.code)}>
            <b>{b.name}</b>
            <span>{pct(b.pct)}</span>
            <small>{yi(b.mainNet, 1)}</small>
          </button>
        ))}
      </div>
      <p className="kp-heat__tip" aria-live="polite">
        {picked
          ? <><b>{picked.name}</b> 涨跌幅 <b className={tone(picked.pct)}>{pct(picked.pct)}</b> · 主力净额 <b className={tone(picked.mainNet)}>{yi(picked.mainNet)}</b> · 成交额 {num(picked.amount, 1)} 亿{picked.leader ? <> · 领涨 {picked.leader.name} <span className={tone(picked.leader.pct)}>{pct(picked.leader.pct)}</span></> : null}</>
          : '悬停或点按方块查看明细'}
      </p>
      <ul className="kp-heat__legend" aria-label="颜色图例：当日涨跌幅">
        {HEAT_STEPS.map(s => <li key={s.id}><i className={`kp-heat__sw kp-heat--${s.id}`} aria-hidden="true" />{s.label}</li>)}
      </ul>
      <button type="button" className="kp-more" aria-expanded={table} onClick={() => setTable(v => !v)}>{table ? '收起表格' : '以表格查看'}</button>
      {table && (
        <TableWrap label={`${label}（表格）`}>
          <table className="mm-table kp-table">
            <thead><tr><th>板块</th><th className="num">主力净额</th><th className="num">涨跌幅</th><th className="num">成交额</th></tr></thead>
            <tbody>
              {items.map(b => (
                <tr key={b.code}>
                  <td className="kp-name">{b.name}</td>
                  <td className={`num ${tone(b.mainNet)}`}>{yi(b.mainNet)}</td>
                  <td className={`num ${tone(b.pct)}`}>{pct(b.pct)}</td>
                  <td className="num">{num(b.amount, 1)} 亿</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      {skipped > 0 && <p className="mm-method">另有 {skipped} 个板块主力净流入缺失或为 0，未画入。</p>}
    </div>
  )
}
