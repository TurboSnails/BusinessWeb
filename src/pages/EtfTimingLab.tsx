import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Callout, Card, Page, PageDataFreshness, Segmented, TableWrap } from '../components/ui'
import { PageTitle } from '../components/ui/PageTabs'
import {
  asEtfTiming, CRITERIA, isRecent, staleDays, verdictSummary,
  type EtfTiming, type ShadowItem, type ShadowLatest, type Research, type ResearchRow, type StrategyKey, type Verdict, type WindowStat,
} from '../features/etf-timing/model'
import { LONG_DOC, OOS_ASOF, OOS_DOC, OOS_ROWS, OOS_SPLITS, OOS_VERDICTS, SCRIPTS } from '../features/etf-timing/oos'
import '../styles/etf-timing.css'
import { PlanChartLoader } from '../features/etf-signal-plans/PlanChartLoader'
import { PairBars, StatusGrid, priceChartPath } from '../features/etf-timing/charts'
import { LabNav } from '../features/etf-signal-plans/LabNav'

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

// 数字格式：带单位、真正的负号
const num = (x: number | null | undefined, digits = 1): string => (x == null || !Number.isFinite(x) ? '—' : x.toFixed(digits).replace('-', '−'))
const pct = (x: number | null | undefined): string => (x == null || !Number.isFinite(x) ? '—' : `${num(x)}%`)
const delta = (x: number): string => `${x > 0 ? '+' : ''}${num(x)}`
const IDX_NAME: Record<string, string> = { H00300: '沪深300', H00905: '中证500', H00852: '中证1000', H00016: '上证50', H00922: '中证红利' }
const idxName = (r: ResearchRow): string => IDX_NAME[r.code] ?? r.name.replace(/全收益$|收益$/, '')
const md = (d: string): string => `${Number(d.slice(5, 7))}月${Number(d.slice(8, 10))}日`

/* ---------- 本周结论 ---------- */
function Summary({ latest }: { latest: ShadowLatest }): JSX.Element {
  const bull = latest.timing.hs300Bull
  const recent = latest.items.filter(i => isRecent(i.hs.lastSignal, latest.asOf)).length
  const head = bull === null ? '本周择时数据缺失' : bull ? '本周：偏进攻，出现金叉的可按规则进场' : '本周：偏防守，规则不开新仓'
  return (
    <section className={`et-summary ${bull ? 'is-bull' : bull === false ? 'is-bear' : ''}`} aria-labelledby="et-summary-title">
      <p className="et-summary__eyebrow">影子记录 · 截至 {md(latest.asOf)}（周五收盘）</p>
      <h2 id="et-summary-title" className="et-summary__head">{head}</h2>
      <ul className="et-summary__facts">
        <li><strong>{latest.summary.hsHolding}</strong> 只规则持有中<span>此前金叉进场，等死叉离场</span></li>
        <li><strong>{recent}</strong> 只近 7 天有新信号<span>进场或离场</span></li>
        <li><strong>{latest.summary.n - latest.summary.hsHolding}</strong> 只空仓<span>共 {latest.summary.n} 只</span></li>
      </ul>
      <p className="et-summary__note">
        主规则看「沪深300÷红利」比值是否在 20 日均线上方（{bull === null ? '无数据' : bull ? '在上方' : '在下方'}）；对照组「创业板÷红利」{latest.timing.cybBull === null ? '无数据' : latest.timing.cybBull ? '在上方' : '在下方'}。这只是规则的机械状态，不是持仓建议。
      </p>
    </section>
  )
}

/* ---------- 本周名单（分组） ---------- */
function signalText(i: ShadowItem): string {
  const s = i.hs.lastSignal
  if (i.hs.pending) return `下一交易日${i.hs.pending === 'buy' ? '进场' : '离场'}`
  if (!s) return i.hs.holding ? '持有中' : '空仓'
  return `${md(s.date)}${s.side === 'buy' ? '进场' : '离场'}`
}

