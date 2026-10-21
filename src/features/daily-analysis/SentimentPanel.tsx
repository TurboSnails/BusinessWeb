import { Card, Stat, StatGrid } from '../../components/ui'
import { valueText } from './Panels'
import type { DailySnapshot, MarketBreadth, MarketSentiment, SentimentError, SentimentIncomplete } from './types'

const pct = (value: number | null) => (value === null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(2)}%`)
const tone = (value: number | null) => (value === null ? '' : value > 0 ? 'daily-up' : value < 0 ? 'daily-down' : '')
const failed = (block: { status: string }): block is SentimentError | SentimentIncomplete => block.status !== 'ready'
const reasonOf = (block: SentimentError | SentimentIncomplete) => block.reason || '数据暂不可用'

const BUCKETS: Array<{ key: keyof MarketBreadth['buckets']; label: string; up: boolean | null }> = [
  { key: 'limitUp', label: '涨停', up: true }, { key: 'above7', label: '>7%', up: true }, { key: 'from5To7', label: '5~7%', up: true },
  { key: 'from3To5', label: '3~5%', up: true }, { key: 'from0To3', label: '0~3%', up: true }, { key: 'flat', label: '平盘', up: null },
  { key: 'from0ToMinus3', label: '0~-3%', up: false }, { key: 'fromMinus3ToMinus5', label: '-3~-5%', up: false },
  { key: 'fromMinus5ToMinus7', label: '-5~-7%', up: false }, { key: 'belowMinus7', label: '<-7%', up: false }, { key: 'limitDown', label: '跌停', up: false },
]

function Breadth({ block }: { block: MarketSentiment['breadth'] }): JSX.Element {
  if (failed(block)) return <section className="sentiment-block"><h3>涨跌统计</h3><p className="sentiment-unavailable">{reasonOf(block)}</p></section>
  const max = Math.max(...BUCKETS.map(b => block.buckets[b.key]), 1)
  const counted = block.up + block.down + block.flat || 1
  return (
    <section className="sentiment-block" aria-label="涨跌统计">
      <h3>涨跌统计 <small>全市场 {block.total} 只，停牌 {block.suspended} 只</small></h3>
      <svg className="sentiment-split" viewBox="0 0 100 4" preserveAspectRatio="none" role="img" aria-label={`上涨 ${block.up}，平盘 ${block.flat}，下跌 ${block.down}`}>
        <rect className="is-up" x="0" width={(block.up / counted) * 100} height="4" />
        <rect className="is-flat" x={(block.up / counted) * 100} width={(block.flat / counted) * 100} height="4" />
        <rect className="is-down" x={((block.up + block.flat) / counted) * 100} width={(block.down / counted) * 100} height="4" />
      </svg>
      <div className="sentiment-split__legend">
        <span className="daily-up">上涨 {block.up}（{((block.up / counted) * 100).toFixed(0)}%）</span>
        <span>平盘 {block.flat}</span>
        <span className="daily-down">下跌 {block.down}（{((block.down / counted) * 100).toFixed(0)}%）</span>
        <span>涨跌幅中位数 {pct(block.medianPct)}</span>
      </div>
      <ul className="sentiment-buckets" aria-label="涨跌幅分布">
        {BUCKETS.map(b => (
          <li key={b.key}>
            <span className="sentiment-buckets__label">{b.label}</span>
            <svg className="sentiment-buckets__track" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true"><rect className={b.up === null ? 'is-flat' : b.up ? 'is-up' : 'is-down'} width={Math.max((block.buckets[b.key] / max) * 100, block.buckets[b.key] > 0 ? 1 : 0)} height="10" /></svg>
            <span className="sentiment-buckets__n">{block.buckets[b.key]}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function SentimentPanel({ data }: { data: DailySnapshot }): JSX.Element {
  const s = data.sentiment
  if (!s) {
    return <Card as="section" title="市场情绪" description="涨跌统计、市场量能、涨停表现、大幅回撤与权重表现。">
      <p className="sentiment-unavailable">这个交易日的快照没有市场情绪数据（该功能上线前归档的快照不含此项），不补算、不编造。</p>
    </Card>
  }
  const { turnover, limitUp, drawdown, weight } = s
  return (
    <Card as="section" title="市场情绪" description={`全部由公开行情自算，数据日期 ${s.asOf}。各块独立取数，某一块失败不影响其它块。`}>
      <Breadth block={s.breadth} />

      <div className="sentiment-grid">
        <section className="sentiment-block" aria-label="市场量能">
          <h3>市场量能</h3>
          {failed(turnover) ? <p className="sentiment-unavailable">{reasonOf(turnover)}</p> : (
            <StatGrid>
              <Stat label="两市成交额" value={valueText(turnover.amount)} sub="亿元，沪深指数成交额合计" />
              <Stat label="较前一交易日" value={pct(turnover.vsPreviousPct)} className={tone(turnover.vsPreviousPct)} sub={turnover.vsPreviousPct === null ? '缺上一交易日快照' : undefined} />
              <Stat label="较近 5 日均值" value={pct(turnover.vsFiveDayAveragePct)} className={tone(turnover.vsFiveDayAveragePct)} sub={turnover.vsFiveDayAveragePct === null ? '历史快照不足' : undefined} />
            </StatGrid>
          )}
        </section>

        <section className="sentiment-block" aria-label="涨停表现">
          <h3>涨停表现 <small>昨日涨停股今日</small></h3>
          {failed(limitUp) ? <p className="sentiment-unavailable">{reasonOf(limitUp)}</p> : (
            <StatGrid>
              <Stat label="昨日涨停" value={valueText(limitUp.yesterdayCount)} sub="只" />
              <Stat label="平均涨跌幅" value={pct(limitUp.averagePct)} className={tone(limitUp.averagePct)} />
              <Stat label="红盘率" value={valueText(limitUp.redRate, '%')} sub="今日上涨占比" />
              <Stat label="再涨停" value={valueText(limitUp.reLimitUpCount)} sub="只" />
              <Stat label="炸板" value={valueText(limitUp.brokenCount)} sub="只" />
              <Stat label="封板率" value={valueText(limitUp.sealRate, '%')} sub="回封 / (回封 + 开板)" />
            </StatGrid>
          )}
        </section>
      </div>

      <section className="sentiment-block" aria-label="大幅回撤">
        <h3>大幅回撤 <small>昨日涨停股今日跌幅超过 {failed(drawdown) ? 5 : Math.abs(drawdown.threshold)}%</small></h3>
        {failed(drawdown) ? <p className="sentiment-unavailable">{reasonOf(drawdown)}</p> : (
          <>
            <p className="sentiment-line"><strong className="daily-down">{drawdown.count}</strong> 只{drawdown.consecutiveCount !== null && <>，其中昨日连板股 <strong className="daily-down">{drawdown.consecutiveCount}</strong> 只</>}</p>
            {drawdown.stocks.length > 0 && (
              <ul className="sentiment-chips">{drawdown.stocks.map(stock => <li key={stock.code}>{stock.name}<small>{stock.code}</small><span className="daily-down">{pct(stock.pct)}</span></li>)}</ul>
            )}
          </>
        )}
      </section>

      <section className="sentiment-block" aria-label="权重表现">
        <h3>权重表现</h3>
        {failed(weight) ? <p className="sentiment-unavailable">{reasonOf(weight)}</p> : (
          <>
            <ul className="sentiment-chips">{weight.indices.map(i => <li key={i.symbol}>{i.name}<span className={tone(i.change)}>{pct(i.change)}</span></li>)}</ul>
            <p className="sentiment-line">
              权重股均值 <strong className={tone(weight.averagePct)}>{pct(weight.averagePct)}</strong>，全市场中位数 <strong className={tone(weight.marketMedianPct)}>{pct(weight.marketMedianPct)}</strong>
              {weight.strength && <>，<strong>{weight.strength === 'strong' ? '权重强于市场' : weight.strength === 'weak' ? '权重弱于市场' : '权重与市场相当'}</strong></>}
            </p>
            <ul className="sentiment-chips">{weight.blueChips.map(stock => <li key={stock.code}>{stock.name}<span className={tone(stock.pct)}>{pct(stock.pct)}</span></li>)}</ul>
          </>
        )}
      </section>
    </Card>
  )
}
