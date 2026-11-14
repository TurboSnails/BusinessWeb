import React, { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Page } from '../components/ui'
import { PageTitle } from '../components/ui/PageTabs'
import CandidateButton from '../components/CandidateButton'
import SignalReview from '../components/SignalReview'
import { buildAutoDcf } from '../features/dcf/autoDcf'
import type { PrefillItem, PrefillLibrary } from '../features/dcf/autofill'
import { buildRadar, RADAR_BOOK, RADAR_RULES, RADAR_VERSION, type Check, type Exclusion, type Lane, type RadarLynch, type RadarResult, type RadarRow, type SideGroup } from '../features/dcf/radar'
import { useCandidates } from '../features/candidates/useCandidates'
import type { CandidateMarket } from '../features/candidates/validation'
import '../styles/radar.css'

type MarketFilter = 'all' | 'cn' | 'hk' | 'us'
const MARKET_NAME: Record<'cn' | 'hk' | 'us', string> = { cn: 'A股', hk: '港股', us: '美股' }
const SYMBOL: Record<string, string> = { CNY: '¥', HKD: 'HK$', USD: '$' }
const money = (v: number, ccy: string) => `${SYMBOL[ccy] ?? ''}${v.toFixed(2)}`
const pct = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}%`
const book = (file: string) => `/first-book/read/${encodeURIComponent(file)}`
const companyHref = (venue: string, code: string) => `/research-notes/${venue}/${encodeURIComponent(code)}`

interface CycleReport { records?: { weekEnding: string; markets: Record<string, { legacyState: string }> }[] }
const BASE = (import.meta as { env?: Record<string, string | undefined> }).env?.BASE_URL ?? '/'
const getJson = <T,>(name: string): Promise<T> =>
  fetch(`${BASE}data/${name}`, { cache: 'no-cache' }).then(r => (r.ok ? (r.json() as Promise<T>) : Promise.reject(new Error(String(r.status)))))

const LANE: Record<Lane, { title: string; chapter: string; chapterLabel: string; intro: string }> = {
  value: {
    title: '价值回归', chapter: RADAR_BOOK.value, chapterLabel: '第20章',
    intro: '稳健型与缓慢增长型。先证明正常盈利还在（不是周期顶点、近三年利润没有萎缩或大幅回撤），再要求现价低于自动 DCF 的买入参考价；比自身近 5 年便宜作为历史估值带的证据加分。',
  },
  growth: {
    title: '快速增长', chapter: RADAR_BOOK.growth, chapterLabel: '第21章',
    intro: '快速增长型。近一年与两年年化利润增速都要达到快速增长门槛、近一年没有明显放缓；价格条件按书中压力算式设定：增速维持 3 年、PE 回到 15 倍时，年化仍有 10%。这是条件，不是买入按钮。',
  },
}

const SIDE_LABEL: Record<SideGroup, string> = { cyclical: '周期型', turnaround: '困境反转型', asset: '资产型', nodata: '未分类或数据不足' }

function CheckChip({ c }: { c: Check }): JSX.Element {
  const cls = c.pass === true ? (c.points < 0 ? ' is-neg' : ' is-on') : c.pass === null ? ' is-na' : c.points < 0 ? ' is-neg' : ''
  const mark = c.pass === true ? '✓' : c.pass === false ? '✗' : '?'
  const pts = c.points ? `（${c.points > 0 ? '+' : ''}${c.points}）` : ''
  return <span className={`radar-signal${cls}`} title={c.detail}>{mark} {c.label}{pts}</span>
}

function Checks({ r }: { r: RadarRow }): JSX.Element {
  return (
    <span className="radar-signals">
      {r.gates.map(c => <CheckChip key={c.id} c={c} />)}
      {r.checks.map(c => <CheckChip key={c.id} c={c} />)}
      {r.overlay.map(c => <CheckChip key={c.id} c={c} />)}
    </span>
  )
}

function Dates({ r }: { r: RadarRow }): JSX.Element {
  return (
    <small className="radar-dates">
      价格 {r.dates.price ?? '—'}
      {r.lane === 'growth' ? ` · PE ${r.dates.pe ?? '—'} · 增速：${r.dates.growth}` : ` · 财年 ${r.dates.fy}`}
    </small>
  )
}

function Names({ list }: { list: { item: PrefillItem }[] }): JSX.Element {
  return <span className="radar-names">{list.map(e => e.item.n).join('、')}</span>
}

/** 未进榜原因：按原因归并，原因里的具体数字（如 PE）放到名单里不再拆组 */
function ExcludedList({ list }: { list: Exclusion[] }): JSX.Element {
  const groups = new Map<string, Exclusion[]>()
  for (const e of list) {
    const k = e.reason.startsWith('价格条件未满足：PE') ? '价格条件未满足：PE 高于压力上限' : e.reason
    groups.set(k, [...(groups.get(k) ?? []), e])
  }
  return (
    <ul className="radar-reasons">
      {[...groups].sort((a, b) => b[1].length - a[1].length).map(([reason, xs]) => (
        <li key={reason}><strong>{reason}</strong>（{xs.length} 家）：<Names list={xs} /></li>
      ))}
    </ul>
  )
}

function LaneTable({ lane, rows, inPool, toggle }: { lane: Lane; rows: RadarRow[]; inPool: (r: RadarRow) => boolean; toggle: (r: RadarRow) => void }): JSX.Element {
  return (
    <div className="radar-table-wrap">
      <table className="radar-table">
        <thead>
          {lane === 'value' ? (
            <tr><th scope="col">#</th><th scope="col">公司</th><th scope="col">现价</th><th scope="col">合理价</th><th scope="col">买入参考</th><th scope="col">距合理价</th><th scope="col">可信度</th><th scope="col">检查（悬停看依据）</th><th scope="col">得分</th><th scope="col">候选</th></tr>
          ) : (
            <tr><th scope="col">#</th><th scope="col">公司</th><th scope="col">PE</th><th scope="col">有效增速</th><th scope="col">营收增速</th><th scope="col">PE 上限</th><th scope="col">余量</th><th scope="col">检查（悬停看依据）</th><th scope="col">得分</th><th scope="col">候选</th></tr>
          )}
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key}>
              <td>{i + 1}</td>
              <td>
                <Link to={companyHref(r.venue, r.item.c)}>{r.item.n}</Link>
                <small>{r.item.c} · {MARKET_NAME[r.item.m]} · {r.lynch.t}{r.item.ind ? ` · ${r.item.ind}` : ''}</small>
                <Dates r={r} />
              </td>
              {lane === 'value' && r.dcf ? (
                <>
                  <td>{money(r.dcf.current, r.dcf.currency)}</td>
                  <td><Link to={`/dcf?${new URLSearchParams({ code: r.item.c, market: r.item.m, currency: r.item.ccy })}`}>{money(r.dcf.fair!, r.dcf.currency)}</Link></td>
                  <td>{money(r.dcf.buyBelow!, r.dcf.currency)}</td>
                  <td className="radar-mos">{pct(r.headroom)}</td>
                  <td><span className={`radar-cred is-${r.dcf.credibility}`}>{r.dcf.credibility === 'high' ? '高' : '中'}</span></td>
                </>
              ) : (
                <GrowthCells r={r} />
              )}
              <td><Checks r={r} /></td>
              <td className="radar-score">{r.score}</td>
              <td><CandidateButton on={inPool(r)} onClick={() => toggle(r)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function GrowthCells({ r }: { r: RadarRow }): JSX.Element {
  const l: RadarLynch = r.lynch
  const eg = Math.min(l.g ?? 0, l.c ?? 0)
  const ceiling = l.pe ? l.pe * (1 + r.headroom) : null
  return (
    <>
      <td>{l.pe?.toFixed(1)}×</td>
      <td title={`近一年 ${l.g}%，两年年化 ${l.c}%`}>{eg}%</td>
      <td>{l.rg}%</td>
      <td>{ceiling?.toFixed(1)}×</td>
      <td className="radar-mos">{pct(r.headroom)}</td>
    </>
  )
}

function SideNote({ side, watch }: { side: Exclusion[]; watch: RadarResult['cyclicalWatch'] }): JSX.Element {
  const groups = (['cyclical', 'turnaround', 'asset', 'nodata'] as SideGroup[]).map(g => [g, side.filter(e => e.group === g)] as const).filter(([, xs]) => xs.length)
  return (
    <details className="radar-side">
      <summary>不在主线的 {side.length} 家：周期型、困境反转型、资产型与未分类（不排名）</summary>
      <ul className="radar-reasons">
        {groups.map(([g, xs]) => (
          <li key={g}><strong>{SIDE_LABEL[g]} {xs.length} 家</strong>：{g === 'nodata' ? '没有林奇分类或分类所需数据不足，先分类才能决定用哪套检查。' : xs[0].reason}
            {g === 'turnaround' && <> 见<Link to={book(RADAR_BOOK.turnaround)}>第22章</Link>。</>}
          </li>
        ))}
      </ul>
      {watch.length > 0 && (
        <p className="radar-muted">
          选读观察（周期型中当前标为「盈利低位」的公司，按书中周期方法另行研究，不排名、不算雷达信号）：
          {watch.map((w, i) => <React.Fragment key={w.item.c}>{i ? '、' : ''}<Link to={companyHref(w.venue, w.item.c)}>{w.item.n}</Link></React.Fragment>)}。
        </p>
      )}
    </details>
  )
}

export default function Radar(): JSX.Element {
  const [lib, setLib] = useState<PrefillLibrary | null | 'error'>(null)
  const [lynch, setLynch] = useState<Record<string, RadarLynch> | null | 'error'>(null)
  const [cycle, setCycle] = useState<CycleReport | null>(null)
  const [market, setMarket] = useState<MarketFilter>('all')
  const [lane, setLane] = useState<Lane>('value')
  const cand = useCandidates(true)

  useEffect(() => {
    let active = true
    getJson<PrefillLibrary>('dcf-prefill.json').then(body => { if (active) setLib(body?.schemaVersion === 1 ? body : 'error') }).catch(() => active && setLib('error'))
    getJson<Record<string, RadarLynch>>('lynch.json').then(body => { if (active) setLynch(body && typeof body === 'object' ? body : 'error') }).catch(() => active && setLynch('error'))
    getJson<CycleReport>('market-cycle-report.json').then(b => active && setCycle(b)).catch(() => undefined)
    return () => { active = false }
  }, [])

  const result = useMemo(() => (lib && lib !== 'error' && lynch && lynch !== 'error' ? buildRadar(lib.items, buildAutoDcf(lib), lynch) : null), [lib, lynch])
  const byMarket = <T extends { item: PrefillItem }>(xs: T[]) => xs.filter(r => market === 'all' || r.item.m === market)
  const rows = result ? byMarket(result[lane]) : []
  const excluded = result ? byMarket(result.excluded.filter(e => e.group === lane)) : []
  const latest = cycle?.records?.[0]
  const candMarket = (r: RadarRow): CandidateMarket => (r.item.m === 'us' && !r.item.g.includes('研究公司') ? 'ndx' : r.item.m)
  const inPool = (r: RadarRow) => cand.items.some(i => i.market === candMarket(r) && i.code === r.item.c)
  const total = (m: MarketFilter) => (result ? [...result.value, ...result.growth].filter(r => m === 'all' || r.item.m === m).length : 0)
  const failed = lib === 'error' || lynch === 'error'

  return (
    <Page className="radar-page">
      <PageTitle>机会雷达</PageTitle>
      <section className="radar-intro">
        <h2>先分类，再按类型找机会</h2>
        <p>
          按《正念投资》的选股方法：先给公司分类（<Link to={book(RADAR_BOOK.overview)}>第19章</Link>），不同类型用不同的买入检查。
          雷达只跑两条主线：<strong>价值回归</strong>（<Link to={book(RADAR_BOOK.value)}>第20章</Link>）与<strong>快速增长</strong>（<Link to={book(RADAR_BOOK.growth)}>第21章</Link>）；
          巴菲特的<Link to={book(RADAR_BOOK.moat)}>护城河</Link>与<Link to={book(RADAR_BOOK.margin)}>安全边际</Link>只作加减分。周期型、困境反转型、资产型不进主线，放在页尾说明。
        </p>
        <p className="radar-muted">
          范围是沪深300、恒指、恒生科技、纳指100及研究公司。每条检查都写明依据，缺数据就排除并写明原因，不补数。这是研究线索，不是买入建议；能力圈因人而异，书和本站都没有统一的行业清单，雷达不评，请自己判断看不看得懂。
          {lib && lib !== 'error' && ` 预填库更新于 ${lib.generatedAt.slice(0, 10)}；分类与增速来自林奇分类数据（public/data/lynch.json）。`}
        </p>
        {latest && (
          <p className="radar-cycle">
            市场环境（牛熊周期周报 {latest.weekEnding}）：A股 {latest.markets.csi300?.legacyState ?? '—'} · 恒指 {latest.markets.hsi?.legacyState ?? '—'} · 恒生科技 {latest.markets.hstech?.legacyState ?? '—'}。
            {Object.values(latest.markets).some(m => m.legacyState === '趋势防守') ? '处于趋势防守的市场，即使个股便宜也宜分批、留足现金。' : ''}
          </p>
        )}
      </section>

      <div className="ui-cluster radar-filters" role="group" aria-label="市场">
        {(['all', 'cn', 'hk', 'us'] as MarketFilter[]).map(m => (
          <button key={m} type="button" className={market === m ? 'ui-chip is-active' : 'ui-chip'} aria-pressed={market === m} onClick={() => setMarket(m)}>
            {m === 'all' ? '全部' : MARKET_NAME[m]} <span className="ui-chip__count">{total(m)}</span>
          </button>
        ))}
      </div>

      {(lib === null || lynch === null) && !failed && <p role="status">正在加载预填库与分类数据…</p>}
      {failed && <p role="alert">预填库或分类数据暂时无法加载，请稍后再试。</p>}

      {result && (
        <>
          <div className="ui-cluster radar-lanes" role="group" aria-label="主线">
            {(['value', 'growth'] as Lane[]).map(l => (
              <button key={l} type="button" className={lane === l ? 'ui-chip is-active' : 'ui-chip'} aria-pressed={lane === l} onClick={() => setLane(l)}>
                {LANE[l].title} <span className="ui-chip__count">{byMarket(result[l]).length}</span>
              </button>
            ))}
          </div>

          <section className="radar-tier" aria-labelledby="radar-lane-title">
            <h3 id="radar-lane-title">{LANE[lane].title} <span className="radar-count">{rows.length} 家</span></h3>
            <p className="radar-muted">
              {LANE[lane].intro} 依据见<Link to={book(LANE[lane].chapter)}>{LANE[lane].chapterLabel}</Link>。
              得分 = 计分项 + 护城河迹象（宽 +{RADAR_RULES.moatBonus.wide} / 窄 +{RADAR_RULES.moatBonus.narrow}）+ 财务稳健（通过 +{RADAR_RULES.healthBonus} / 未通过 {RADAR_RULES.healthPenalty}）；同分先看数据可信度，再看价格余量。
            </p>
            {rows.length === 0 ? <p>当前没有符合条件的公司。</p> : <LaneTable lane={lane} rows={rows} inPool={inPool} toggle={r => cand.toggle(candMarket(r), r.item.c)} />}
            {excluded.length > 0 && (
              <details className="radar-side">
                <summary>属于这条主线、但没通过必要条件的 {excluded.length} 家及原因</summary>
                <ExcludedList list={excluded} />
              </details>
            )}
          </section>

          <SideNote side={byMarket(result.side)} watch={byMarket(result.cyclicalWatch)} />
        </>
      )}

      <details className="radar-side">
        <summary>和旧版雷达有什么不同（规则第 {RADAR_VERSION} 版，2026-11）</summary>
        <p className="radar-muted">
          旧版只看“现价低于 DCF 买入参考价”，再按比自身历史、比同行便宜加分。2026-11-14 的实际结果里，88 家命中中周期型 22 家、快速增长型只有 4 家，排在最前的两家都是周期股：
          用景气年份的现金流外推，正是书中中国石油案例（<Link to={book(RADAR_BOOK.value)}>20.8</Link>）说的周期顶点陷阱；而再投资期自由现金流低的成长公司又被整体筛掉。
          新版先分类：周期型与困境反转型移出主线；价值回归加了正常盈利检查，DCF 只在这条线上用；快速增长另设增速持续、增长桥接与 PE 压力条件。
          “比同行便宜”不再计分（书中没有用同行自由现金流收益率作为买入依据）。信号台账从第 2 版起记下规则版本，复盘不把两版混在一起。
        </p>
      </details>

      <p className="radar-muted radar-foot">
        规则：自动 DCF 采用近 3 年平均自由现金流、营收增速（上限 15%）、CAPM 折现率与三阶段模型，买入参考价按可信度在合理价上留 20%（高）/ 30%（中）安全边际；
        “比自己过去便宜”指自由现金流收益率高于近 5 年 {RADAR_RULES.historyPct}% 以上的月份（财报按约 4 个月后公开对齐）。
        快速增长门槛与站内林奇分类一致：有效增速（近一年与两年年化取低）≥{RADAR_RULES.fastGrowth}%、营收增速 ≥{RADAR_RULES.fastRevenue}%；增速超过 {RADAR_RULES.extrapolateCap}% 按 {RADAR_RULES.extrapolateCap}% 计算价格条件，超过 {RADAR_RULES.lowBase}% 标为低基数待核。
        PE 与增速口径不一定同期：PE 为行情日期，多数增速沿用原研究、核验日期缺失，已在每行注明；增速按新财报重算过的公司在同分时排前。金融业不进快速增长线，也没有自动 DCF。
      </p>

      <SignalReview />
    </Page>
  )
}
