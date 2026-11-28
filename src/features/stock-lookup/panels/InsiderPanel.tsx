import React, { useMemo, useState } from 'react'
import { Badge, Segmented, Stat, StatGrid, TableWrap } from '../../../components/ui'
import type { InsiderData, StockLookupApi } from '../types'
import { fmtSignedShares, fmtUsdAmount, fmtVolume } from './format'
import {
  filterInsider,
  INSIDER_TYPE_LABEL,
  INSIDER_TYPE_TONE,
  insiderPriceText,
  insiderTypeCounts,
  roleLabel,
  type InsiderFilter,
} from './insider'
import { parseLookupSymbol } from './symbolParse'
import { UsBlockCard } from './UsBlockCard'
import { useUsBlock } from './useUsBlock'

const PREVIEW_ROWS = 15

export function InsiderPanel({ symbol, api }: { symbol: string; api: StockLookupApi }): JSX.Element {
  const usOnly = (parseLookupSymbol(symbol)?.market ?? 'us') === 'us'
  const state = useUsBlock(usOnly, symbol, api, signal => api.insider(symbol, signal))
  return (
    <UsBlockCard
      title="内部人交易"
      className="sl-insider"
      description="公司董事、高管与持股 10% 以上股东申报的本公司股票买卖，近 12 个月。"
      usOnly={usOnly}
      label="内部人交易"
      state={state}
      isEmpty={d => d.transactions.length === 0}
      emptyTitle="近 12 个月没有内部人交易记录"
      emptyText="可能确实没有申报，也可能数据源暂未收录。"
    >
      {d => <InsiderBody data={d} />}
    </UsBlockCard>
  )
}

function InsiderBody({ data }: { data: InsiderData }): JSX.Element {
  const [filter, setFilter] = useState<InsiderFilter>('all')
  const [expanded, setExpanded] = useState(false)
  const counts = useMemo(() => insiderTypeCounts(data.transactions), [data])
  const rows = useMemo(() => filterInsider(data.transactions, filter), [data, filter])
  const shown = expanded ? rows : rows.slice(0, PREVIEW_ROWS)
  const s = data.summary
  const otherCount = counts.exercise + counts.award + counts.gift + counts.other

  return (
    <div className="sl-us__body">
      <StatGrid className="sl-us__stats">
        <Stat
          label={`近 ${s.months} 个月公开市场净买卖`}
          value={<span className={`sl-chg sl-chg--${s.netShares > 0 ? 'up' : s.netShares < 0 ? 'down' : 'flat'}`}>{fmtSignedShares(s.netShares)} 股</span>}
          sub={s.buyCount + s.sellCount === 0 ? '这段时间没有公开市场买卖' : `买入 ${s.buyCount} 笔、卖出 ${s.sellCount} 笔`}
        />
        <Stat
          label="公开市场买入"
          value={`${fmtVolume(s.buyShares)} 股`}
          sub={s.buyValue > 0 ? `约 ${fmtUsdAmount(s.buyValue)}` : `${s.buyCount} 笔`}
        />
        <Stat
          label="卖出"
          value={`${fmtVolume(s.sellShares)} 股`}
          sub={s.sellValue > 0 ? `约 ${fmtUsdAmount(s.sellValue)}` : `${s.sellCount} 笔`}
        />
        {data.reported?.netShares != null ? (
          <Stat
            label="含授予与行权的净变动"
            value={`${fmtSignedShares(data.reported.netShares)} 股`}
            sub={data.reported.netCount != null ? `共 ${data.reported.netCount} 笔（数据源口径）` : '数据源口径'}
          />
        ) : null}
      </StatGrid>
      <p className="sl-muted">
        公开市场净买卖只数真金白银的买入与卖出（{s.since} 起）；公司授予、期权行权、赠与不算在内，近 12 个月这类记录共 {otherCount} 笔。
      </p>

      <div className="sl-us__toolbar">
        <Segmented<InsiderFilter>
          label="交易类型"
          value={filter}
          onChange={f => { setFilter(f); setExpanded(false) }}
          items={[
            { id: 'all', label: `全部 ${data.transactions.length}` },
            { id: 'trade', label: `只看买卖 ${counts.buy + counts.sell}` },
            { id: 'buy', label: `买入 ${counts.buy}` },
            { id: 'sell', label: `卖出 ${counts.sell}` },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <p className="sl-muted">这一类没有记录。</p>
      ) : (
        <TableWrap label="内部人交易明细" stickyHeader>
          <table className="ui-table sl-us__table">
            <thead>
              <tr>
                <th scope="col">日期</th>
                <th scope="col">姓名</th>
                <th scope="col">职务</th>
                <th scope="col">类型</th>
                <th scope="col" className="num">股数</th>
                <th scope="col" className="num">价格</th>
                <th scope="col" className="num">金额</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={`${r.date}-${r.name}-${i}`}>
                  <td className="sl-nowrap">{r.date}</td>
                  <td>{r.name || '—'}</td>
                  <td>{roleLabel(r.role)}</td>
                  <td className="sl-nowrap">
                    <Badge tone={INSIDER_TYPE_TONE[r.type]}>{INSIDER_TYPE_LABEL[r.type]}</Badge>
                    {r.ownership === 'indirect' ? <span className="sl-muted sl-us__tag">间接持有</span> : null}
                  </td>
                  <td className="num">{fmtVolume(r.shares)}</td>
                  <td className="num sl-nowrap">{insiderPriceText(r)}</td>
                  <td className="num sl-nowrap">{r.value != null ? fmtUsdAmount(r.value) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      {rows.length > PREVIEW_ROWS ? (
        <button type="button" className="tool-btn sl-us__more" onClick={() => setExpanded(v => !v)}>
          {expanded ? '收起' : `展开全部 ${rows.length} 条`}
        </button>
      ) : null}

      <p className="sl-muted">
        数据出处：{data.source}。数据源不标注一笔卖出是否属于事先登记的减持计划（美国 10b5-1 规则下的预定交易），
        这类卖出往往与对公司前景的判断无关，要确认需查看美国证监会原始申报。「未注明」是数据源没写明交易性质的记录，常见于代扣税款或期权相关操作。
      </p>
    </div>
  )
}
