import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Callout, Card, Page, PageDataFreshness, Segmented, Stat, StatGrid, TableWrap } from '../components/ui'
import { PageTitle } from '../components/ui/PageTabs'
import {
  asEtfTiming, CRITERIA, filterItems, fmt1, isRecent, staleDays, verdictSummary,
  type EtfTiming, type ItemFilter, type RuleState, type ShadowLatest, type Research, type StrategyKey,
} from '../features/etf-timing/model'
import { LONG_DOC, OOS_ASOF, OOS_DOC, OOS_ROWS, OOS_SPLITS, OOS_VERDICTS, SCRIPTS } from '../features/etf-timing/oos'
import '../styles/etf-timing.css'

const BASE = (import.meta as { env?: Record<string, string | undefined> }).env?.BASE_URL ?? '/'
type Load = { state: 'loading' } | { state: 'error'; message: string } | { state: 'ok'; data: EtfTiming }

function useEtfTiming(): Load {
  const [load, setLoad] = useState<Load>({ state: 'loading' })
  useEffect(() => {
    const controller = new AbortController()
    fetch(`${BASE}data/etf-timing.json`, { cache: 'no-cache', signal: controller.signal })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((body: unknown) => {
        const data = asEtfTiming(body)
        setLoad(data ? { state: 'ok', data } : { state: 'error', message: '数据文件格式不对' })
      })
      .catch((e: unknown) => { if (!controller.signal.aborted) setLoad({ state: 'error', message: e instanceof Error ? e.message : '网络错误' }) })
    return () => controller.abort()
  }, [])
  return load
}

const regime = (bull: boolean | null): JSX.Element => bull === null ? <Badge tone="muted">无数据</Badge> : bull ? <Badge tone="accent">偏进攻（可开仓）</Badge> : <Badge tone="warm">偏防守（不开新仓）</Badge>

function RuleCell({ s, asOf }: { s: RuleState; asOf: string }): JSX.Element {
  const sig = s.lastSignal
  return (
    <div className="et-rule">
      {s.holding ? <Badge tone="accent">规则持有</Badge> : <Badge tone="muted">规则空仓</Badge>}
      {s.pending && <small className="et-pending">下一交易日{s.pending === 'buy' ? '进场' : '离场'}</small>}
      {sig && <small className={isRecent(sig, asOf) ? 'et-sig is-recent' : 'et-sig'}>{sig.side === 'buy' ? '进场' : '离场'} {sig.date.slice(5)}</small>}
    </div>
  )
}

