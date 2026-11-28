import React, { useMemo } from 'react'
import { Badge, Stat, StatGrid, TableWrap } from '../../../components/ui'
import type { EarningsData, EarningsEstimate, StockLookupApi } from '../types'
import { changeTone, fmtPct, fmtUsdAmount } from './format'
import { fiscalLabel, fmtEps, nextEarningsView, PERIOD_LABEL, shortFiscalLabel, surpriseBars, trendPoints } from './earnings'
import { parseLookupSymbol } from './symbolParse'
import { UsBlockCard } from './UsBlockCard'
import { todayEt, useUsBlock } from './useUsBlock'

export function EarningsPanel({ symbol, api }: { symbol: string; api: StockLookupApi }): JSX.Element {
  const usOnly = (parseLookupSymbol(symbol)?.market ?? 'us') === 'us'
  const state = useUsBlock(usOnly, symbol, api, signal => api.earnings(symbol, signal))
  return (
    <UsBlockCard
      title="财报预期"
      className="sl-earnings"
      description="分析师对接下来几期每股收益和营收的平均预期，以及最近四个季度的实际结果。"
      usOnly={usOnly}
      label="财报预期"
      state={state}
      isEmpty={d => d.estimates.length === 0 && d.history.length === 0 && !d.nextEarnings}
      emptyTitle="暂无财报预期"
      emptyText="没有分析师覆盖的股票通常没有一致预期。"
    >
      {d => <EarningsBody data={d} />}
    </UsBlockCard>
  )
}

const range = (lo?: number, hi?: number, f: (n: number) => string = String): string =>
  lo == null && hi == null ? '—' : `${lo != null ? f(lo) : '—'} ~ ${hi != null ? f(hi) : '—'}`

