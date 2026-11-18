// 板块关联 ETF：每个板块列关联 ETF 的数量、平均涨幅、成交额合计与成交额最大的几只（含跟踪指数与匹配依据）。
import React, { useState } from 'react'
import type { EtfBoard } from './model'

const num = (x: number | null | undefined, d = 2): string => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(d).replace('-', '−'))
const pct = (x: number | null | undefined): string => (x == null || !Number.isFinite(x) ? '—' : `${x > 0 ? '+' : ''}${num(x)}%`)
const tone = (x: number | null | undefined): string => (x == null || x === 0 ? '' : x > 0 ? 'mm-up' : 'mm-down')
const SHOWN = 8

export default function EtfLinks({ boards, pct: boardPct }: { boards: EtfBoard[]; pct: (code: string) => number | null }): JSX.Element {
  const [all, setAll] = useState(false)
  const shown = all ? boards : boards.slice(0, SHOWN)
  return (
    <>
      <ul className="kp-etf">
        {shown.map(b => (
          <li key={b.code} className="kp-etf__board" aria-label={`${b.name} 关联 ETF`}>
            <p className="kp-etf__head">
              <b>{b.name}</b>
              <span className={tone(boardPct(b.code))}>板块 {pct(boardPct(b.code))}</span>
              {b.count > 0 && <span>ETF {b.count} 只 · 平均 <b className={tone(b.avgPct)}>{pct(b.avgPct)}</b> · 成交 {num(b.amount, 1)} 亿</span>}
            </p>
            {b.count > 0 ? (
              <>
                <ul className="kp-etf__list">
                  {b.etfs.map(e => (
                    <li key={e.code}>
                      <span className="kp-etf__name">{e.name}<small>{e.code}</small></span>
                      <span className={`kp-etf__num ${tone(e.pct)}`}>{pct(e.pct)}</span>
                      <span className="kp-etf__num">{num(e.amount)} 亿</span>
                      <small className="kp-etf__idx">跟踪 {e.indexName}{e.basis === 'catalog' ? '（站内核验）' : ''}</small>
                    </li>
                  ))}
                </ul>
                <p className="kp-etf__basis">匹配依据：规则「{b.rule?.label}」{b.rule?.scope === 'broad' ? '（宽口径）' : ''}，跟踪指数名称含「{b.rule?.keywords.join(' / ')}」之一</p>
              </>
            ) : (
              <p className="kp-etf__none">暂无对应 ETF<small>{b.rule ? `（规则「${b.rule.label}」下暂无已知跟踪指数相符的场内 ETF）` : '（关键词表未收录该板块）'}</small></p>
            )}
          </li>
        ))}
      </ul>
      {boards.length > SHOWN && <button type="button" className="kp-more" onClick={() => setAll(v => !v)}>{all ? '收起' : `显示全部 ${boards.length} 个板块`}</button>}
    </>
  )
}
