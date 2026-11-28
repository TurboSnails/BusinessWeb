import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { Page } from '../components/ui'
import BarChart, { PairChart } from '../features/ai-token-economics/BarChart'
import {
  ANTHROPIC_FINANCIALS, ANTHROPIC_IPO, PRICE_EVENTS, RAMP_LIMITS, SENSITIVITY_DEFAULT, UNIT_EXAMPLE, WATCHLIST,
  buildClaims, changeOf, grossPerUnit, impliedPriceChange, naiveSpendChange, revenueGrowthH1, revenueAfter, sensitivity, vendorPrices, volumeMultipleToKeepGross,
  type SensitivityInput, type Snapshot,
} from '../features/ai-token-economics/data'
import { useLatestSnapshot, type RefreshState } from '../features/ai-token-economics/useLatestSnapshot'
import '../styles/ai-token-economics.css'

const pct = (v: number, digits = 1) => Number.isFinite(v) ? `${v >= 0 ? '+' : '−'}${(Math.abs(v) * 100).toFixed(digits)}%` : '—'
const usd = (v: number) => `$${v.toFixed(2)}`
const num = (v: number) => v.toLocaleString('zh-CN', { maximumFractionDigits: 1 })

const SLIDERS: Array<{ key: 'tokenGrowth' | 'priceChange' | 'unitCostChange'; label: string; min: number; max: number }> = [
  { key: 'tokenGrowth', label: 'Token 使用量增长', min: -50, max: 200 },
  { key: 'priceChange', label: 'API 平均售价变化', min: -80, max: 50 },
  { key: 'unitCostChange', label: '单位推理成本变化', min: -80, max: 50 },
]

function Sensitivity(): JSX.Element {
  const [input, setInput] = useState<SensitivityInput>(SENSITIVITY_DEFAULT)
  const r = sensitivity(input)
  const base = input.revenue - input.cost
  return (
    <section className="ate-box" aria-labelledby="ate-sens">
      <h3 id="ate-sens">用量增长能不能盖过降价？</h3>
      <p className="ate-note">纯假设模型：初始收入 100、推理成本 50。不含训练、研发、销售费用与资本开支，不代表任何公司的实际毛利率。</p>
      <div className="ate-sliders">
        {SLIDERS.map(s => (
          <label key={s.key}>
            <span>{s.label}<b>{pct(input[s.key], 0)}</b></span>
            <input type="range" min={s.min} max={s.max} step={1} value={Math.round(input[s.key] * 100)}
              onChange={e => setInput({ ...input, [s.key]: Number(e.target.value) / 100 })} />
          </label>
        ))}
      </div>
      <dl className="ate-result">
        <div><dt>收入</dt><dd>{num(r.revenue)}<small>{pct(r.revenueChange)}</small></dd></div>
        <div><dt>推理成本</dt><dd>{num(r.cost)}<small>{pct(r.cost / input.cost - 1)}</small></dd></div>
        <div><dt>毛利润</dt><dd>{num(r.gross)}<small>较初始 {num(base)}：{pct(r.grossChange)}</small></dd></div>
      </dl>
      <button type="button" className="ate-reset" onClick={() => setInput(SENSITIVITY_DEFAULT)}>恢复对话中的情形</button>
    </section>
  )
}

const REFRESH_TEXT: Record<RefreshState, string> = {
  idle: '',
  loading: '正在向 Ramp 取最新一期…',
  newer: '已取到更新的一期，仅本次浏览显示；每月 16 日自动保存。',
  same: '已是最新一期，无需更新。',
  error: '暂时取不到 Ramp 数据，仍显示已保存的一期。',
}

