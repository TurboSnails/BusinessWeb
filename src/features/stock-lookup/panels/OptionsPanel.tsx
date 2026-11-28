import React, { useEffect, useState } from 'react'
import { Badge, Stat, StatGrid, TableWrap } from '../../../components/ui'
import type { OptionsData, StockLookupApi } from '../types'
import { fmtPrice, fmtQuoteTime, fmtRatioPct, fmtUsdAmount, fmtVolume } from './format'
import { daysToExpiry, etDate, exceedsOpenInterest, latestTradeDay, roughPremium, sideRatios, volOiRatio } from './options'
import { parseLookupSymbol } from './symbolParse'
import { UsBlockCard } from './UsBlockCard'
import { todayEt, useUsBlock } from './useUsBlock'

export function OptionsPanel({ symbol, api }: { symbol: string; api: StockLookupApi }): JSX.Element {
  const usOnly = (parseLookupSymbol(symbol)?.market ?? 'us') === 'us'
  // 到期日选择跟代码绑定：换代码自动回到最近到期日
  const [pick, setPick] = useState<{ symbol: string; date: string }>({ symbol, date: '' })
  const expiration = pick.symbol === symbol ? pick.date : ''
  const state = useUsBlock(usOnly, symbol, api, signal => api.options(symbol, expiration || undefined, signal), expiration)
  // 换到期日加载期间保留上一份到期日列表，避免下拉框闪没
  const [known, setKnown] = useState<{ symbol: string; list: string[] }>({ symbol, list: [] })
  useEffect(() => {
    if (!state.loading && state.data?.expirations.length) setKnown({ symbol, list: state.data.expirations })
  }, [state.loading, state.data, symbol])
  const expirations = !state.loading && state.data ? state.data.expirations : (known.symbol === symbol ? known.list : [])
  const selected = expiration || (!state.loading ? state.data?.expiration : undefined) || expirations[0] || ''

  return (
    <UsBlockCard
      title="期权概况"
      className="sl-options"
      description="某个到期日的看跌、看涨期权成交与持仓，以及成交最活跃的合约。"
      usOnly={usOnly}
      label="期权数据"
      state={state}
      isEmpty={d => d.expirations.length === 0}
      emptyTitle="这只股票没有挂牌期权"
      emptyText="或数据源暂未提供期权链。"
      actions={expirations.length > 0 ? (
        <label className="sl-options__picker">
          到期日
          <select value={selected} onChange={e => setPick({ symbol, date: e.target.value })} aria-label="到期日" disabled={state.loading}>
            {expirations.map(x => (
              <option key={x} value={x}>{x}（{Math.max(0, daysToExpiry(x, todayEt()))} 天后）</option>
            ))}
          </select>
        </label>
      ) : undefined}
    >
      {d => <OptionsBody data={d} />}
    </UsBlockCard>
  )
}