function ShadowSection({ latest, now }: { latest: ShadowLatest; now: Date }): JSX.Element {
  const [filter, setFilter] = useState<ItemFilter>('all')
  const items = useMemo(() => filterItems(latest.items, filter, latest.asOf), [latest, filter])
  const stale = staleDays(latest.asOf, now)
  const recentCount = latest.items.filter(i => isRecent(i.hs.lastSignal, latest.asOf) || isRecent(i.cyb.lastSignal, latest.asOf)).length
  return (
    <section className="et-section" aria-labelledby="et-shadow">
      <h2 id="et-shadow">本周影子运行</h2>
      <p className="et-muted">冻结名单 {latest.summary.n + latest.summary.missing} 只场内基金（以 ETF 为主，名单版本 {latest.universeVersion ?? '—'}，不按表现增删），每周六按上周五收盘记录一次规则状态，用于事后检验。</p>
      {stale > 9 && <Callout tone="warn" title={`影子记录已 ${stale} 天未更新`}>最近一次是 {latest.asOf}；每周六自动运行，可能被行情站限流，下次运行会补上。</Callout>}
      {!latest.complete && <Callout tone="warn" title="本周记录不完整">缺 {latest.summary.missing} 只（行情站限流），不计入事后评估；同一周重跑会覆盖。</Callout>}
      <StatGrid>
        <Stat label="择时：沪深300÷红利" value={regime(latest.timing.hs300Bull)} sub="比值在 20 日线上为偏进攻" />
        <Stat label="择时：创业板÷红利" value={regime(latest.timing.cybBull)} sub="对照组" />
        <Stat label="规则持有（沪深300 比值）" value={`${latest.summary.hsHolding} / ${latest.summary.n}`} sub={`创业板比值：${latest.summary.cybHolding} / ${latest.summary.n}`} />
        <Stat label="近 7 天有信号" value={recentCount} sub={`截至 ${latest.asOf}`} />
      </StatGrid>
      <Segmented<ItemFilter> label="筛选" value={filter} onChange={setFilter} items={[
        { id: 'all', label: `全部 ${latest.items.length}` },
        { id: 'holding', label: '任一规则持有' },
        { id: 'recent', label: '近 7 天有信号' },
      ]} />
      {items.length === 0 ? <p className="et-muted">没有符合条件的 ETF。</p> : (
        <TableWrap label="ETF 规则状态" stickyFirst>
          <table className="ui-table et-table">
            <thead><tr><th scope="col">ETF</th><th scope="col">沪深300 比值择时</th><th scope="col">创业板 比值择时</th><th scope="col">收盘</th></tr></thead>
            <tbody>
              {items.map(i => (
                <tr key={i.code}>
                  <th scope="row"><span className="et-name">{i.name}</span><small className="et-code">{i.code}</small></th>
                  <td><RuleCell s={i.hs} asOf={latest.asOf} /></td>
                  <td><RuleCell s={i.cyb} asOf={latest.asOf} /></td>
                  <td className="et-num">{Number.isFinite(i.close) ? i.close.toFixed(3) : '—'}<small className="et-code">{i.date.slice(5)}</small></td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      )}
      <p className="et-muted">「规则持有 / 空仓」只是这条规则在历史数据上的机械状态，<strong>不是持仓建议</strong>；进场、离场日期为信号日（成交按次日开盘或当日收盘计）。</p>
    </section>
  )
}

const STRATS: Array<[StrategyKey, string]> = [['hold', '一直持有'], ['hs', '择时（沪深300 比值）'], ['cyb', '择时（创业板 比值）'], ['macd', 'MACD'], ['ma20', '20 日线']]

function ResearchSection({ r }: { r: Research }): JSX.Element {
  const labels = r.windows.map(w => w[0])
  const [win, setWin] = useState(labels[0] ?? '')
  const v = verdictSummary(r.verdict)
  const crash = win.includes('～')
  const verdictOf = new Map(r.verdict.map(x => [x.code, x]))
  return (
    <section className="et-section" aria-labelledby="et-long">
      <h2 id="et-long">2011 年起长历史检验（第 ① 步）</h2>
      <Callout tone="warn" title={`部分通过：两项都过 ${v.both} / ${v.total}`}>
        <p>事先写定的标准：{CRITERIA}</p>
        <p>大跌回撤 {v.dd} / {v.total} 通过；全期年化 {v.annual} / {v.total} 通过。控回撤稳定（规则未见过的 2011—2018 同样成立）；代价集中在沪深300、上证50、红利、医药、金融地产、通信等大盘/防御类，每年少赚 1.5～5 个百分点；中证500/1000、材料、工业、信息等中小盘与周期成长类收益与回撤双优。</p>
      </Callout>
      <p className="et-muted">被交易标的为中证全收益指数（含分红），信号次日收盘成交，单边成本 0.1%。生成于 {r.generatedAt.slice(0, 10)}。</p>
      <div className="et-seg-scroll"><Segmented<string> label="区间" value={win} onChange={setWin} items={labels.map(l => ({ id: l, label: l.replace(/ \d{4}-\d{2}-\d{2}～\d{4}-\d{2}-\d{2}/, '') }))} /></div>
      <TableWrap label="长历史检验结果" stickyFirst>
        <table className="ui-table et-table">
          <caption className="visually-hidden">{win}：各策略{crash ? '区间总收益' : '年化'}与最大回撤</caption>
          <thead><tr><th scope="col">指数</th>{STRATS.map(([k, l]) => <th key={k} scope="col">{l}</th>)}<th scope="col">验收</th></tr></thead>
          <tbody>
            {r.results.map(row => {
              const w = row.windows[win]; const vd = verdictOf.get(row.code)
              return (
                <tr key={row.code}>
                  <th scope="row"><span className="et-name">{row.name}</span><small className="et-code">{row.code}</small></th>
                  {STRATS.map(([k]) => { const s = w?.[k]; return <td key={k} className="et-num">{s ? <>{fmt1(crash ? s.total : s.annual)}<small className="et-dd">回撤 {fmt1(s.dd)}</small></> : '—'}</td> })}
                  <td>{vd ? (vd.ddPass && vd.annualPass ? <Badge tone="accent">通过</Badge> : <Badge tone="warm" title={`${vd.ddPass ? '' : '大跌回撤未过 '}${vd.annualPass ? '' : '全期年化未过'}`}>{vd.ddPass ? '年化未过' : vd.annualPass ? '回撤未过' : '均未过'}</Badge>) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TableWrap>
      <p className="et-muted">{crash ? '大跌窗口各列为区间总收益%，下方小字为区间最大回撤%。' : '各列为年化收益%，下方小字为最大回撤%。'}{r.errors.length > 0 && ` 本次未取到：${r.errors.join('、')}。`} <a href={LONG_DOC} target="_blank" rel="noreferrer">完整报告</a></p>
    </section>
  )
}

function OosSection(): JSX.Element {
  return (
    <section className="et-section" aria-labelledby="et-oos">
      <h2 id="et-oos">另一个开源项目三套 ETF 规则的样本外检验</h2>
      <p className="et-muted">对象是另一个项目新增的 ETF 回测规则。复现后只用切分点之前的数据挑选、冻结名单，看切分点之后的表现（{OOS_ASOF}，76 只 ETF 等权平均；超额 = 策略年化 − 一直持有年化，百分点）。</p>
      <div className="et-verdicts">
        {OOS_VERDICTS.map(x => <Card key={x.title} title={x.title} className={`et-verdict et-verdict--${x.tone}`}><p>{x.text}</p></Card>)}
      </div>
      <TableWrap label="样本外检验结果" stickyFirst>
        <table className="ui-table et-table">
          <thead><tr><th scope="col">项目</th>{OOS_SPLITS.map(s => <th key={s} scope="col">{s}</th>)}</tr></thead>
          <tbody>{OOS_ROWS.map(r => <tr key={r.label}><th scope="row">{r.label}</th>{r.values.map((v, i) => <td key={i} className="et-num">{v}</td>)}</tr>)}</tbody>
        </table>
      </TableWrap>
      <p className="et-muted">局限：34 只用新浪日线（拆分已复权、分红未复权）；样本外仅 2～4 年且 ETF 间高度相关。<a href={OOS_DOC} target="_blank" rel="noreferrer">完整报告与方法</a></p>
    </section>
  )
}

export default function EtfTimingLab({ now }: { now?: Date } = {}): JSX.Element {
  const load = useEtfTiming()
  const clock = useMemo(() => now ?? new Date(), [now])
  const data = load.state === 'ok' ? load.data : null
  return (
    <Page className="etf-timing-page">
      <PageTitle>择时实验：择时＋只认金叉（观察中）</PageTitle>
      <section className="et-intro">
        <h2>择时实验：择时＋只认金叉</h2>
        <p>规则：风格比值（沪深300÷中证红利）高于 20 日均线时，MACD 金叉次日进场；比值低于均线时不开新仓；持有中出现死叉当日收盘离场。它来自另一个项目的 ETF 回测，这里按事先写定的标准逐步检验，只作为<strong>降低回撤的观察信号</strong>。</p>
      </section>
      <Callout tone="danger" title="观察中，未验证，不是买卖指令">
        历史统计不代表未来；页面只记录规则的机械状态，供事后检验。第 ①、② 步都通过前不会接入投资计划或任何操作提示。不构成投资建议。
      </Callout>
      <ol className="et-steps" aria-label="验证进度">
        <li className="is-partial"><strong>① 长历史检验</strong><span>部分通过</span></li>
        <li className="is-running"><strong>② 影子运行 6～12 个月</strong><span>进行中</span></li>
        <li><strong>③ 决定是否用于牛熊周期观察</strong><span>未开始</span></li>
      </ol>

      {load.state === 'loading' && <p role="status" className="et-muted">正在加载实验数据…</p>}
      {load.state === 'error' && <Callout tone="danger" title="实验数据暂时无法加载">{load.message}。请稍后刷新；数据由每周六的定时任务生成。</Callout>}
      {data && (
        <>
          <PageDataFreshness checkedAt={data.generatedAt} dataLabel="影子记录截至" dataDates={[data.latest?.asOf]} researchAsOf={data.research?.generatedAt?.slice(0, 10)} />
          {data.latest ? <ShadowSection latest={data.latest} now={clock} /> : <p className="et-muted">还没有影子运行记录。</p>}
          {data.history.length > 1 && (
            <section className="et-section" aria-labelledby="et-history">
              <h2 id="et-history">历次记录</h2>
              <TableWrap label="影子运行历次记录">
                <table className="ui-table et-table">
                  <thead><tr><th scope="col">截至</th><th scope="col">沪深300 比值</th><th scope="col">规则持有</th><th scope="col">完整</th></tr></thead>
                  <tbody>{[...data.history].reverse().map(h => <tr key={h.asOf}><th scope="row">{h.asOf}</th><td>{h.hs300Bull === null ? '—' : h.hs300Bull ? '偏进攻' : '偏防守'}</td><td className="et-num">{h.hsHolding} / {h.n}</td><td>{h.complete ? '是' : `缺 ${h.missing}`}</td></tr>)}</tbody>
                </table>
              </TableWrap>
            </section>
          )}
          {data.research ? <ResearchSection r={data.research} /> : <p className="et-muted">长历史检验结果暂缺。</p>}
        </>
      )}
      <OosSection />
      <section className="et-section" aria-labelledby="et-more">
        <h2 id="et-more">相关</h2>
        <ul className="et-links">
          <li><Link to="/monitor?tab=market-cycle">牛熊周期</Link>：站内「趋势防守」规则的样本内回测，结论相近——回撤降低、没有择时能力。</li>
          <li><a href={SCRIPTS} target="_blank" rel="noreferrer">脚本与数据</a>：策略代码、回测、影子运行与冻结名单，可复跑。</li>
          <li>验证标准与进度记录在仓库 docs/TODO-投资工具优化.md。</li>
        </ul>
      </section>
    </Page>
  )
}