function DataBar({ snapshot, saved, state, refresh }: { snapshot: Snapshot; saved: Snapshot; state: RefreshState; refresh: () => void }): JSX.Element {
  return (
    <div className="ate-databar">
      <p>
        <b>数据截至 {snapshot.weekEnding} 当周</b>（对比 {snapshot.comparedWeekEnding} 当周）
        {snapshot.weekEnding !== saved.weekEnding && <span className="ate-tag">未保存</span>}
        <small>已保存最新一期：{saved.weekEnding} · 来源 Ramp AI Index · 每月自动更新</small>
      </p>
      <button type="button" className="ate-reset" onClick={refresh} disabled={state === 'loading'}>
        <RefreshCw size={15} aria-hidden="true" />{state === 'loading' ? '刷新中…' : '刷新最新数据'}
      </button>
      <p className="ate-status" role="status" aria-live="polite">{REFRESH_TEXT[state]}</p>
    </div>
  )
}

export default function AiTokenEconomics(): JSX.Element {
  const { snapshot, saved, history, state, refresh } = useLatestSnapshot()
  const RAMP_WEEKLY = { tokenUsage: snapshot.tokenUsage, tokenSpend: snapshot.tokenSpend, openaiAnthropicBlendedPrice: snapshot.price.combined.change }
  const vendors = vendorPrices(snapshot)
  const trackedShare = Object.values(snapshot.spendShare).reduce((sum, v) => sum + v.now, 0)
  const implied = impliedPriceChange(RAMP_WEEKLY.tokenSpend, RAMP_WEEKLY.tokenUsage)
  const naive = naiveSpendChange(RAMP_WEEKLY.tokenUsage, RAMP_WEEKLY.openaiAnthropicBlendedPrice)
  const before = UNIT_EXAMPLE.before, after = UNIT_EXAMPLE.after
  const claims = buildClaims(snapshot)
  const fin = ANTHROPIC_FINANCIALS
  const yi = (billion: number) => num(billion * 10)
  return (
    <Page className="ate-page" variant="reading">
      <header className="ate-header">
        <h1>模型降价与利润：需求涨得比价格跌得快吗</h1>
        <p className="ate-lead">用量还在涨得比价格跌得快，客户总支出仍在增长；Anthropic 招股书显示它 2026 年二季度营业利润已转正，但只有一个季度，OpenAI 没有可比数据。</p>
        <p className="ate-note" role="note">
          思路整理自 2026-10-25 的一段 AI 对话，2026-11-28 按最新数据刷新。Ramp 的数字（用量、支出、综合单价、份额）由脚本直接解析自 Ramp AI Index 页面；API 价格核对了 OpenAI、Anthropic 官方价格页；Anthropic 财务来自其招股书，经雅虎财经等多家报道交叉核对（未能直接读到美国证监会的原文）。仍标“对话所述”的条目没有找到原始来源。标为“可复算”的值由页面内公式推出。研究参考，不构成买卖建议。
        </p>
      </header>

      <section className="ate-section" aria-labelledby="ate-concentration">
        <h2 id="ate-concentration">一、“80% 收入来自 1% 用户”对不对</h2>
        <p>说法来自媒体转述的 Ramp 首席经济学家观点：头部 1% 企业客户贡献约 80% 的 OpenAI / Anthropic 相关支出（Ramp 指数页面没有直接写出这句，属对话所述）。页面上能核对的是：AI 支出最高的 1% 企业，每名员工每月花在 AI 上的中位数约 1.02 万美元。这是 Ramp 观察到的样本，不是两家公司经审计的全部收入结构。</p>
        <p>更直接的证据在 Anthropic 的招股书：约五分之一的收入来自两名客户（雅虎财经报道）。截至 2026 年 9 月，过去 12 个月付费超过 100 万美元的客户约 1,900 家。</p>
        <p>收入集中本身不是坏事——大企业年付数千万美元，个人用户月付 20 美元，自然集中。要警惕的是头部客户主要是靠融资买 API 的 AI 初创公司，收入循环依赖，终端付费能否覆盖，才决定可持续性。</p>
      </section>

      <section className="ate-section" aria-labelledby="ate-ramp">
        <h2 id="ate-ramp">二、Token 需求增速 vs 价格下降速度</h2>
        <DataBar snapshot={snapshot} saved={saved} state={state} refresh={() => { void refresh() }} />
        <p>Ramp 企业样本，{snapshot.weekEnding} 当周对比 {snapshot.comparedWeekEnding} 当周（对应周比较，不是累计）：</p>
        <BarChart
          title="Ramp 样本：对应周变化"
          format={v => pct(v)}
          bars={[
            { label: 'Token 用量', value: RAMP_WEEKLY.tokenUsage, tone: 'a' },
            { label: 'Token 总支出', value: RAMP_WEEKLY.tokenSpend, tone: 'a' },
            { label: '平均单价（反推）', value: implied, tone: 'b' },
            { label: 'OpenAI+Anthropic 综合单价', value: RAMP_WEEKLY.openaiAnthropicBlendedPrice, tone: 'b' },
          ]}
        />
        <div className="ate-callout">
          <h3>三个数字为什么算不拢</h3>
          <p>{(1 + snapshot.tokenUsage).toFixed(3)} × {(1 + snapshot.price.combined.change).toFixed(3)} − 1 = <b>{pct(naive)}</b>，而 Ramp 报告的支出增长是 <b>{pct(RAMP_WEEKLY.tokenSpend)}</b>。原因是范围不同：</p>
          <ul>
            <li>{pct(snapshot.tokenUsage)} 与 {pct(snapshot.tokenSpend)} 是 Ramp 跟踪的<b>全部模型供应商</b>的总量和总支出；</li>
            <li>{pct(snapshot.price.combined.change)} 只是 <b>OpenAI 与 Anthropic</b> 两家的综合单价，不能直接相乘；</li>
            <li>同口径平均单价应由总支出与总用量反推：{(1 + snapshot.tokenSpend).toFixed(2)} ÷ {(1 + snapshot.tokenUsage).toFixed(3)} − 1 = <b>{pct(implied)}</b>（可复算）。</li>
          </ul>
        </div>
        <PairChart
          title="每百万 Token 综合价格"
          unit=" · 美元，按实际模型组合加权，非官方标价"
          format={usd}
          groups={vendors.map(v => ({ label: v.name, before: v.before, after: v.after }))}
        />
        <div className="ate-table-wrap">
          <table>
            <thead><tr><th>供应商</th><th>降价前</th><th>最新</th><th>披露降幅</th><th>由前后价复算</th><th>最新支出份额</th></tr></thead>
            <tbody>{vendors.map(v => (
              <tr key={v.name}><th scope="row">{v.name}</th><td>{usd(v.before)}</td><td>{usd(v.after)}</td><td>{pct(v.reportedChange)}</td><td>{pct(changeOf(v.before, v.after))}</td><td>{v.spendShare ? pct(v.spendShare, 1).replace('+', '') : '—'}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <p className="ate-note">复算与披露降幅的差异来自价格已四舍五入到分。OpenAI 降价更快，可能包含客户改用便宜模型的效应；Ramp 跟踪的五家供应商支出份额合计 {(trackedShare * 100).toFixed(1)}%。不能由此判断谁的利润率更高：推理成本、渠道分成与产品结构都不同。</p>
      </section>

      {history.length > 1 && <section className="ate-section" aria-labelledby="ate-history">
        <h2 id="ate-history">历次快照</h2>
        <div className="ate-table-wrap">
          <table>
            <thead><tr><th>当周截至</th><th>Token 用量</th><th>Token 支出</th><th>两家综合单价</th></tr></thead>
            <tbody>{[...history].reverse().map(h => <tr key={h.weekEnding}><th scope="row">{h.weekEnding}</th><td>{pct(h.tokenUsage)}</td><td>{pct(h.tokenSpend)}</td><td>${h.price.combined.now.toFixed(2)}（{pct(h.price.combined.change)}）</td></tr>)}</tbody>
          </table>
        </div>
      </section>}

      <section className="ate-section" aria-labelledby="ate-margin">
        <h2 id="ate-margin">三、降价对单位利润的杠杆</h2>
        <p>模型降价要看<b>售价降得比成本快还是慢</b>。假设每百万 Token 售价 10→5、成本 5→3：</p>
        <PairChart
          title="单位毛利润（假设案例）"
          unit=" · 美元 / 百万 Token"
          format={v => `$${v}`}
          groups={[
            { label: '售价', before: before.price, after: after.price },
            { label: '成本', before: before.cost, after: after.cost },
            { label: '毛利润', before: grossPerUnit(before), after: grossPerUnit(after) },
          ]}
        />
        <p>售价 {pct(changeOf(before.price, after.price), 0)}，成本 {pct(changeOf(before.cost, after.cost), 0)}，单位毛利润 {pct(changeOf(grossPerUnit(before), grossPerUnit(after)), 0)}。要维持毛利总额，销量要达到原来的 <b>{volumeMultipleToKeepGross(before, after)} 倍</b>（即增长 150%）。</p>
        <Sensitivity />
        <div className="ate-callout">
          <h3>杰文斯悖论不是必然规律</h3>
          <ul>
            <li>Token 价格 −50%、需求 3 倍：收入 {pct(revenueAfter(-0.5, 3), 0)}；</li>
            <li>Token 价格 −50%、需求只增 50%：收入 {pct(revenueAfter(-0.5, 1.5), 0)}。</li>
          </ul>
          <p>决定估值的是需求弹性能否持续超过价格下降速度。</p>
        </div>
      </section>

      <section className="ate-section" aria-labelledby="ate-profit">
        <h2 id="ate-profit">四、利润到底有没有下降</h2>
        <p>Ramp 的数据只到客户付了多少钱，回答不了利润。能核对利润的是 Anthropic 的招股书：2026 年 10 月 26 日公开递交，{ANTHROPIC_IPO.listedOn.slice(5, 7)} 月 {Number(ANTHROPIC_IPO.listedOn.slice(8))} 日在{ANTHROPIC_IPO.exchange}上市（代码 {ANTHROPIC_IPO.ticker}，发行价 {ANTHROPIC_IPO.pricedAt} 美元）。OpenAI 未上市，没有可比数据。</p>
        <BarChart
          title="Anthropic 财务（招股书，媒体报道）"
          unit=" · 亿美元"
          format={v => num(v)}
          bars={[
            { label: '2025 全年收入', value: fin.revenue2025 * 10, tone: 'a' },
            { label: '2025 全年营业亏损', value: fin.operatingLoss2025 * 10, tone: 'b' },
            { label: '2025 全年算力支出', value: fin.computeAndInfra2025 * 10, tone: 'c' },
            { label: '2026 上半年收入', value: fin.revenueH1_2026 * 10, tone: 'a' },
            { label: '2026 上半年营业亏损', value: fin.operatingLossH1_2026 * 10, tone: 'b' },
            { label: '2026 上半年算力', value: fin.computeAndInfraH1_2026 * 10, tone: 'c' },
          ]}
        />
        <ul>
          <li>2025 年收入 {yi(fin.revenue2025)} 亿美元，营业亏损 {yi(fin.operatingLoss2025)} 亿，算力与基础设施支出约 {yi(fin.computeAndInfra2025)} 亿，花在算力上的钱比收入还多。</li>
          <li>2026 年上半年收入 {yi(fin.revenueH1_2026)} 亿美元，约为去年同期（{yi(fin.revenueH1_2025)} 亿）的 {revenueGrowthH1().toFixed(1)} 倍；一季度 {yi(fin.revenueQ1_2026)} 亿、二季度 {yi(fin.revenueQ2_2026)} 亿。</li>
          <li>营业亏损收窄到 {yi(fin.operatingLossH1_2026)} 亿美元：一季度亏损约 17 亿，<b>二季度营业利润 {yi(fin.operatingIncomeQ2_2026)} 亿</b>。</li>
          <li>上半年净亏损 {yi(fin.netLossH1_2026)} 亿美元，其中约 {yi(fin.nonCashFairValueH1_2026)} 亿是可转债等按公允价值重估的非现金损失，不反映经营。</li>
        </ul>
        <p>这说明至少在 Anthropic，到 2026 年二季度为止，用量和收入的增长盖过了降价。但只有一个季度；它已锁定的云算力合约规模巨大（媒体报道约 4,300 亿美元），算力支出能否持续低于收入增长，要看后续季度。</p>
        <p className="ate-note">收入口径也不同：对话称路透社报道 OpenAI 对部分云渠道收入按净额确认，Anthropic 按总额确认，直接比较两家收入会失真（对话所述，未找到原文）。</p>
      </section>

      <section className="ate-section" aria-labelledby="ate-price">
        <h2 id="ate-price">五、近期价格变化</h2>
        <p>每百万 Token 输入 / 输出的官方标价（美元），同档新旧型号比较，2026-11-28 查看。标价下降不等于客户实际单价同幅下降：Ramp 的综合单价还包含客户在型号之间的迁移。</p>
        <div className="ate-table-wrap">
          <table>
            <thead><tr><th>对象</th><th>变化</th><th>来源</th></tr></thead>
            <tbody>{PRICE_EVENTS.map(e => <tr key={e.item}><th scope="row">{e.item}</th><td>{e.change}</td><td><span className="ate-tag">{e.status}</span></td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="ate-section" aria-labelledby="ate-claims">
        <h2 id="ate-claims">六、哪些结论站得住</h2>
        <div className="ate-table-wrap">
          <table>
            <thead><tr><th>说法</th><th>判断</th><th>依据</th><th>状态</th></tr></thead>
            <tbody>{claims.map(c => <tr key={c.claim}><th scope="row">{c.claim}</th><td>{c.verdict}</td><td>{c.basis}</td><td><span className="ate-tag">{c.status}</span></td></tr>)}</tbody>
          </table>
        </div>
        <h3>Ramp 数据的局限</h3>
        <dl className="ate-limits">{RAMP_LIMITS.map(l => <React.Fragment key={l.title}><dt>{l.title}</dt><dd>{l.detail}</dd></React.Fragment>)}</dl>
        <p>适合观察美国企业 AI 采用率与支出趋势，是领先指标；不适合判断 OpenAI、Anthropic 是否盈利，也不能单独判断算力是否供过于求。</p>
      </section>

      <section className="ate-section" aria-labelledby="ate-invest">
        <h2 id="ate-invest">七、对投资的含义与跟踪清单</h2>
        <p>价格战意味着 AI 创造的经济价值未必全部落在模型公司和算力供应商手里；长期受益者可能向能用廉价智能创造真实收入的应用公司转移。这一段是对话中的判断，不是已验证的事实。</p>
        <div className="ate-table-wrap">
          <table>
            <thead><tr><th>指标</th><th>健康信号</th><th>风险信号</th></tr></thead>
            <tbody>{WATCHLIST.map(w => <tr key={w.metric}><th scope="row">{w.metric}</th><td>{w.healthy}</td><td>{w.risk}</td></tr>)}</tbody>
          </table>
        </div>
        <div className="ate-callout">
          <h3>真正危险的组合（三者同时出现）</h3>
          <ol>
            <li>头部 AI 应用的终端付费增长放缓；</li>
            <li>模型价格持续下降，API 收入增长跟不上 Token 用量；</li>
            <li>OpenAI、Anthropic 仍按激进速度扩大算力资本开支。</li>
          </ol>
          <p>若出现“Token 用量保持 50% 以上增长，客户实际支付只增长个位数甚至转负”，同时大型云厂商资本开支仍快速增长，算力需求与经济回报就开始脱节，压力会沿产业链传到云服务商、GPU 厂商和数据中心建设商。</p>
        </div>
        <p className="ate-links">相关：<Link to="/industry-landscape">产业格局</Link> · <Link to="/future-trends">主题研究</Link> · <Link to="/research-notes">公司研究</Link></p>
      </section>
    </Page>
  )
}
