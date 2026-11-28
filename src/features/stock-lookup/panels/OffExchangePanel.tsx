import React, { useEffect, useMemo, useState } from 'react'
import { Card, TableWrap } from '../../../components/ui'
import type { OffExchangeData, StockLookupApi } from '../types'
import { BlockEmpty, BlockError, BlockLoading, BlockUnsupported } from './BlockState'
import { fmtVolume, isLookupError } from './format'
import { parseLookupSymbol } from './symbolParse'

export function OffExchangePanel({ symbol, api }: { symbol: string; api: StockLookupApi }): JSX.Element {
  const market = parseLookupSymbol(symbol)?.market
  const [data, setData] = useState<OffExchangeData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    if (market && market !== 'us') {
      setLoading(false)
      setData(null)
      setError(null)
      return
    }
    let cancelled = false
    const ac = new AbortController()
    setLoading(true)
    setError(null)
    void api.offExchange(symbol, ac.signal).then(
      d => {
        if (cancelled) return
        setData(d)
        setLoading(false)
      },
      err => {
        if (cancelled || ac.signal.aborted) return
        setData(null)
        setError(err)
        setLoading(false)
      },
    )
    return () => {
      cancelled = true
      ac.abort()
    }
  }, [symbol, api, retry, market])

  return (
    <Card
      as="section"
      title="场外成交与做空量（FINRA）"
      className="sl-offex"
      description="FINRA 公布的场外（含暗池）成交中的做空量，不是全市场成交、不是空头持仓；ATS 周度数据有 2–4 周延迟。"
    >
      {market && market !== 'us' ? (
        <BlockUnsupported reason="场外成交（FINRA）仅覆盖美股；沪深与港股暂不支持。" />
      ) : null}
      {(!market || market === 'us') && loading ? <BlockLoading label="场外成交" /> : null}
      {(!market || market === 'us') && !loading && error ? (
        isLookupError(error) && error.reason === 'unsupported'
          ? <BlockUnsupported reason={error.error} />
          : <BlockError error={error} onRetry={() => setRetry(n => n + 1)} />
      ) : null}
      {(!market || market === 'us') && !loading && !error && data ? (
        data.daily.length === 0 && data.ats.length === 0
          ? <BlockEmpty title="暂无场外成交数据" />
          : <OffExchangeBody data={data} />
      ) : null}
    </Card>
  )
}

function OffExchangeBody({ data }: { data: OffExchangeData }): JSX.Element {
  return (
    <div className="sl-offex__body">
      {data.daily.length > 0 && <ShortVolumeChart daily={data.daily} />}
      {data.ats.length > 0 && (
        <div className="sl-offex__ats">
          <h3 className="sl-subhead">ATS 周度成交</h3>
          <TableWrap label="ATS 周度成交" stickyHeader>
            <table className="ui-table">
              <thead>
                <tr>
                  <th scope="col">周起始</th>
                  <th scope="col">成交股数</th>
                  <th scope="col">成交笔数</th>
                </tr>
              </thead>
              <tbody>
                {data.ats.slice().reverse().map(w => (
                  <tr key={w.weekStart}>
                    <td>{w.weekStart}</td>
                    <td>{fmtVolume(w.shares)}</td>
                    <td>{w.trades.toLocaleString('zh-CN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </div>
      )}
      <p className="sl-muted">数据出处：{data.source}。{data.note}</p>
    </div>
  )
}

function ShortVolumeChart({ daily }: { daily: OffExchangeData['daily'] }): JSX.Element {
  const W = 640
  const H = 220
  const padL = 48
  const padR = 48
  const padT = 16
  const padB = 28
  const plotW = W - padL - padR
  const plotH = H - padT - padB
  const n = daily.length

  const maxVol = useMemo(() => Math.max(...daily.map(d => d.totalVolume), 1), [daily])
  const ratios = useMemo(() => daily.map(d => (d.totalVolume > 0 ? d.shortVolume / d.totalVolume : 0)), [daily])
  const maxRatio = Math.max(...ratios, 0.01)

  const xAt = (i: number): number => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW)
  const barW = Math.max(2, Math.min(14, (plotW / Math.max(n, 1)) * 0.35))

  const ratioLine = ratios.map((r, i) => {
    const x = xAt(i)
    const y = padT + plotH - (r / maxRatio) * plotH
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')

  return (
    <div className="sl-offex__chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="每日做空量与场外总成交量">
        {daily.map((d, i) => {
          const x = xAt(i)
          const totalH = (d.totalVolume / maxVol) * plotH
          const shortH = (d.shortVolume / maxVol) * plotH
          return (
            <g key={d.date}>
              <rect
                className="sl-offex__bar-total"
                x={x - barW}
                y={padT + plotH - totalH}
                width={barW}
                height={totalH}
              />
              <rect
                className="sl-offex__bar-short"
                x={x}
                y={padT + plotH - shortH}
                width={barW}
                height={shortH}
              />
            </g>
          )
        })}
        <path className="sl-offex__ratio" d={ratioLine} fill="none" />
      </svg>
      <ul className="sl-offex__legend" aria-label="图例">
        <li><span className="sl-offex__swatch sl-offex__swatch--total" />灰柱：场外总成交</li>
        <li><span className="sl-offex__swatch sl-offex__swatch--short" />红柱：做空量</li>
        <li><span className="sl-offex__swatch sl-offex__swatch--ratio" />线：做空占比</li>
      </ul>
      <div className="sl-muted">
        最近 {n} 日 · 做空占比峰值 {(maxRatio * 100).toFixed(1)}%
      </div>
    </div>
  )
}