function EtfList({ items, asOf }: { items: ShadowItem[]; asOf: string }): JSX.Element {
  return (
    <ul className="et-list">
      {items.map(i => {
        const recent = isRecent(i.hs.lastSignal, asOf)
        return (
          <li key={i.code} className="et-list__item">
            <div className="et-list__name"><Link to={priceChartPath(i)} title="看价格与买卖信号图">{i.name}</Link><code>{i.code}</code></div>
            <div className="et-list__state">
              <span className={`et-chip ${i.hs.holding ? 'is-hold' : 'is-flat'}`}>{i.hs.holding ? '持有' : '空仓'}</span>
              <span className={recent ? 'et-list__sig is-recent' : 'et-list__sig'}>{signalText(i)}</span>
            </div>
            <div className="et-list__cmp">对照（创业板比值）：{i.cyb.holding ? '持有' : '空仓'}</div>
          </li>
        )
      })}
    </ul>
  )
}

/** 选一只 ETF 在页内看价格—信号图；选中后才拉行情。 */
function InlinePriceChart({ items }: { items: ShadowItem[] }): JSX.Element {
  const [code, setCode] = useState('')
  const picked = items.find(i => i.code === code)
  const sorted = useMemo(() => [...items].sort((a, b) => a.code.localeCompare(b.code)), [items])
  return (
    <div className="et-group" role="region" aria-label="单只价格图">
      <h3>单只价格图</h3>
      <label className="et-pick">
        <span>选一只 ETF</span>
        <select value={code} onChange={e => setCode(e.target.value)}>
          <option value="">请选择…</option>
          {sorted.map(i => <option key={i.code} value={i.code}>{i.name}（{i.code}）</option>)}
        </select>
      </label>
      {picked ? <PlanChartLoader key={picked.code} code={picked.code} name={picked.name} /> : <p className="et-lead">选中后现场拉取腾讯日线，画出价格、规则持仓段和买卖点。</p>}
    </div>
  )
}

function ShadowSection({ latest, now }: { latest: ShadowLatest; now: Date }): JSX.Element {
  const stale = staleDays(latest.asOf, now)
  const byCode = (a: ShadowItem, b: ShadowItem): number => a.code.localeCompare(b.code)
  const recent = latest.items.filter(i => isRecent(i.hs.lastSignal, latest.asOf)).sort(byCode)
  const recentSet = new Set(recent.map(i => i.code))
  const holding = latest.items.filter(i => i.hs.holding && !recentSet.has(i.code)).sort(byCode)
  const flat = latest.items.filter(i => !i.hs.holding && !recentSet.has(i.code)).sort(byCode)
  return (
    <section className="et-section" id="et-shadow" aria-labelledby="et-shadow-title">
      <h2 id="et-shadow-title">本周名单</h2>
      <p className="et-lead">冻结名单 {latest.summary.n + latest.summary.missing} 只场内基金（以 ETF 为主，名单版本 {latest.universeVersion ?? '—'}，不按表现增删），每周六按周五收盘记录一次。</p>
      {stale > 9 && <Callout tone="warn" title={`影子记录已 ${stale} 天未更新`}>最近一次是 {latest.asOf}；每周六自动运行，可能被行情站限流，下次运行会补上。</Callout>}
      {!latest.complete && <Callout tone="warn" title="本周记录不完整">缺 {latest.summary.missing} 只（行情站限流），不计入事后评估；同一周重跑会覆盖。</Callout>}
      <StatusGrid items={latest.items} asOf={latest.asOf} isRecent={isRecent} />
      <InlinePriceChart items={latest.items} />
      <div className="et-group" role="region" aria-label="近 7 天新信号">
        <h3>近 7 天新信号 <span className="et-count">{recent.length}</span></h3>
        {recent.length ? <EtfList items={recent} asOf={latest.asOf} /> : <p className="et-lead">这一周没有新的进场或离场。</p>}
      </div>
      <div className="et-group" role="region" aria-label="规则持有中">
        <h3>规则持有中（较早进场） <span className="et-count">{holding.length}</span></h3>
        {holding.length ? <EtfList items={holding} asOf={latest.asOf} /> : <p className="et-lead">没有。</p>}
      </div>
      <details className="et-group et-group--fold">
        <summary><h3>空仓（近 7 天无信号） <span className="et-count">{flat.length}</span></h3><span className="et-fold-hint">展开</span></summary>
        <EtfList items={flat} asOf={latest.asOf} />
      </details>
    </section>
  )
}