const ratioText = (r: number | null): string => (r == null ? '—' : r.toFixed(2))
/** 期权报价按美分走，统一两位小数 */
const optPrice = (n: number): string => n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function OptionsBody({ data }: { data: OptionsData }): JSX.Element {
  const ratios = sideRatios(data.calls, data.puts)
  const tradeDay = latestTradeDay(data.top)
  const oiMissing = data.calls.openInterest + data.puts.openInterest === 0
  const anyStale = !!tradeDay && data.top.some(c => { const d = etDate(c.lastTrade); return !!d && d < tradeDay })
  return (
    <div className="sl-us__body">
      {data.expiration ? <p className="sl-muted sl-options__exp">到期日 {data.expiration}：共 {data.calls.count} 个看涨、{data.puts.count} 个看跌行权价。</p> : null}
      <StatGrid className="sl-us__stats">
        <Stat
          label="看跌 / 看涨 成交量比"
          value={ratioText(ratios.volume)}
          sub={`看跌 ${fmtVolume(data.puts.volume)} 张 · 看涨 ${fmtVolume(data.calls.volume)} 张`}
        />
        <Stat
          label="看跌 / 看涨 未平仓比"
          value={oiMissing ? '—' : ratioText(ratios.openInterest)}
          sub={`看跌 ${fmtVolume(data.puts.openInterest)} 张 · 看涨 ${fmtVolume(data.calls.openInterest)} 张`}
        />
        {data.underlyingPrice != null ? (
          <Stat
            label="正股价"
            value={fmtPrice(data.underlyingPrice, 'USD')}
            sub={data.quoteTime ? fmtQuoteTime(data.quoteTime, 'America/New_York') : undefined}
          />
        ) : null}
      </StatGrid>
      <p className="sl-muted">比值大于 1 表示看跌一侧更多。买看跌可能是看空，也可能是持股者买保险，比值本身不说明方向。</p>

      {data.top.length === 0 ? (
        <p className="sl-muted">这个到期日最近没有成交。</p>
      ) : (
        <>
          <h3 className="sl-subhead">成交量前 {data.top.length} 的合约</h3>
          <TableWrap label="成交量前十的期权合约" stickyHeader>
            <table className="ui-table sl-us__table">
              <thead>
                <tr>
                  <th scope="col" className="num">行权价</th>
                  <th scope="col">类型</th>
                  <th scope="col" className="num">成交量</th>
                  <th scope="col" className="num">未平仓</th>
                  <th scope="col" className="num">成交 ÷ 未平仓</th>
                  <th scope="col" className="num">最新价</th>
                  <th scope="col" className="num">隐含波动率</th>
                  <th scope="col" className="num">粗算权利金</th>
                  <th scope="col">最近成交</th>
                </tr>
              </thead>
              <tbody>
                {data.top.map(c => {
                  const ratio = volOiRatio(c)
                  const premium = roughPremium(c)
                  const day = etDate(c.lastTrade)
                  return (
                    <tr key={c.contract}>
                      <td className="num">{optPrice(c.strike)}</td>
                      <td className="sl-nowrap">
                        <Badge tone={c.type === 'call' ? 'up' : 'down'}>{c.type === 'call' ? '看涨' : '看跌'}</Badge>
                        {c.inTheMoney ? <span className="sl-muted sl-us__tag">价内</span> : null}
                      </td>
                      <td className="num">{fmtVolume(c.volume)}</td>
                      <td className="num">{fmtVolume(c.openInterest)}</td>
                      <td className="num sl-nowrap">
                        {ratio == null ? '—' : ratio.toFixed(2)}
                        {exceedsOpenInterest(c) ? <Badge tone="warm" className="sl-us__flag">当日成交超过持仓</Badge> : null}
                      </td>
                      <td className="num">{c.lastPrice != null ? optPrice(c.lastPrice) : '—'}</td>
                      <td className="num">{c.iv != null ? fmtRatioPct(c.iv, 1) : '—'}</td>
                      <td className="num sl-nowrap">{premium != null ? fmtUsdAmount(premium) : '—'}</td>
                      <td className="sl-nowrap">
                        {day ? day.slice(5) : '—'}
                        {day && tradeDay && day < tradeDay ? <span className="sl-muted sl-us__tag">较早</span> : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </TableWrap>
        </>
      )}
      <p className="sl-muted">
        「当日成交超过持仓」：成交量比前一天收盘时的未平仓还多，多半有新开的仓位，但看不出是买方主动还是卖方主动。
        粗算权利金 = 成交量 × 最新价 × 100（每张合约对应 100 股），只是量级参考，不是实际成交金额。
        {anyStale ? `标「较早」的合约在 ${tradeDay} 之前就没再成交，成交量是它最后一个有成交交易日的数字。` : ''}
        {oiMissing ? '未平仓目前全为 0，通常是数据源尚未更新（周末或开盘前常见）。' : ''}
      </p>
      <p className="sl-muted">数据出处：{data.source}，{data.note}隐含波动率为年化值。</p>
    </div>
  )
}