function EarningsBody({ data }: { data: EarningsData }): JSX.Element {
  const next = nextEarningsView(data, todayEt())
  const current = data.estimates.find(e => e.period === '0q')
  return (
    <div className="sl-us__body">
      <StatGrid className="sl-us__stats">
        <Stat
          label="下次财报日"
          value={next.status === 'upcoming' ? next.text : '尚未公布'}
          sub={next.status === 'upcoming'
            ? (next.estimated ? '预估日期，公司尚未确认（美东时间）' : '公司已确认（美东时间）')
            : next.status === 'past' ? `最近一次在 ${next.text}` : undefined}
        />
        {current ? (
          <Stat
            label="本季每股收益预期"
            value={fmtEps(current.eps.avg)}
            sub={current.eps.analysts != null ? `${current.eps.analysts} 位分析师` : undefined}
          />
        ) : null}
        {current?.revenue.avg != null ? (
          <Stat
            label="本季营收预期"
            value={fmtUsdAmount(current.revenue.avg)}
            sub={current.revenue.analysts != null ? `${current.revenue.analysts} 位分析师` : undefined}
          />
        ) : null}
      </StatGrid>

      {data.estimates.length > 0 ? (
        <>
          <h3 className="sl-subhead">一致预期</h3>
          <TableWrap label="一致预期" stickyFirst>
            <table className="ui-table sl-us__table">
              <thead>
                <tr>
                  <th scope="col">期间</th>
                  <th scope="col" className="num">每股收益均值</th>
                  <th scope="col" className="num">最低 ~ 最高</th>
                  <th scope="col" className="num">营收均值</th>
                  <th scope="col" className="num">最低 ~ 最高</th>
                  <th scope="col" className="num">分析师</th>
                </tr>
              </thead>
              <tbody>
                {data.estimates.map(e => (
                  <tr key={e.period}>
                    <th scope="row">
                      {PERIOD_LABEL[e.period]}
                      {e.endDate ? <span className="sl-muted sl-us__sub">截至 {e.endDate}</span> : null}
                    </th>
                    <td className="num">{fmtEps(e.eps.avg)}</td>
                    <td className="num sl-nowrap">{range(e.eps.low, e.eps.high, fmtEps)}</td>
                    <td className="num sl-nowrap">{e.revenue.avg != null ? fmtUsdAmount(e.revenue.avg) : '—'}</td>
                    <td className="num sl-nowrap">{range(e.revenue.low, e.revenue.high, fmtUsdAmount)}</td>
                    <td className="num sl-nowrap">
                      {e.eps.analysts ?? '—'}
                      {e.revenue.analysts != null && e.revenue.analysts !== e.eps.analysts ? ` / ${e.revenue.analysts}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
          <p className="sl-muted">「分析师」一栏两个数字时，前者是给出每股收益预期的人数，后者是给出营收预期的人数。</p>
          <RevisionTable estimates={data.estimates} />
        </>
      ) : null}

      {data.history.length > 0 ? <SurpriseChart data={data} /> : null}

      <p className="sl-muted">数据出处：{data.source}。每股收益为调整后口径（多数公司剔除股权激励等一次性项目），可能与财报里的法定每股收益不同。</p>
    </div>
  )
}

function RevisionTable({ estimates }: { estimates: EarningsEstimate[] }): JSX.Element | null {
  const rows = estimates.filter(e => e.epsTrend.current != null && trendPoints(e.epsTrend).length > 0)
  if (!rows.length) return null
  const labels = ['7 天前', '30 天前', '60 天前', '90 天前']
  return (
    <>
      <h3 className="sl-subhead">预期修正：每股收益预期比当时变了多少</h3>
      <TableWrap label="预期修正" stickyFirst>
        <table className="ui-table sl-us__table">
          <thead>
            <tr>
              <th scope="col">期间</th>
              <th scope="col" className="num">现在</th>
              {labels.map(l => <th key={l} scope="col" className="num">较 {l}</th>)}
              <th scope="col" className="num">近 30 天上调 / 下调</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(e => {
              const pts = trendPoints(e.epsTrend)
              return (
                <tr key={e.period}>
                  <th scope="row">{PERIOD_LABEL[e.period]}</th>
                  <td className="num">{fmtEps(e.epsTrend.current)}</td>
                  {labels.map(l => {
                    const p = pts.find(x => x.label === l)
                    return (
                      <td key={l} className="num sl-nowrap" title={p ? `当时 ${fmtEps(p.value)}` : undefined}>
                        {p?.changePct == null ? '—' : <span className={`sl-chg sl-chg--${changeTone(Math.round(p.changePct * 100))}`}>{fmtPct(p.changePct)}</span>}
                      </td>
                    )
                  })}
                  <td className="num sl-nowrap">
                    {e.revisions.up30 != null || e.revisions.down30 != null
                      ? `${e.revisions.up30 ?? 0} 人 / ${e.revisions.down30 ?? 0} 人`
                      : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableWrap>
      <p className="sl-muted">正数表示预期被调高。鼠标停在数字上可看当时的预期值。</p>
    </>
  )
}

function SurpriseChart({ data }: { data: EarningsData }): JSX.Element {
  const W = 420
  const H = 200
  const padL = 12
  const padT = 22
  const plotH = 130
  const rows = useMemo(() => data.history.map(q => ({
    key: q.periodEnd,
    label: shortFiscalLabel(q.fiscalQuarter, q.periodEnd),
    actual: q.epsActual,
    estimate: q.epsEstimate,
  })), [data])
  const { bars, zeroY } = surpriseBars(rows, padT, plotH)
  const slot = (W - padL * 2) / Math.max(bars.length, 1)
  const bw = Math.min(28, slot * 0.28)
  return (
    <div className="sl-earnings__history">
      <h3 className="sl-subhead">最近 {data.history.length} 个季度：实际 vs 预期（每股收益）</h3>
      <svg viewBox={`0 0 ${W} ${H}`} className="sl-earnings__svg" role="img" aria-label="最近几个季度每股收益实际与预期对比">
        <line className="sl-earnings__zero" x1={padL} x2={W - padL} y1={zeroY} y2={zeroY} />
        {bars.map((b, i) => {
          const cx = padL + slot * i + slot / 2
          return (
            <g key={b.key}>
              <rect className="sl-earnings__bar-est" x={cx - bw - 2} y={b.estimateY} width={bw} height={Math.max(b.estimateH, 0.5)} />
              <rect
                className={`sl-earnings__bar-act ${b.beat === false ? 'is-miss' : 'is-beat'}`}
                x={cx + 2}
                y={b.actualY}
                width={bw}
                height={Math.max(b.actualH, 0.5)}
              />
              <text className="sl-rating__ax" x={cx} y={padT + plotH + 18} textAnchor="middle">{b.label}</text>
            </g>
          )
        })}
      </svg>
      <ul className="sl-offex__legend" aria-label="图例">
        <li><span className="sl-offex__swatch sl-offex__swatch--total" />灰柱：发布前的一致预期</li>
        <li><span className="sl-offex__swatch sl-earnings__swatch--beat" />红柱：实际高于或等于预期</li>
        <li><span className="sl-offex__swatch sl-earnings__swatch--miss" />绿柱：实际低于预期</li>
      </ul>
      <TableWrap label="季度实际与预期" stickyFirst>
        <table className="ui-table sl-us__table">
          <thead>
            <tr>
              <th scope="col">季度</th>
              <th scope="col">公布日</th>
              <th scope="col" className="num">预期</th>
              <th scope="col" className="num">实际</th>
              <th scope="col" className="num">惊喜幅度</th>
              <th scope="col" className="num">当季营收</th>
            </tr>
          </thead>
          <tbody>
            {data.history.slice().reverse().map(q => (
              <tr key={q.periodEnd}>
                <th scope="row">
                  {fiscalLabel(q.fiscalQuarter, q.periodEnd)}
                  <span className="sl-muted sl-us__sub">截至 {q.periodEnd}</span>
                </th>
                <td className="sl-nowrap">{q.reported ?? '—'}</td>
                <td className="num">{fmtEps(q.epsEstimate)}</td>
                <td className="num">{fmtEps(q.epsActual)}</td>
                <td className="num">
                  {q.surprisePct == null ? '—' : (
                    <Badge tone={q.surprisePct >= 0 ? 'up' : 'down'}>{fmtPct(q.surprisePct)}</Badge>
                  )}
                </td>
                <td className="num sl-nowrap">{q.revenueActual != null ? fmtUsdAmount(q.revenueActual) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <p className="sl-muted">惊喜幅度 =（实际 − 预期）÷ 预期的绝对值。预期接近零或为负时，百分比会被放大，看绝对差更可靠。</p>
    </div>
  )
}