/* ---------- 长历史检验 ---------- */
const OTHERS: Array<[StrategyKey, string]> = [['cyb', '创业板比值择时'], ['macd', 'MACD'], ['ma20', '20 日线']]

function PairCell({ a, b, kind }: { a: number | null | undefined; b: number | null | undefined; kind: 'ret' | 'dd' }): JSX.Element {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return <td>—</td>
  const d = b - a
  const good = d >= 0 // 收益更高或回撤更浅（回撤为负数，差值为正 = 更浅）
  return (
    <td className="et-pair">
      <span className="et-pair__from">{pct(a)}</span>
      <span className="et-pair__arrow" aria-hidden="true">→</span>
      <span className="et-pair__to">{pct(b)}</span>
      <span className={`et-delta ${good ? 'is-good' : 'is-bad'}`}>{kind === 'dd' ? (d >= 0 ? `浅 ${num(d)}` : `深 ${num(-d)}`) : delta(d)}</span>
    </td>
  )
}

function VerdictBadge({ v }: { v?: Verdict }): JSX.Element {
  if (!v) return <span>—</span>
  if (v.ddPass && v.annualPass) return <span className="et-verdict-badge is-pass">通过</span>
  return <span className="et-verdict-badge is-fail">{!v.ddPass && !v.annualPass ? '两项未过' : v.ddPass ? '年化未过' : '回撤未过'}</span>
}

function ResearchRows({ rows, win, crash, verdicts, showOthers }: { rows: ResearchRow[]; win: string; crash: boolean; verdicts: Map<string, Verdict>; showOthers: boolean }): JSX.Element {
  const ret = (s: WindowStat): number | null | undefined => (crash ? s?.total : s?.annual)
  return (
    <>
      {rows.map(row => {
        const w = row.windows[win]
        return (
          <tr key={row.code}>
            <th scope="row"><span className="et-idx">{idxName(row)}</span></th>
            <PairCell a={ret(w?.hold ?? null)} b={ret(w?.hs ?? null)} kind="ret" />
            <PairCell a={w?.hold?.dd} b={w?.hs?.dd} kind="dd" />
            {showOthers && OTHERS.map(([k]) => <td key={k} className="et-other">{pct(ret(w?.[k] ?? null))}<small>回撤 {pct(w?.[k]?.dd)}</small></td>)}
            <td><VerdictBadge v={verdicts.get(row.code)} /></td>
          </tr>
        )
      })}
    </>
  )
}

