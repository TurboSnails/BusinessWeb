import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCombinedStrategy } from '../combined-strategy/load'
import { asEtfTiming, type EtfTiming } from '../etf-timing/model'

const BASE = (import.meta as { env?: Record<string, string | undefined> }).env?.BASE_URL ?? '/'
const ETF_URL = `${BASE.endsWith('/') ? BASE : `${BASE}/`}data/etf-timing.json`
const SHADOW_URL = `${BASE.endsWith('/') ? BASE : `${BASE}/`}data/vol-target-shadow.json`

type Shadow = { current: { date: string; sigma: number; sigmaStar: number; k: number; equityShare: number | null } | null; rows: { month: string }[] }

function VolShadowNow(): JSX.Element | null {
  const [data, setData] = useState<Shadow | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    fetch(SHADOW_URL, { cache: 'no-cache', signal: controller.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((body: Shadow) => { if (body && 'current' in body) setData(body) })
      .catch(() => {})
    return () => controller.abort()
  }, [])
  const c = data?.current
  if (!c) return null
  const p = (x: number) => `${Math.round(x * 100)}%`
  return (
    <p className="lab-v01-card__now" data-testid="lab-v01-vt-shadow">
      <strong>波动率目标影子读数（只记录、不操作）：</strong>截至 {c.date}，近 20 日波动 {p(c.sigma)}，1950 年以来中位数 {p(c.sigmaStar)}，缩放系数 {c.k.toFixed(2)}{c.equityShare != null ? `，假想仓位为上限的 ${p(c.equityShare)}` : ''}。每月月末冻结一行（已冻结 {data.rows.length} 个月），用于前推检验。
    </p>
  )
}

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
      <p className="lab-status">2026-11-26 修订 · 汇总 31 项检验后的低频方案，不是买卖指令</p>
      <h2 id="lab-v01-title">低频方案：一条按月、一条按日</h2>
      <p className="ss-p">
        从做过的 31 项预注册检验里，挑出站得住的部分，写成可以照着执行的方案。估值择时、雷达定仓、牛市加码、高位刹车、按日执行、波动率目标、股债金配比、牛市后期预警、期权保护、防守部分放趋势债券都没有通过，见各项研究和策略说明书第十四章。
      </p>
      <ol className="ss-list" data-testid="lab-v01-plan">
        <li><strong>先定上限（最重要）</strong>：美股只放打算投入美股资金的 80%，其余放现金或 1 年以内的短期国债，每月按当前总值重算。这是唯一在各段历史都成立的降波动办法；怕跌就再往下调，期权保护不比直接降仓便宜。</li>
        <li><strong>每月一次的仓位规则</strong>：宏观攻守 v2.2，当作大熊市保险。算上试过的 86 种写法后，优势统计上不能确认；往后按同等波动夏普约 0.56 预期，可能连续多年落后固定仓位。</li>
        <li><strong>股票买宽基指数</strong>：不选股、不做行业轮动，也不在国家之间轮动（L-034：和固定比例打平，2014 年后更差）；防守或低波动行业倾斜影子运行到 2027-12 再定。</li>
        <li><strong>放弃条件（事先写好）</strong>：下一次标普跌 25% 以上，如果规则在谷底前没降到 50% 或以下，就退回「只保留上限」。十个月均线在 14 国检验里作用太小，不单独保留。</li>
      </ol>

      <div className="lab-v01-grid">
        <section className="ss-cover lab-v01-card" aria-labelledby="lab-v01-us">
          <p className="ss-cover__kicker">美股仓位 · 按月 · 现行</p>
          <h3 id="lab-v01-us" className="lab-v01-card__title">宏观攻守 v2.2</h3>
          <ul className="ss-list">
            <li>规则：增长与就业、信用、货币与流动性、通胀四根支柱打分，经熔断、十个月均线修正和修复确认定五档，仓位 100% / 85% / 70% / 50% / 30%（乘你自己定的股票上限）。</li>
            <li>节奏：每月最后一个交易日定档，次月第 3 个交易日前调到位；月中每天的日度档位只看不动。</li>
            <li>证据：按真实成交价，夏普 0.59（恒定七成 0.46），按日最大回撤 −33%（恒定七成 −41%）；1,000 组相邻参数全部优于恒定七成，整类宏观写法校正挑选后仍有显著好于恒定仓位的。</li>
            <li>短板：对偏热高位开始的急跌基本无效；1959–1972 年输给恒定七成；算上 86 次挑选后优势不显著，现行参数过拟合风险高；其中的十个月均线在 14 国只少跌约 3.5%。</li>
            <li>上限（2026-11-25 决定）：取打算投入美股资金的 80%，其余放现金或短期国债。波动约 11% → 9%，按日最大回撤约 −33% → −27%，年化少约 1 个百分点，夏普不变。波动率目标只是部分成立，没有纳入，只做影子记录（见下）。</li>
          </ul>
          <p className="lab-v01-card__now"><strong>现在：</strong><UsNow /></p>
          <VolShadowNow />
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
        十个月均线是最简单的对照规则，在美国 1872–1934 年和 14 个国家 1975–2025 年都方向一致，但作用很小、怕执行慢，只用来复核，不单独执行。
      </p>
    </article>
  )
}
