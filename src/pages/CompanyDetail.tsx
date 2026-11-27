import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink, CheckCircle2, AlertTriangle, ArrowRight, CalendarClock } from 'lucide-react'
import { useCompanies, useLynch, lynchFor, Market } from '../data/companies'
import { usePageSeo } from '../components/RouteSeo'
import ResearchNotice from '../components/research/ResearchNotice'
import CompanyDetailHeader from '../components/research/CompanyDetailHeader'
import { pickScenarioTriple, researchSourceLabel, resolveHeaderScenarioBundle, scenarioModelConflict } from '../components/research/scenarioPrices'
import { collectTocItems, CompanyDetailToc, type TocItem } from '../components/research/CompanyDetailToc'
import { toneOf } from '../data/notionNotes'
import { CN_REPORT } from '../data/cnReassessment'
import { SP500_REPORT } from '../data/sp500Reassessment'
import { useCandidates } from '../features/candidates/useCandidates'
import { latestDecision } from '../features/candidates/store'
import { useToolSources } from '../features/candidates/useToolSources'
import { companySignals } from '../features/signals/companySignals'
import { ownStage, researchStage } from '../features/signals/maturity'
import { dcfOf, toolProgress } from '../features/candidates/links'
import SignalSummary from '../components/SignalSummary'
import { localDay } from '../components/DecisionDialog'
import { priceAnchorAge } from '../features/dcf/priceAnchor'
import { buildDcfLink, dcfMarketOf } from '../features/dcf'
import QuickDcf from '../components/QuickDcf'
import { CompanyValuationDetail } from '../features/company-valuation/CompanyValuation'
import { displayMissing } from '../utils/format'
import { scrubMissing } from '../utils/scrubMissing'
import { Badge, Card, EmptyState, Page, Stat, StatGrid, TableWrap } from '../components/ui'
import CompanyChartSection from '../features/company-chart/CompanyChartSection'
import { useEarningsCalendar } from '../features/earnings/loadCalendar'
import { TIME_LABEL } from '../features/earnings/model'
import { nextCompanyEvent } from '../features/earnings/nextCompanyEvent'
import '../styles/research.css'
import '../styles/company-detail.css'

const MARKETS: readonly Market[] = ['us', 'cn', 'hk', 'adr', 'ndx']
const isMarket = (m: string | undefined): m is Market => !!m && (MARKETS as readonly string[]).includes(m)

const confirmedText = (c: boolean | null): string => (c === true ? '已确认' : c === false ? '预估' : '确认未知')

