import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCombinedStrategy } from '../combined-strategy/load'
import { asEtfTiming, type EtfTiming } from '../etf-timing/model'

const BASE = (import.meta as { env?: Record<string, string | undefined> }).env?.BASE_URL ?? '/'
const ETF_URL = `${BASE.endsWith('/') ? BASE : `${BASE}/`}data/etf-timing.json`

type EtfLoad = { state: 'loading' } | { state: 'error' } | { state: 'ok'; data: EtfTiming }

function useEtfTimingLatest(): EtfLoad {
  const [load, setLoad] = useState<EtfLoad>({ state: 'loading' })
  useEffect(() => {
    const controller = new AbortController()
    fetch(ETF_URL, { cache: 'no-cache', signal: controller.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((body: unknown) => {
        const data = asEtfTiming(body)
        setLoad(data ? { state: 'ok', data } : { state: 'error' })
      })
      .catch(() => { if (!controller.signal.aborted) setLoad({ state: 'error' }) })
    return () => controller.abort()
  }, [])
  return load
}

function UsNow(): JSX.Element {
  const state = useCombinedStrategy()
  if (state.status !== 'ready') return <span data-testid="lab-v01-us-now">{state.status === 'error' ? '读数暂时加载不了' : '读数加载中…'}</span>
  return <span data-testid="lab-v01-us-now">{state.data.current.instruction}</span>
}

function CnNow(): JSX.Element {
  const load = useEtfTimingLatest()
  if (load.state !== 'ok' || !load.data.latest) {
    return <span data-testid="lab-v01-cn-now">{load.state === 'loading' ? '读数加载中…' : '读数暂时加载不了'}</span>
  }
  const { asOf, timing, summary } = load.data.latest
  const bull = timing.hs300Bull
  return (
    <span data-testid="lab-v01-cn-now">
      截至 {asOf}：沪深300÷中证红利{bull == null ? '缺数据' : bull ? '在 20 日线上方（牛市，金叉可进场）' : '在 20 日线下方（熊市，不开新仓）'}；
      {summary.n} 只 ETF 里 {summary.hsHolding} 只按规则持有中。
    </span>
  )
}

export default function EffectiveStrategies(): JSX.Element {
  return (
    <article className="ss-section lab-study" id="lab-v01" aria-labelledby="lab-v01-title" data-testid="lab-v01">
      <p className="lab-status">初版 · 2026-11-25 · 汇总目前回测有效的规则，不是买卖指令</p>
      <h2 id="lab-v01-title">有效策略初版：一条按月、一条按日</h2>
      <p className="ss-p">
        从今天以前做过的所有回测里，挑出在样本外仍然站得住的两条，写成可以照着执行的初版。其余写法（估值择时、雷达定仓、牛市加码、高位刹车、按日执行宏观攻守等）都没有通过，见下面各项研究和策略说明书第十四章。
      </p>

      <div className="lab-v01-grid">
        <section className="ss-cover lab-v01-card" aria-labelledby="lab-v01-us">
          <p className="ss-cover__kicker">美股仓位 · 按月 · 现行</p>
          <h3 id="lab-v01-us" className="lab-v01-card__title">宏观攻守 v2.2</h3>
          <ul className="ss-list">
            <li>规则：增长与就业、信用、货币与流动性、通胀四根支柱打分，经熔断、十个月均线修正和修复确认定五档，仓位 100% / 85% / 70% / 50% / 30%（乘你自己定的股票上限）。</li>
            <li>节奏：每月最后一个交易日定档，次月第 3 个交易日前调到位；月中每天的日度档位只看不动。</li>
            <li>证据：按真实成交价，夏普 0.59（恒定七成 0.46），按日最大回撤 −33%（恒定七成 −41%）；1,000 组相邻参数全部优于恒定七成。</li>
            <li>短板：对偏热高位开始的急跌基本无效；1959–1972 年输给恒定七成；相对恒定七成的优势统计上处于边缘。</li>
            <li>想降低波动：把自己的股票上限调低最可靠（上限 80% 时波动约 11% → 9%，按日最大回撤约 −33% → −27%，年化少约 1 个百分点）。波动率目标只是部分成立，没有纳入（见下）。</li>
          </ul>
          <p className="lab-v01-card__now"><strong>现在：</strong><UsNow /></p>
          <p className="lab-v01-card__links">
            <Link to="/invest/strategy">综合策略</Link> · <Link to="/invest/strategy/spec">策略说明书</Link>
          </p>
        </section>

        <section className="ss-cover lab-v01-card" aria-labelledby="lab-v01-cn">
          <p className="ss-cover__kicker">A 股 ETF · 按日 · v0.1 影子运行中</p>
          <h3 id="lab-v01-cn" className="lab-v01-card__title">择时 + 只认金叉</h3>
          <ul className="ss-list">
            <li>择时：沪深300÷中证红利的收盘比值在自己的 20 日均线上方为牛市，下方为熊市。</li>
            <li>进场：牛市里 MACD（12, 26, 9）金叉，次日开盘买入（指数长历史回测按次日收盘）；熊市不开新仓。</li>
            <li>离场：MACD 死叉当天收盘卖出，不管牛熊。单边成本按 0.1% 计。</li>
            <li>适用：中证500、中证1000、材料、工业、信息等中小盘和周期成长类（2011—2018 年规则没见过的数据里同样成立）；沪深300、上证50、红利、医药、金融地产等大盘与防御类代价大于收益，不建议用。</li>
            <li>证据：76 只 ETF 不挑品种，样本外年化比一直持有高 1.7–3.9 个百分点，最大回撤约减半；15 个指数 2011 年以来大跌回撤 14/15 达标，年化 9/15 达标。</li>
            <li>状态：2026-11-13 起每个交易日影子记录，满 6–12 个月、与回测预期一致后再定是否正式采用。加成交量条件检验过，没有帮助（见下）。</li>
          </ul>
          <p className="lab-v01-card__now"><strong>现在：</strong><CnNow /></p>
          <p className="lab-v01-card__links">
            <Link to="/lab/etf-timing">ETF 择时观察（逐只信号）</Link>
          </p>
        </section>
      </div>

      <p className="ss-note" role="note">
        两条规则管的是不同的钱：美股仓位规则决定美股占你上限的比例；A 股 ETF 规则决定单只中小盘、周期类 ETF 拿不拿。它们之间还没有做过合并检验，不要叠加成一个总仓位。
        十个月均线是最简单的对照规则（1959–1972 年反而最好），只用来复核，不单独执行。
      </p>
    </article>
  )
}