function ResearchSection({ r }: { r: Research }): JSX.Element {
  const labels = r.windows.map(w => w[0])
  const [win, setWin] = useState(labels[0] ?? '')
  const [showOthers, setShowOthers] = useState(false)
  const v = verdictSummary(r.verdict)
  const crash = win.includes('～')
  const verdicts = useMemo(() => new Map(r.verdict.map(x => [x.code, x])), [r.verdict])
  const pass = r.results.filter(x => { const vd = verdicts.get(x.code); return vd?.ddPass && vd.annualPass })
  const fail = r.results.filter(x => !pass.includes(x))
  const cols = 4 + (showOthers ? OTHERS.length : 0)
  return (
    <section className="et-section" id="et-long" aria-labelledby="et-long-title">
      <h2 id="et-long-title">长历史检验：2011 年起，15 个指数</h2>
      <div className="et-verdict-box">
        <p className="et-verdict-box__head">部分通过：两项都过 {v.both} / {v.total}</p>
        <div className="et-verdict-box__bars">
          <div><span>大跌里控回撤</span><strong>{v.dd} / {v.total}</strong></div>
          <div><span>长期年化不吃亏</span><strong>{v.annual} / {v.total}</strong></div>
        </div>
        <p>控回撤稳定，规则没见过的 2011—2018 年同样成立。代价集中在沪深300、上证50、红利、医药、金融地产、通信这类大盘/防御品种，每年少赚 1.5～5 个百分点；中证500/1000、材料、工业、信息等中小盘与周期成长类，收益和回撤都占优。</p>
        <details><summary>事先写定的标准</summary><p>{CRITERIA}</p></details>
      </div>
      <div className="et-toolbar">
        <div className="et-seg-scroll"><Segmented<string> label="区间" value={win} onChange={setWin} items={labels.map(l => ({ id: l, label: l.replace(/ \d{4}-\d{2}-\d{2}～\d{4}-\d{2}-\d{2}/, '') }))} /></div>
        <label className="et-toggle"><input type="checkbox" checked={showOthers} onChange={e => setShowOthers(e.target.checked)} /> 显示对照策略</label>
      </div>
      <div className="et-charts">
        <PairBars title={crash ? '区间收益' : '年化收益'} hint="择时的条比一直持有长，说明收益更高" pairs={[...pass, ...fail].map(r => ({ label: idxName(r), hold: crash ? r.windows[win]?.hold?.total : r.windows[win]?.hold?.annual, timing: crash ? r.windows[win]?.hs?.total : r.windows[win]?.hs?.annual }))} />
        <PairBars title="最大回撤" hint="条越短回撤越浅，择时的条比一直持有短才算控住了回撤" pairs={[...pass, ...fail].map(r => ({ label: idxName(r), hold: r.windows[win]?.hold?.dd, timing: r.windows[win]?.hs?.dd }))} />
      </div>
      <TableWrap label="长历史检验结果" stickyFirst>
        <table className="ui-table et-rtable">
          <caption className="visually-hidden">{win}：一直持有与择时的对比</caption>
          <thead>
            <tr>
              <th scope="col">指数</th>
              <th scope="col">{crash ? '区间收益' : '年化收益'}<small>一直持有 → 择时</small></th>
              <th scope="col">最大回撤<small>一直持有 → 择时</small></th>
              {showOthers && OTHERS.map(([k, l]) => <th key={k} scope="col">{l}<small>{crash ? '区间收益' : '年化'}</small></th>)}
              <th scope="col">验收</th>
            </tr>
          </thead>
          <tbody>
            <tr className="et-rgroup"><th colSpan={cols} scope="colgroup">两项都通过 · {pass.length}</th></tr>
            <ResearchRows rows={pass} win={win} crash={crash} verdicts={verdicts} showOthers={showOthers} />
            <tr className="et-rgroup is-fail"><th colSpan={cols} scope="colgroup">未通过 · {fail.length}</th></tr>
            <ResearchRows rows={fail} win={win} crash={crash} verdicts={verdicts} showOthers={showOthers} />
          </tbody>
        </table>
      </TableWrap>
      <p className="et-lead">中证全收益指数（含分红），信号次日收盘成交，单边成本 0.1%；生成于 {r.generatedAt.slice(0, 10)}。「验收」按全期判定，与所选区间无关。{r.errors.length > 0 && ` 本次未取到：${r.errors.join('、')}。`} <a href={LONG_DOC} target="_blank" rel="noreferrer">完整报告</a></p>
    </section>
  )
}