export default function CompanyDetail(): JSX.Element {
  const { market, code } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { hash } = location
  // 未知市场不回退美股；Router 已解码 code，不再 decodeURIComponent（`%25` 会解出 `%` 并抛 URIError）
  const validMarket = isMarket(market)
  const mk: Market = validMarket ? market : 'us'
  const { list, loading, failed, partial, retry } = useCompanies(mk, validMarket)
  const { data: lynchAll, loading: lynchLoading, failed: lynchFailed } = useLynch()
  const company = validMarket && code ? list.find(c => c.code === code) : undefined
  // 部分数据下切换公司（同一路由组件不会重新挂载）时自动重试一次，恢复后同一 SPA 可找回
  const prevCode = useRef(code)
  useEffect(() => {
    if (prevCode.current === code) return
    prevCode.current = code
    if (validMarket && partial) retry()
  }, [code, validMarket, partial, retry])
  const cand = useCandidates(true)
  const tools = useToolSources()
  // 财报前瞻：模块级缓存，公司之间切换不重复请求；读不到就不显示徽章
  const { cal: earningsCal } = useEarningsCalendar()
  usePageSeo(company ? `${company.name}（${company.code}）研究笔记` : undefined, company ? `${company.name}（${company.code}）：${company.headline}`.slice(0, 160) : undefined)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [market, code])
  useEffect(() => {
    if (hash === '#company-valuation' && company) document.getElementById('company-valuation')?.scrollIntoView?.()
  }, [hash, company])
  const mainRef = useRef<HTMLDivElement>(null)
  const [tocItems, setTocItems] = useState<TocItem[]>([])
  useLayoutEffect(() => {
    setTocItems(collectTocItems(mainRef.current))
  }, [company?.code, company?.market, loading])

  const row = (text: string, accent: string, key: number, warn = false): JSX.Element => (
    <div key={key} className="rn-check">
      {warn ? <AlertTriangle size={16} color={accent} aria-hidden="true" /> : <CheckCircle2 size={16} color={accent} aria-hidden="true" />}
      <span>{displayMissing(text)}</span>
    </div>
  )

  const DataTable = ({ label, heads, rows }: { label: string; heads?: string[]; rows: React.ReactNode[][] }): JSX.Element => (
    <TableWrap label={label}>
      <table className="ui-table rn-table rn-table--top">
        {heads && <thead><tr>{heads.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>}
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{scrubMissing(c)}</td>)}</tr>)}</tbody>
      </table>
    </TableWrap>
  )

  const fromList = typeof (location.state as { from?: unknown } | null)?.from === 'string'
    && (location.state as { from: string }).from.startsWith('/research-notes')
    ? (location.state as { from: string }).from
    : null
  const backTo = fromList ?? `/research-notes?tab=companies&m=${mk}`
  const back = (
    <Link
      to={backTo}
      onClick={e => {
        // 从列表进来：优先 history 返回（保留滚动）；否则落到带原筛选的列表 URL
        if (fromList && window.history.state && window.history.state.idx > 0) {
          e.preventDefault()
          navigate(-1)
        }
      }}
      className="rn-back"
    >
      <ArrowLeft size={14} aria-hidden="true" /> 返回公司研究
    </Link>
  )

  if (!company) {
    const state = !validMarket ? 'invalid' : loading ? 'loading' : failed ? 'failed' : partial ? 'partial' : 'missing'
    const title = { invalid: '无效的公司地址', loading: '正在加载…', failed: '公司数据加载失败', partial: '部分公司数据暂不可用', missing: '未找到该公司' }[state]
    return (
      <Page variant="reading" title={state === 'invalid' || state === 'missing' ? title : '公司研究'}>
        {back}
        <EmptyState
          title={title}
          action={state === 'partial' || state === 'failed'
            ? <button type="button" className="tool-btn tool-btn--primary" onClick={retry}>重试</button>
            : undefined}
        >
          {state === 'invalid' ? `市场「${market ?? ''}」不在公司库中（可用：标普500 us、沪深 cn、港股 hk、美股非标普 adr、纳指100 ndx）。`
            : state === 'loading' ? '正在读取补全公司数据。'
            : state === 'failed' ? '网络中断或页面已更新，可重试；仍失败请刷新页面。'
            : state === 'partial' ? '程序化补全的公司数据这次没有取到，手工研究页仍可打开。这家公司可能在暂未加载的数据里，不代表公司库中没有它；请稍后重试。'
            : '该公司还没有整理进公司库。'}
        </EmptyState>
      </Page>
    )
  }

  const tone = toneOf(company.rating)
  const earningsNext = nextCompanyEvent(earningsCal, company.market, company.code)

  // ── 按“最终返回标准”整理：三情景表、买入纪律、完整度 ──
  const nums = (t: string): number[] => (t.match(/[\d,]+(?:\.\d+)?/g) || []).map(x => Number(x.replace(/,/g, ''))).filter(n => !Number.isNaN(n))
  // 存档仍显示在指标表，但不能自动回填已经撤回的情景与纪律。
  const activeMetrics = company.metrics.filter(([label]) => !label.startsWith('上轮'))
  const metric = (re: RegExp): string | undefined => activeMetrics.find(([l]) => re.test(l))?.[1]
  const priceText = metric(/价格锚点|收盘价|现价|9\/18 收盘/)
  const price = company.marketRefresh?.tradability === 'unverified' ? undefined : company.marketRefresh?.price ?? (priceText ? nums(priceText)[0] : undefined)
  const priceAge = priceAnchorAge(company.marketRefresh?.priceDate || priceText)
  const quoteCurrency = company.marketRefresh?.currency
  const dcfPrice = quoteCurrency && quoteCurrency !== dcfMarketOf(mk).currency ? undefined : price
  const scenText = metric(/Bear \/ Base \/ Bull/)
  const scenNums = scenText && !/市值/.test(scenText) ? nums(scenText) : []
  const scenRows: [string, string, string, string][] | null = scenNums.length === 3
    ? (['悲观', '基准', '乐观'] as const).map((n, i) => {
        const v = scenNums[i]
        const pct = price && v > price * 0.1 && v < price * 10 ? `${v >= price ? '+' : ''}${((v / price - 1) * 100).toFixed(1)}%` : '—'
        const trigger = n === '悲观' ? '盈利下修或估值压缩' : n === '基准' ? '正常兑现路径' : '增长/利润率超预期'
        return [n, v.toLocaleString(), pct, trigger] as [string, string, string, string]
      })
    : null
  const pool = [...company.next, ...company.thesis, ...company.risk, ...activeMetrics.map(([l, v]) => `${l}：${v}`)]
  const pick = (re: RegExp): string | undefined => pool.find(t => re.test(t))
  const dz = company.discipline
  const discipline: [string, string | undefined][] = [
    ['条件价格（研究假设）', dz?.zone || pick(/买入区|买入观察|观察买入|买入区间|首次关注|重仓区|核心买入/)],
    ['加仓条件（研究假设）', dz?.add || pick(/确认加仓|加仓|突破|确认.{0,6}(后|才)/)],
    ['减仓 / 止盈', dz?.trim || pick(/减仓|止盈|兑现|卖出区|首减/)],
    ['失效条件', dz?.invalid || company.risk.find(t => /证伪|失效|跌破|连续|低于|恶化/.test(t)) || company.risk[0]],
    ['仓位原则', dz?.position || pick(/仓位|建议仓位|不超过|上限/)],
  ]
  // 缺项时按研究标准补默认条款，并明确标注（不冒充公司专属结论）
  const bullPrice = company.scenarios?.find(x => x.name === '乐观' || x.name === '牛市')?.price || (scenRows ? `${scenRows[2][1]}` : undefined)
  const std = '（按研究标准默认条款）'
  if (!discipline[2][1]) discipline[2][1] = `${bullPrice ? `接近乐观情景价 ${bullPrice}，` : ''}或盈利预期不再改善、赔率变差时分批处理${std}`
  if (!discipline[4][1] && /观察|回避|暂不|等待|不追|谨慎/.test(company.rating)) discipline[4][1] = `赔率未达约 2:1，按研究标准只放观察名单，不建仓${std}`
  const disciplineFilled = discipline.filter(d => d[1]).length
  const completeness: [string, boolean][] = [
    ['公司简介', !!company.profile],
    ['业务分布', !!company.segments],
    ['优缺点', !!company.pros && !!company.cons],
    ['行业趋势', !!company.industry],
    ['结论卡', !!company.rating && !!company.headline],
    ['关键指标', company.metrics.length > 0],
    ['增长与护城河', company.thesis.length > 0 && (!!company.moat || company.thesis.length >= 3)],
    ['三情景表', !!scenRows || !!company.scenarios],
    ['买入纪律', disciplineFilled >= 3],
    ['风险与证伪', company.risk.length > 0],
    ['多空交锋', !!company.bullBear],
    ['口径说明', !!company.asOf],
    ['验证日历', company.next.length > 0 || !!company.calendar],
  ]
  const done = completeness.filter(c => c[1]).length
  const candItem = cand.items.find(i => i.market === company.market && i.code === company.code)
  const lastDecision = candItem && latestDecision(candItem)
  const lynchInfo = lynchFor(lynchAll, company)
  const lynchStatus = lynchLoading ? 'loading' : lynchFailed ? 'failed' : 'ready'
  const dcfSummary = dcfOf(company.market, company.code, tools)
  const signals = companySignals({
    rating: company.rating,
    price,
    priceDate: priceAge?.date,
    priceStale: priceAge?.stale,
    scenarios: company.scenarios ?? scenRows?.map(([name, value]) => ({ name, price: value })),
    dcf: dcfSummary,
    lynch: lynchInfo && { type: lynchInfo.t, attention: lynchInfo.r, moat: lynchInfo.m ? `护城河财务证据 ${lynchInfo.m.s}/${lynchInfo.m.n} 项通过` : undefined },
    lynchStatus,
    decision: lastDecision && { action: lastDecision.action, nextCheck: lastDecision.nextCheck, count: candItem?.decisions?.length ?? 0 },
    today: localDay(),
  })
  const pending = (label: string): JSX.Element => (
    <span className="rn-pending">待补充{label}（可在 Notion 原页查看）</span>
  )

  // 原研究情景的日期：行情刷新会把 asOf 改写成「行情 …；原研究：…」，原研究日期取 originalAsOf；
  // 两者都没有日期时保持缺失，不用行情日期冒充
  const dateOf = (v?: string): string | undefined => v?.match(/\d{4}-\d{2}-\d{2}/)?.[0]
  const scenarioAsOf = dateOf(company.marketRefresh?.originalAsOf)
    || (company.asOf?.startsWith('行情 ') ? undefined : dateOf(company.asOf))
  const researchLabel = researchSourceLabel(scenarioAsOf)
  const researchScenarios = company.scenarios ?? scenRows?.map(([name, value]) => ({ name, price: value }))
  // 头部可能用综合估值，信号表 / K 线 / 研究价位刻度用原研究情景：两套方向相反时进「信号分歧」
  const headerBundle = resolveHeaderScenarioBundle({
    valuation: company.valuation,
    marketRefresh: company.marketRefresh,
    price,
    currency: quoteCurrency || company.marketRefresh?.currency,
    scenarios: company.scenarios,
    scenRows,
    researchAsOf: scenarioAsOf,
  })
  const modelConflict = scenarioModelConflict({
    bundle: headerBundle,
    research: pickScenarioTriple(company.scenarios, scenRows, quoteCurrency || company.marketRefresh?.currency),
    researchPrice: price,
    researchLabel,
  })

  return scrubMissing(
    <Page variant="reading" className="rn-page cd-page">
      <CompanyDetailHeader
        market={company.market}
        name={company.name}
        code={company.code}
        sector={company.sector}
        batch={company.batch}
        region={company.region}
        theme={company.theme}
        rating={company.rating}
        ratingTone={tone}
        price={price}
        currency={quoteCurrency || company.marketRefresh?.currency}
        scenarios={company.scenarios}
        scenRows={scenRows}
        valuation={company.valuation}
        marketRefresh={company.marketRefresh}
        isCandidate={!!candItem}
        onToggleCandidate={() => cand.toggle(company.market, company.code)}
        candidateLink={cand.localError
          ? <span className="cd-actions__primary"><span role="alert" className="rn-warn-text">{cand.localError}</span><button type="button" className="tool-btn" onClick={cand.retryLocal}>重试本机保存</button></span>
          : lastDecision
            ? <span className="cd-actions__primary"><Link to="/candidates" className="rn-cand">✓ 已候选 · 决策记录 {candItem?.decisions?.length} 条 · 下次检查 {lastDecision.nextCheck}</Link></span>
            : undefined}
        valuationHref={`/valuation?market=${mk === 'adr' || mk === 'ndx' ? 'us' : mk}&code=${encodeURIComponent(company.code)}`}
        dcfHref={buildDcfLink({ company: company.name, code: company.code, researchMarket: mk, price: dcfPrice, priceDate: priceAge?.date })}
        notesHref={`/research-notes/company/${mk}/${encodeURIComponent(company.code)}/notes`}
        back={back}
        metaDates={{
          priceDate: company.marketRefresh?.priceDate || priceAge?.date,
          checkedAt: company.marketRefresh?.checkedAt,
          scenarioAsOf,
          researchAsOf: scenarioAsOf,
          priceAgeDays: priceAge?.days,
          priceAgeStale: priceAge?.stale,
        }}
        earningsBadge={earningsNext ? (
          <Link to="/earnings" className="rn-earnings-badge" title={`日期来源：${earningsCal?.sources[earningsNext.dateSource]?.label ?? earningsNext.dateSource}`}>
            <CalendarClock size={14} aria-hidden="true" />
            {earningsNext.dateSource === 'hkex' ? '业绩董事会会议' : '财报日程'} {earningsNext.date}{earningsNext.time !== 'unknown' ? ` ${TIME_LABEL[earningsNext.time]}` : ''}（{confirmedText(earningsNext.confirmed)}）
            {earningsNext.asOf && ` · ${earningsNext.carried ? '沿用' : '数据截至'} ${earningsNext.asOf.slice(0, 10)}`}
          </Link>
        ) : undefined}
      />
      {cand.message && <p role="alert" className="rn-warn-text">{cand.message}</p>}

      <div className="cd-layout">
        <CompanyDetailToc items={tocItems} root={mainRef.current} />
        <div className="cd-main" ref={mainRef}>
          <div id="cd-signals" data-cd-title="决策信号汇总">
            <SignalSummary summary={signals} sources={{ rating: `评级依据：${researchLabel}`, scenario: researchLabel }} extraConflicts={modelConflict ? [modelConflict] : undefined} stage={researchStage(company)} own={ownStage(!!lastDecision, (() => { const p = toolProgress(company.market, company.code, tools); return !!(p.dcf || p.valuation) })())} />
          </div>
          <CompanyChartSection
            market={company.market}
            code={company.code}
            name={company.name}
            priceDate={company.marketRefresh?.priceDate}
            scenariosHref="#company-scenarios"
            levels={{
              market: company.market,
              anchor: { price, date: priceAge?.date, days: priceAge?.days, stale: priceAge?.stale, currency: company.marketRefresh?.currency },
              scenarios: researchScenarios,
              scenarioSource: researchLabel,
              dcf: dcfSummary,
            }}
          />
          <ResearchNotice />
          <CompanyValuationDetail company={company} />
          <div id="cd-quick-dcf" data-cd-title="快速 DCF（简版）">
            <QuickDcf market={company.market} code={company.code} name={company.name} price={dcfPrice} priceDate={priceAge?.date} />
          </div>
          {(company.market === 'us' || company.market === 'cn' || company.market === 'hk' || company.market === 'adr') && (company.researchReport || company.metrics.some(([key]) => key === '圆桌复核日期')) && (
            <Card id="cd-research-report" title={company.researchReport ? '公司研究 · 本轮事实复核与估值初稿' : '腾讯自选股投研专家团 · 本轮公告复核'}>
              <p className="rn-text">{(company.market === 'hk' || company.market === 'adr') && company.researchReport ? '已逐家核读公司业绩原件并补充新行情，报告列明来源、旧结论修正及待补证据。部分公司有数值敏感性草案；两种独立估值、现金与股本桥接仍待补，旧评级和价位不作为当前结论。' : company.researchReport ? '已按公司核对财报与现金流，完整报告列明来源、旧结论调整及待补证据。估值假设尚未认证；林奇分类仍为此前的程序化筛选结果。' : '本轮已补充公司公告；证据分为公告原件、公告转载及待核实；旧情景价值的认证状态以本轮结论为准。“上轮”指标保留历史口径，林奇分类仍为此前的程序化筛选结果。'}</p>
              <a href={`${import.meta.env.BASE_URL}${company.researchReport ?? (company.market === 'cn' ? CN_REPORT : SP500_REPORT)}`} target="_blank" rel="noreferrer" className="rn-link">查看本轮完整报告与一手来源</a>
            </Card>
          )}
          {(() => {
            const ly = lynchFor(lynchAll, company)
            if ((company.market === 'hk' || company.market === 'adr') && company.researchReport) return null
            if (!ly) {
              const detail = lynchStatus === 'loading' ? '分类数据加载中…'
                : lynchStatus === 'failed' ? '分类数据加载失败，请稍后刷新重试。'
                : '该公司未覆盖林奇分类。'
              return <Card id="cd-lynch" title="林奇分类"><p className="rn-text" role="status">{detail}</p></Card>
            }
            const cls = ly.r === '高' ? 'rn-card--good' : ly.r === '中' ? 'rn-card--lead' : undefined
            return (
              <Card id="cd-lynch" className={cls} title={<>林奇分类：{ly.t}（同类关注度 {ly.r}）{ly.m ? ` · ${ly.m.l}` : ''}</>}>
                <p className="rn-text">{displayMissing([...ly.w, ly.v].filter(Boolean).join('；'))}</p>
                <p className="rn-footnote rn-footnote--top">
                  {ly.pe ? `PE ${ly.pe}×` : 'PE 不适用'}{ly.g !== null && ly.g !== undefined ? ` · 利润近一年 ${ly.g > 0 ? '+' : ''}${ly.g}%` : ''}{ly.c !== null && ly.c !== undefined ? `（两年年化 ${ly.c > 0 ? '+' : ''}${ly.c}%）` : ''}{ly.peg ? ` · PEG ${ly.peg}` : ''}{ly.ph ? ` · 周期位置：${ly.ph}` : ''}{ly.dy !== null && ly.dy !== undefined ? ` · 股息率 ${ly.dy}%` : ''}
                </p>
                {ly.f.map(x => <p key={x} className="rn-warn-text">⚠ {x}</p>)}
                {ly.m && (
                  <>
                    <TableWrap label="护城河财务证据" className="rn-gap">
                      <table className="ui-table rn-table rn-moat">
                        <tbody>
                          {ly.m.i.map(([name, ok, note]) => (
                            <tr key={name}>
                              <td>{name}</td>
                              <td>{ok === null ? '—' : ok ? '✓' : '✗'}</td>
                              <td>{note}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </TableWrap>
                    <p className="rn-footnote">护城河只看财务证据（{ly.m.s}/{ly.m.n} 项通过）：它检验品牌、网络效应、转换成本等通常留下的痕迹，不能证明护城河本身；无 FCF/股息（A 股、美股）。规则见「研究笔记 → 分类数据 → 林奇分组」。</p>
                  </>
                )}
              </Card>
            )
          })()}
          {company.auto && (
            <Card id="cd-auto" className="rn-card--warn" title={company.reviewed ? '程序化研究页（已人工复核）' : '程序化研究页'}>
              <p className="rn-text">{company.metrics.some(([key]) => key === '圆桌复核日期') ? '本页源自程序化补全；本轮圆桌已另行核实公告并更正结论，旧模型已暂停认证。旧数值存档不等于逐项一手财务验证，分部占比、正常化估值与完整现金流仍需补齐。' : <>本页的财务数值、估值、三情景与买入区由脚本按统一规则计算（规则见「研究笔记 → 研究标准」），业务描述与行业判断为简述；{company.reviewed ? '已用最新半年报/指引人工复核评级与关键风险（见指标表「人工复核」行），但情景数值仍是脚本结果；' : ''}不含公司特有催化与风险，一手公告、分部占比、一致预期、自由现金流均未取到。结论用于筛选与排序，深度判断需回到公司公告。</>}</p>
            </Card>
          )}
          <Card id="cd-profile" title="公司简介与业务分布">
            {company.profile ? <p className="rn-text">{displayMissing(company.profile)}</p> : <p className="rn-text">{pending('公司简介')}</p>}
            {company.segments
              ? <DataTable label="业务分布" heads={['业务 / 分部', '占比', '说明']} rows={company.segments.map(r => [r.name, <span className="rn-nowrap">{r.share || '—'}</span>, r.note || ''])} />
              : pending('业务分布')}
          </Card>

          <Card id="cd-proscons" title="优势与缺点">
            {company.pros || company.cons ? (
              <>
                <p className="rn-eyebrow">优势</p>
                {(company.pros || []).map((t, i) => row(t, 'var(--down)', i))}
                <p className="rn-eyebrow rn-gap">缺点</p>
                {(company.cons || []).map((t, i) => row(t, 'var(--up)', i, true))}
              </>
            ) : pending('优缺点')}
          </Card>

          <Card id="cd-industry" title="行业趋势">
            {company.industry ? company.industry.map((t, i) => row(t, 'var(--accent)', i)) : pending('行业趋势')}
            {company.industry && <p className="rn-footnote">行业趋势含研究者判断，需随最新数据更新。</p>}
          </Card>

          <Card id="cd-headline" className="rn-card--lead" title="一句话结论" label="一句话结论">
            <p className="rn-lead">{displayMissing(company.headline)}</p>
            {(company.certainty || company.duration || company.ratioNote) && (
              <div className="rn-facts">
                {company.certainty && <div><strong className="rn-strong">确定性：</strong>{company.certainty}</div>}
                {company.duration && <div><strong className="rn-strong">增长可持续期限：</strong>{company.duration}</div>}
                {company.ratioNote && <div><strong className="rn-strong">盈亏比：</strong>{displayMissing(company.ratioNote)}</div>}
              </div>
            )}
            <div className="rn-badges" aria-label={`最终返回标准完整度 ${done}/${completeness.length}`}>
              <span className="rn-inline-label">最终返回标准完整度 {done}/{completeness.length}</span>
              {completeness.map(([n, ok]) => (
                <span key={n} className={ok ? 'rn-pill is-done' : 'rn-pill'}>{ok ? '✓' : '○'} {n}</span>
              ))}
            </div>
          </Card>

          {company.metrics.length > 0 && (
            <section id="cd-metrics" className="rn-card" aria-label="关键指标" data-cd-title="关键指标">
              <p className="rn-eyebrow">关键指标</p>
              <StatGrid className="rn-stat-grid rn-stat-grid--metrics">
                {company.metrics.map(([label, value]) => <Stat key={label} label={label} value={displayMissing(value)} />)}
              </StatGrid>
            </section>
          )}

          <Card id="cd-thesis" title="增长与护城河 / 核心逻辑">
            {company.thesis.length > 0 ? company.thesis.map((t, i) => row(t, 'var(--down)', i)) : pending('')}
            {company.growth && (
              <>
                <p className="rn-eyebrow rn-gap">增长来源与持续性</p>
                {company.growth.map((t, i) => row(t, 'var(--accent)', i))}
              </>
            )}
            {company.moat && (
              <>
                <p className="rn-eyebrow rn-gap">护城河</p>
                {company.moat.map((t, i) => row(t, 'var(--system-teal)', i))}
              </>
            )}
          </Card>

          <Card title="三情景估值" id="company-scenarios">
            {company.scenarios ? (
              <DataTable label="三情景估值" heads={['情景（概率）', '盈利与倍数假设', '隐含价', '相对现价', '触发 / 证伪']}
                rows={company.scenarios.map(r => [
                  <span className="rn-nowrap">{r.name}{r.prob ? `（${r.prob}）` : ''}</span>,
                  <span className="rn-cell-wide">{r.assumption}{r.multiple ? `；倍数 ${r.multiple}` : ''}</span>,
                  <strong className="rn-strong rn-nowrap">{r.price}</strong>,
                  <span className="rn-nowrap">{r.change}</span>,
                  <span className="rn-small-metrics">{r.trigger}</span>,
                ])} />
            ) : scenRows ? (
              <DataTable label="三情景估值" heads={['情景', '隐含价', '相对价格锚点', '触发 / 证伪方向']} rows={scenRows} />
            ) : (
              scenText ? <p className="rn-text">{displayMissing(scenText)}</p> : pending('三情景估值表')
            )}
            <p className="rn-footnote">情景价 = 正常化 EPS × 合理倍数，为研究假设，不是目标价；概率与期望收益如有，也不是历史回测胜率。</p>
          </Card>

          <Card id="cd-discipline" title="结论与买入纪律">
            <DataTable label="买入纪律" rows={discipline.map(([label, text]) => [<span className="rn-nowrap">{label}</span>, text || pending('')])} />
            <p className="rn-footnote">价位均为条件化研究区间，不是交易指令；未列出的项按“最终返回标准”尚待补充。</p>
          </Card>

          <Card id="cd-risk" title="风险与证伪">
            {company.risk.length > 0 ? company.risk.map((t, i) => row(t, 'var(--accent-warm)', i, true)) : pending('')}
          </Card>

          <Card id="cd-bullbear" title="多空交锋">
            {company.bullBear ? (
              <>
                <div className="rn-bullbear">
                  <Badge tone="down">多头最强论点</Badge>
                  <p>{displayMissing(company.bullBear.bull)}</p>
                </div>
                <div className="rn-bullbear">
                  <Badge tone="up">空头最强论点</Badge>
                  <p>{displayMissing(company.bullBear.bear)}</p>
                </div>
                <div className="rn-bullbear">
                  <Badge tone="accent">裁决</Badge>
                  <p>{displayMissing(company.bullBear.verdict)}</p>
                </div>
                <p className="rn-footnote">整理自研究页内容，不是独立的多空对抗检验。</p>
              </>
            ) : pending('（本页未做多空对抗检验）')}
          </Card>

          <Card id="cd-next" title="后续验证 / 操作参考">
            {(company.next.length > 0 || company.calendar) ? [...company.next, ...(company.calendar || [])].map((t, i) => (
              <div key={i} className="rn-check">
                <ArrowRight size={16} color="var(--accent)" aria-hidden="true" />
                <span>{displayMissing(t)}</span>
              </div>
            )) : pending('')}
          </Card>

          {(company.pitfalls || company.aiNote) && (
            <Card id="cd-pitfalls" title="口径与陷阱">
              {(company.pitfalls || []).map((t, i) => row(t, 'var(--accent-warm)', i, true))}
              {company.aiNote && row(`AI 的位置：${company.aiNote}`, 'var(--accent)', 99)}
            </Card>
          )}

          <Card id="cd-asof" title="数据口径">
            <p className="rn-text">{displayMissing(company.asOf)}</p>
            {company.url && (
              <a href={company.url} target="_blank" rel="noreferrer" className="rn-back">
                <ExternalLink size={14} aria-hidden="true" /> 在 Notion 查看完整研究页
              </a>
            )}
          </Card>

          <p className="rn-disclaimer">
            内容整理自 Notion 个人研究笔记，仅为研究记录，不构成投资建议。情景价值与价位为研究假设，非目标价。
          </p>
        </div>
      </div>
    </Page>
  ) as JSX.Element
}