/* ---------- 样本外结论 ---------- */
function OosSection(): JSX.Element {
  return (
    <section className="et-section" id="et-oos" aria-labelledby="et-oos-title">
      <h2 id="et-oos-title">另一个开源项目三套 ETF 规则的样本外检验</h2>
      <p className="et-lead">复现后只用切分点之前的数据挑选、冻结名单，看切分点之后的表现（{OOS_ASOF}，76 只 ETF 等权平均；超额 = 策略年化 − 一直持有年化，单位：百分点）。</p>
      <div className="et-verdicts">
        {OOS_VERDICTS.map(x => <Card key={x.title} title={x.title} className={`et-verdict et-verdict--${x.tone}`}><p>{x.text}</p></Card>)}
      </div>
      <details className="et-group et-group--fold">
        <summary><h3>三个切分点的数字</h3><span className="et-fold-hint">展开</span></summary>
        <TableWrap label="样本外检验结果" stickyFirst>
          <table className="ui-table et-rtable">
            <thead><tr><th scope="col">项目</th>{OOS_SPLITS.map(s => <th key={s} scope="col">{s}</th>)}</tr></thead>
            <tbody>{OOS_ROWS.map(r => <tr key={r.label}><th scope="row">{r.label}</th>{r.values.map((v, i) => <td key={i}>{v}</td>)}</tr>)}</tbody>
          </table>
        </TableWrap>
      </details>
      <p className="et-lead">局限：34 只用新浪日线（拆分已复权、分红未复权）；样本外仅 2～4 年且 ETF 间高度相关。<a href={OOS_DOC} target="_blank" rel="noreferrer">完整报告与方法</a></p>
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
      <LabNav current="/lab/etf-timing" />
      <header className="et-intro">
        <p className="et-tag">实验 · 观察中</p>
        <h2>择时＋只认金叉</h2>
        <p>「沪深300÷红利」比值在 20 日均线上方时，MACD 金叉次日进场；在下方时不开新仓；持有中出现死叉当日收盘离场。目标是<strong>降低回撤</strong>，正在按事先写定的标准逐步检验。</p>
      </header>
      <Callout tone="danger" title="观察中，未验证，不是买卖指令">历史统计不代表未来；页面只记录规则的机械状态，供事后检验。不构成投资建议。</Callout>
      <nav className="et-toc" aria-label="本页目录">
        <a href="#et-shadow">本周名单</a><a href="#et-long">长历史检验</a><a href="#et-oos">样本外检验</a><a href="#et-more">相关</a>
      </nav>
      <ol className="et-steps" aria-label="验证进度">
        <li className="is-partial"><strong>① 长历史检验</strong><span>部分通过</span></li>
        <li className="is-running"><strong>② 影子运行 6～12 个月</strong><span>进行中</span></li>
        <li><strong>③ 是否用于牛熊周期观察</strong><span>未开始</span></li>
      </ol>

      {load.state === 'loading' && <p role="status" className="et-lead">正在加载实验数据…</p>}
      {load.state === 'error' && <Callout tone="danger" title="实验数据暂时无法加载">{load.message}。请稍后刷新；数据由每周六的定时任务生成。</Callout>}
      {data && (
        <>
          {data.latest && <Summary latest={data.latest} />}
          <PageDataFreshness checkedAt={data.generatedAt} dataLabel="影子记录截至" dataDates={[data.latest?.asOf]} researchAsOf={data.research?.generatedAt?.slice(0, 10)} />
          {data.latest ? <ShadowSection latest={data.latest} now={clock} /> : <p className="et-lead">还没有影子运行记录。</p>}
          {data.history.length > 1 && (
            <section className="et-section" aria-labelledby="et-history">
              <h2 id="et-history">历次记录</h2>
              <TableWrap label="影子运行历次记录">
                <table className="ui-table et-rtable">
                  <thead><tr><th scope="col">截至</th><th scope="col">沪深300 比值</th><th scope="col">规则持有</th><th scope="col">完整</th></tr></thead>
                  <tbody>{[...data.history].reverse().map(h => <tr key={h.asOf}><th scope="row">{h.asOf}</th><td>{h.hs300Bull === null ? '—' : h.hs300Bull ? '偏进攻' : '偏防守'}</td><td>{h.hsHolding} / {h.n}</td><td>{h.complete ? '是' : `缺 ${h.missing}`}</td></tr>)}</tbody>
                </table>
              </TableWrap>
            </section>
          )}
          {data.research ? <ResearchSection r={data.research} /> : <p className="et-lead">长历史检验结果暂缺。</p>}
        </>
      )}
      <OosSection />
      <section className="et-section" id="et-more" aria-labelledby="et-more-title">
        <h2 id="et-more-title">相关</h2>
        <ul className="et-links">
          <li><Link to="/monitor?tab=market-cycle">牛熊周期</Link>：站内「趋势防守」规则的样本内回测，结论相近——回撤降低、没有择时能力。</li>
          <li><a href={SCRIPTS} target="_blank" rel="noreferrer">脚本与数据</a>：策略代码、回测、影子运行与冻结名单，可复跑。</li>
          <li>验证标准与进度记录在仓库 docs/TODO-投资工具优化.md。</li>
        </ul>
      </section>
    </Page>
  )
}
