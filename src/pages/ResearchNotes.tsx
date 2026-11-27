import React, { useState, useEffect } from 'react'
import { Link, Navigate, useNavigationType, useSearchParams } from 'react-router-dom'
import { PageTabs, PageTitle, Segmented } from '../components/ui/PageTabs'
import {
  Compass,
  Layers,
  Grid3x3,
  Star,
  Crosshair,
  CheckCircle2,
  AlertTriangle,
  CalendarClock,
  SlidersHorizontal,
  Info,
  ChevronDown,
} from 'lucide-react'
import {
  NOTION_SYNC_DATE,
  portfolioV6,
  philosophy,
  sp500Sectors,
  sp500Note,
  cnChains,
  chemRanking,
  newMaterialRanking,
  healthProgress,
  compositeRank,
  tradeWatch,
  tradeEvents,
  hkWatchTargets,
  toneOf,
  Tone
} from '../data/notionNotes'
import { useCompanies, useLynch, lynchFor, sectorsOf, Market, Company, LynchInfo } from '../data/companies'
import { ratingBucket } from '../features/signals/companySignals'
import { RESEARCH_STAGE, researchStage, type ResearchStage } from '../features/signals/maturity'
import CompanyCombined from '../components/CompanyCombined'
import CandidateButton from '../components/CandidateButton'
import { DcfCell, DcfFilterChips } from '../components/DcfCell'
import { useToolSources } from '../features/candidates/useToolSources'
import { dcfOf } from '../features/candidates/links'
import { DCF_FILTERS, matchDcfFilter, type DcfFilterId } from '../features/dcf/filter'
import { CompanyValuationCell, CompanyValuationFilterChips } from '../features/company-valuation/CompanyValuation'
import { matchValuationFilter, VALUATION_FILTERS, type ValuationFilter } from '../features/company-valuation/model'
import { useCandidates } from '../features/candidates/useCandidates'
import ResearchNotice from '../components/research/ResearchNotice'
import ResearchMethod from '../features/research-method/ResearchMethod'
import { NDX_CODES, NDX_ASOF } from '../data/ndx100'
import { Callout, Page, PageDataFreshness, Stat, TableWrap } from '../components/ui'
import '../styles/research.css'

type TabId = 'companies' | 'pool' | 'watch' | 'method' | 'notes'

// 顺序按使用频率：先查公司，方法和配套笔记放后面，存档垫底。候选池已独立成 /candidates 页
const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'companies', label: '公司库', icon: Grid3x3 },
  { id: 'method', label: '研究方法', icon: Compass },
  { id: 'notes', label: '配置笔记', icon: Layers },
  // 历史买卖价位与“潜力标的”和书的“不荐股”相悖，只留存档，放最后
  { id: 'watch', label: '历史价位（存档）', icon: Crosshair },
]

const markets: [Market, string][] = [['us', '标普500'], ['ndx', '纳指100'], ['adr', '美股非标普'], ['hk', '港股'], ['cn', '沪深']]

const marketLabel = (m: Market): string => (m === 'us' ? '标普500' : m === 'hk' ? '港股' : m === 'adr' ? '美股非标普' : m === 'ndx' ? '纳指100' : '沪深')

// 旧链接（?tab=category&m=watch 等）映射到新页签，收藏和公司页的返回链接继续可用
function resolveTab(tab: string | null, m: string | null): TabId {
  if (tab === 'category') return m === 'watch' ? 'watch' : m === 'pool' ? 'pool' : 'companies'
  if (tab === 'pool') return 'pool'
  if (tab === 'standard') return 'method'
  if (tab === 'philosophy' || tab === 'strategy') return 'notes'
  return tabs.some(t => t.id === tab) ? (tab as TabId) : 'companies'
}

// 研究评级的语气 → 共享标签色：好=绿、条件=中性、注意=暖橙、回避=红
const BADGE_TONE: Record<Tone, string> = { green: 'accent', blue: 'neutral', orange: 'warm', red: 'up', gray: 'muted' }
const badge = (tone: Tone, extra = ''): string => `ui-badge ui-badge--${BADGE_TONE[tone]}${extra ? ` ${extra}` : ''}`

const RATING_FILTERS = ['全部', '优先关注', '条件关注', '观察', '回避', '未估值'] as const
const LYNCH_TYPES = ['快速增长型', '稳健型', '缓慢增长型', '周期型', '困境反转型', '资产型', '数据不足'] as const
const LYNCH_TIERS = ['高', '中', '低', '待定'] as const
const LYNCH_MOATS = ['全部', '宽', '窄'] as const
const STAGE_FILTERS = ['全部', 'verified', 'draft', 'screen'] as const
const FILTER_KEYS = ['q', 'rating', 'stage', 'lt', 'lm', 'ly', 'vf', 'dcf', 'sec', 'grp'] as const

const pickOne = <T extends string>(raw: string | null, allowed: readonly T[], fallback: T): T =>
  (allowed as readonly string[]).includes(raw ?? '') ? (raw as T) : fallback

/** 列表条件指纹：滚动恢复只在条件相同时生效 */
const listKeyOf = (sp: URLSearchParams): string =>
  FILTER_KEYS.map(k => `${k}=${sp.get(k) ?? ''}`).concat(`m=${sp.get('m') ?? ''}`, `v=${sp.get('v') ?? ''}`).join('&')

export default function ResearchNotes(): JSX.Element {
  // 页签/市场/板块/筛选都在 URL：从公司二级页返回时能回到同一份列表
  const navType = useNavigationType()
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab')
  const mParam = params.get('m')
  const activeTab = resolveTab(tabParam, mParam)
  const catMarket: Market = mParam === 'cn' || mParam === 'hk' || mParam === 'adr' || mParam === 'ndx' ? mParam : 'us'
  const notesView = params.get('n') === 'v6' || tabParam === 'strategy' ? 'v6' : 'framework'
  const vParam = params.get('v')
  const view = vParam === 'combined' ? 'combined' : vParam === 'overview' ? 'overview' : vParam === 'lynch' ? 'lynch' : 'list'
  const progSector = params.get('sec') || '全部'
  const progGroup = params.get('grp') || '全部' // adr/ndx 地域分组（region）或 cn 主题（theme）
  const q = params.get('q') ?? ''
  const ratingF = pickOne(params.get('rating'), RATING_FILTERS, '全部')
  const stageF = pickOne(params.get('stage'), STAGE_FILTERS, '全部') as ResearchStage | '全部'
  const lTier = pickOne(params.get('lt'), ['全部', ...LYNCH_TIERS] as const, '全部')
  const lMoat = pickOne(params.get('lm'), LYNCH_MOATS, '全部')
  const lType = pickOne(params.get('ly'), ['全部', ...LYNCH_TYPES] as const, '全部')
  const dcfF = pickOne(params.get('dcf'), DCF_FILTERS.map(f => f.id), 'all')
  const valuationRaw = params.get('vf')
  const valuationF: ValuationFilter = VALUATION_FILTERS.some(f => f.id === valuationRaw) || valuationRaw === 'numeric' || valuationRaw === 'undated'
    ? (valuationRaw as ValuationFilter) : 'all'
  const inCategory = activeTab === 'companies'
  // 只加载当前市场需要的数据：纳指页签由美股 + ADR + 纳指新增三部分拼成
  const needs = (m: Market): boolean => inCategory && (catMarket === m || (catMarket === 'ndx' && (m === 'us' || m === 'adr')))
  const { list: usList, loading: usLoading, partial: usPartial, retry: usRetry } = useCompanies('us', needs('us'))
  const { list: cnList, loading: cnLoading, partial: cnPartial, retry: cnRetry } = useCompanies('cn', needs('cn'))
  const { list: hkList, loading: hkLoading, partial: hkPartial, retry: hkRetry } = useCompanies('hk', needs('hk'))
  const { list: adrList, loading: adrLoading, partial: adrPartial, retry: adrRetry } = useCompanies('adr', needs('adr'))
  const { list: ndxNewList, loading: ndxNewLoading, partial: ndxPartial, retry: ndxRetry } = useCompanies('ndx', needs('ndx'))
  const { data: lynch } = useLynch(inCategory)
  const cand = useCandidates(inCategory)
  const tools = useToolSources()
  const dcfOk = (c: Company): boolean => dcfF === 'all' || matchDcfFilter(dcfF, dcfOf(c.market, c.code, tools))
  const isCand = (c: Company): boolean => cand.items.some(i => i.market === c.market && i.code === c.code)
  const toggleCand = (c: Company): void => cand.toggle(c.market, c.code)
  const [limit, setLimit] = useState(60)
  const updateParams = (patch: Record<string, string | null>, replace = true): void =>
    setParams(prev => {
      const next = new URLSearchParams(prev)
      Object.entries(patch).forEach(([k, v]) => (v === null ? next.delete(k) : next.set(k, v)))
      return next
    }, { replace })
  // 筛选一律 replace；一级页签用 push，返回键能回到上一个页签（L8）
  const setFilter = (patch: Record<string, string | null>): void => updateParams(patch, true)
  const setQ = (value: string): void => setFilter({ q: value.trim() ? value : null })
  const setRatingF = (value: string): void => setFilter({ rating: value === '全部' ? null : value })
  const setStageF = (value: ResearchStage | '全部'): void => setFilter({ stage: value === '全部' ? null : value })
  const setLTier = (value: string): void => setFilter({ lt: value === '全部' ? null : value })
  const setLMoat = (value: string): void => setFilter({ lm: value === '全部' ? null : value })
  const setLType = (value: string): void => setFilter({ ly: value === '全部' ? null : value })
  const setDcfF = (value: DcfFilterId): void => setFilter({ dcf: value === 'all' ? null : value })
  const setValuationF = (value: ValuationFilter): void => setFilter({ vf: value === 'all' ? null : value })
  const clearListFilters = (): Record<string, string | null> => ({
    q: null, rating: null, stage: null, lt: null, lm: null, ly: null, vf: null, dcf: null, sec: null, grp: null,
  })
  const resetFilters = (): void => setFilter(clearListFilters())
  useEffect(() => { setLimit(60) }, [catMarket, progSector, progGroup, q, ratingF, lTier, lMoat, lType, view, dcfF, valuationF])
  const setActiveTab = (t: TabId): void => updateParams({ tab: t, n: null }, false)
  // 切换市场时顺带清空筛选，避免上一个市场的评级/类型让新市场列表为空
  const setCatMarket = (m: Market): void => updateParams({ tab: 'companies', m, v: null, ...clearListFilters() }, true)
  const [zoomImg, setZoomImg] = useState<{ src: string; title: string } | null>(null)

  useEffect(() => {
    // 从公司二级页返回时，仅在列表条件相同时恢复滚动；否则回到顶部
    let y = 0
    try {
      const raw = sessionStorage.getItem('rn-scroll')
      sessionStorage.removeItem('rn-scroll')
      if (navType === 'POP' && raw) {
        const parsed = JSON.parse(raw) as { y?: number; key?: string } | number
        if (typeof parsed === 'object' && parsed && parsed.key === listKeyOf(params)) y = Number(parsed.y) || 0
      }
    } catch { /* 隐私模式或旧格式忽略 */ }
    window.scrollTo(0, y)
  }, [])

  const hint = (children: React.ReactNode): JSX.Element => <p className="rn-hint">{children}</p>

  const Table = ({ heads, rows, label }: { heads: string[]; rows: React.ReactNode[][]; label?: string }): JSX.Element => (
    <TableWrap label={label ?? heads.join(' / ')} stickyHeader>
      <table className="ui-table rn-table">
        <thead>
          <tr>{heads.map(h => <th key={h} scope="col">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </TableWrap>
  )

  const checkRow = (text: React.ReactNode, accent: string, key?: React.Key, icon: 'check' | 'warn' = 'check'): JSX.Element => (
    <div key={key} className="rn-check">
      {icon === 'check' ? <CheckCircle2 size={16} color={accent} aria-hidden="true" /> : <AlertTriangle size={16} color={accent} aria-hidden="true" />}
      <span>{text}</span>
    </div>
  )

  const flowStep = (num: number, children: React.ReactNode): JSX.Element => (
    <div key={num} className="rn-step">
      <span className="rn-step__num" aria-hidden="true">{num}</span>
      <div className="rn-step__body">{children}</div>
    </div>
  )

  const metricCard = (label: string, value: string): JSX.Element => <Stat key={label} label={label} value={value} />

  const quote = (children: React.ReactNode): JSX.Element => <blockquote className="rn-quote">{children}</blockquote>

  const disclaimer = (
    <p className="rn-disclaimer">
      内容整理自 Notion 个人笔记（{NOTION_SYNC_DATE}），仅为研究记录，不构成投资建议。
    </p>
  )

  const usSectors = sectorsOf(usList)
  // 纳指页签：101只权益证券（100家公司）=引用已有研究页+10家手工研究（market为ndx）。
  // ndx 手工研究页优先：HONA 已进标普500，标普页签另有程序化初筛条目，纳指页签仍引用手工研究页。
  const ndxByCode = new Map<string, Company>()
  for (const c of [...ndxNewList, ...usList, ...adrList]) if (!ndxByCode.has(c.code)) ndxByCode.set(c.code, c)
  // 本轮新增的 10 家排在最前（便于复核），其余按成分名单顺序
  const ndxAll = NDX_CODES.map(code => ndxByCode.get(code)).filter((c): c is Company => !!c)
  const ndxList = [...ndxAll.filter(c => c.market === 'ndx'), ...ndxAll.filter(c => c.market !== 'ndx')]
  const ndxLoading = usLoading || adrLoading || ndxNewLoading
  const progList = catMarket === 'cn' ? cnList : catMarket === 'hk' ? hkList : catMarket === 'adr' ? adrList : catMarket === 'ndx' ? ndxList : usList
  const combinedLoading = catMarket === 'cn' ? cnLoading : catMarket === 'hk' ? hkLoading : catMarket === 'adr' ? adrLoading : catMarket === 'ndx' ? ndxLoading : usLoading
  // 程序化补全 JSON 失败时只剩手工研究页：提示名单不完整，计数不能称完整
  const progPartial = catMarket === 'cn' ? cnPartial : catMarket === 'hk' ? hkPartial : catMarket === 'adr' ? adrPartial : catMarket === 'ndx' ? (usPartial || adrPartial || ndxPartial) : usPartial
  const retryProg = (): void => {
    if (catMarket === 'cn') cnRetry()
    else if (catMarket === 'hk') hkRetry()
    else if (catMarket === 'adr') adrRetry()
    else if (catMarket === 'ndx') { if (usPartial) usRetry(); if (adrPartial) adrRetry(); if (ndxPartial) ndxRetry() }
    else usRetry()
  }
  const progSectors = sectorsOf(progList)
  // 板块统一为 GICS / 中证一级后，ADR 地域分组与 A 股主题单列一排筛选，不再混在板块里
  const groupOf = (c: Company): string | undefined => c.region ?? c.theme
  const groupLabel = catMarket === 'cn' ? '主题' : '地区'
  const progGroups = Array.from(new Set(progList.map(groupOf).filter((g): g is string => !!g)))
  const secList = progList.filter(c => (progSector === '全部' || c.sector === progSector) && (progGroup === '全部' || groupOf(c) === progGroup))
  // 评级归档规则见 features/signals/companySignals 的 ratingBucket（公司页信号汇总共用）
  const ratingOf = (c: { rating: string }): string => ratingBucket(c.rating)
  const hkScreenCount = hkList.filter(c => researchStage(c) === 'screen').length
  // 覆盖说明里的家数从列表现算；「初筛」与列表成熟度徽标同口径（features/signals/maturity）
  const usScreenCount = usList.filter(c => researchStage(c) === 'screen').length
  const usConstituentAdds = usList.filter(c => c.batch.startsWith('补全·标普500成分')).map(c => c.code)
  const cnScreenCount = cnList.filter(c => researchStage(c) === 'screen').length
  const cnConstituentAdds = cnList.filter(c => c.batch.startsWith('补全·沪深300成分')).map(c => `${c.name} ${c.code}`)
  const hkOfficialAsOf = '2026-11-27' // 与 public/data/market-cycle-universes.json 恒指/恒科官方快照日一致
  const hkNote = `港股范围 = 恒指 + 恒科当期成分（恒生官方名单 ${hkOfficialAsOf}）∪ 主要 H 股龙头补充，共 ${hkList.length} 家；其中 ${hkScreenCount} 家为程序化初筛，尚无手工研究页。研究池不是纯官方指数口径，保留已调出成分与 H 股龙头补充。既有手工研究页数据来自东方财富：PE/PB/股息率直接取其已换算值（港股报告币种常与交易币种不同，不能自行用 EPS 除股价）；增速按财年窗口计算，并附最新中期利润同比。手工页曾按股票分析专家标准核读（aktools + 2026 中期业绩）；赣锋锂业、中国铝业、中国铁建、中国交建、中国建材、信义玻璃、信义光能等部分公司证据不全处标 [MISSING]。程序化初筛仅占位名单与板块，三情景/买入区/评级待研究；行情与估值由公司行情刷新工作流补齐。多数已研究公司盈亏比低于 1:1，评级以观察为主，反映价格已含较高预期而非数据缺失。`
  const usCoverageNote = `本地共 ${usList.length} 条研究记录，其中 ${usScreenCount} 条成熟度为「初筛」（程序化补全或没有可用情景价）${usConstituentAdds.length ? `；按当期成分补入的初筛占位 ${usConstituentAdds.length} 家：${usConstituentAdds.join('、')}` : ''}。研究池每周与公开成分名单比对（datasets/s-and-p-500-companies，维基同步，非标普官方权重），缺少成分只告警；名单内保留已调出的历史对照，所以记录数不等于今日成分公司数，也不等于深研完成数。标普500官方口径为500家公司，股份类别条数另计。补入的初筛占位只有名单与板块，三情景、买入区与评级待研究；行情由公司行情刷新补齐。2026-10 审计时原 294 条补全记录中 238 条明确缺少 FCF、2 条带财报滞后提示。全池完成旧模型审计，不等同于逐家一手公告深研；未经本轮公告复核的记录保留上轮结论用于检索。`
  const cnCoverageNote = `沪深市场没有名为「沪深500」的官方指数。本页的范围 = 沪深300（300 家大盘股）∪ 中证500（500 家中盘股）∪ 此前整理的产业链龙头中不在这两个指数内的补充公司，当前共 ${cnList.length} 家，其中 ${cnScreenCount} 家成熟度为「初筛」${cnConstituentAdds.length ? `（按中证官方成分补入的沪深300 成分：${cnConstituentAdds.join('、')}，尚无研究页）` : ''}。2026-10 整理时范围共 837 家、已覆盖 832 家（手工研究页 26 家 + 程序化页 806 家）；未覆盖 5 家：越秀资本（000987）、国盛证券（002670）、电投水电（600292）、永安期货（600927）——财务数据口径不适用本规则；九号公司（689009）——数据接口失败。A 股页面的业务描述取自同花顺主营介绍；沪深300 成分股补写了护城河、行业判断与公司特有风险的简述（初筛占位除外），中证500 成分股只有按中证行业分类的行业简述；评级用于筛选与排序。`
  const adrNote = '美股非标普研究池（2026-10-07 复核时66家）按地区分组覆盖：海外龙头30家、中概21家、新兴市场平台13家、新上市/热门2家；板块按 GICS 一级，地区分组见「地区」筛选；名单是自选研究池，不是官方指数。2026-10-07已逐家核读公司或监管财务原件，更新常规交易价快照、证券单位、财报期、一次性损益、旧结论修正与风险证伪。采用单模型多视角复核，15个批次每批3–5家。汇丰与道明银行有静态BV/ROE敏感性草案，全部66家均未完成两种独立估值认证；旧买入区、赔率及未经核实的美元EPS折算不作为当前结论。每家公司可打开本轮完整报告；缺证据标[MISSING]，不把缺证直接解释成经营恶化。'
  const ndxNote = (): string => {
    const sp = ndxList.filter(c => c.market === 'us').length
    const ad = ndxList.filter(c => c.market === 'adr').length
    const nw = ndxList.filter(c => c.market === 'ndx').length
    const alsoSp = ndxList.filter(c => c.market === 'ndx' && usList.some(u => u.code === c.code)).map(c => c.code)
    return `纳指100 页签列出 ${ndxList.length} 只权益证券（GOOGL 与 GOOG 为同一公司两类股）：其中 ${sp} 只与标普500 重合、${ad} 只属于「美股非标普」，直接引用已有研究页；另有 ${nw} 家手工研究，市场标记为 ndx${alsoSp.length ? `（其中 ${alsoSp.join('、')} 已进标普500，标普500 页签另列程序化初筛条目，这里引用手工研究页）` : '，不计入标普500'}。${NDX_ASOF} 当前价格与采集时间逐家公司单列；原财务与模型不是本轮重新认证，估值仍为研究假设，不构成投资建议。`
  }
  const shownCompanies = secList.filter(c => matchValuationFilter(valuationF, c.valuation, c.marketRefresh) && (ratingF === '全部' || ratingOf(c) === ratingF) && (stageF === '全部' || researchStage(c) === stageF) && (!q.trim() || (c.name + c.code).toLowerCase().includes(q.trim().toLowerCase())))

  // 导出：公司、代码、评级、结论（当前筛选 / 全部）
  const exportJson = (list: typeof progList, label: string): void => {
    const rows = list.map(c => ({ 市场: marketLabel(c.market), 代码: c.code, 公司: c.name, 板块: c.sector, 分组: groupOf(c) ?? null, 评级: c.rating, 归类: ratingOf(c), 成熟度: RESEARCH_STAGE[researchStage(c)].label, 结论: c.headline, 综合估值: c.valuation ?? null }))
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${label}-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  // 待定：PE 等估值输入缺失，排在「低」之后
  const tierRank: Record<string, number> = { 高: 0, 中: 1, 低: 2, 待定: 3 }
  const moatTone = (l: string): Tone => (l.startsWith('宽') ? 'green' : l.startsWith('窄') ? 'blue' : 'gray')
  const tierTone = (t: string): Tone => (t === '高' ? 'green' : t === '中' ? 'blue' : t === '待定' ? 'orange' : 'gray')
  const lynchOf = (c: Company): LynchInfo | undefined => lynchFor(lynch, c)
  const fmt1 = (x: number | null | undefined, sfx = '', plus = false): string => (x === null || x === undefined ? '—' : `${plus && x > 0 ? '+' : ''}${x}${sfx}`)
  const lynchBase = progList.filter(c => lynchOf(c))
  const lynchShown = lynchBase
    .filter(c => {
      const l = lynchOf(c) as LynchInfo
      return dcfOk(c) && (lType === '全部' || l.t === lType) && (lTier === '全部' || l.r === lTier) && (lMoat === '全部' || (l.m && l.m.l.startsWith(lMoat))) && (!q.trim() || (c.name + c.code).toLowerCase().includes(q.trim().toLowerCase()))
    })
    .sort((a, b) => {
      const la = lynchOf(a) as LynchInfo; const lb = lynchOf(b) as LynchInfo
      const d = (tierRank[la.r] ?? 4) - (tierRank[lb.r] ?? 4)
      if (d) return d
      const ma = la.m && la.m.n ? la.m.s / la.m.n : -1; const mb = lb.m && lb.m.n ? lb.m.s / lb.m.n : -1
      return mb - ma
    })
  const exportLynch = (): void => {
    const rows = lynchShown.map(c => { const l = lynchOf(c) as LynchInfo; return { 市场: marketLabel(c.market), 代码: c.code, 公司: c.name, 板块: c.sector, 分组: groupOf(c) ?? null, 林奇类型: l.t, 同类关注度: l.r, 护城河: l.m ? `${l.m.l}（${l.m.s}/${l.m.n}）` : '—', 结论: [l.v, ...l.w].filter(Boolean).join('；'), 站内评级: c.rating } })
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `${catMarket}-林奇-${lType}-${lTier}-${lMoat}-${new Date().toISOString().slice(0, 10)}.json`; a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  const chip = (on: boolean): string => (on ? 'ui-chip is-active' : 'ui-chip')
  // 慢加载时不要冒充「共 0 家 · 没有符合条件」（M2）
  const emptyHint = (n: number): React.ReactNode => {
    if (combinedLoading && n === 0) {
      return (
        <div className="rn-list-skel" role="status" aria-busy="true" aria-label={`正在加载${marketLabel(catMarket)}公司`}>
          <div className="skeleton-line rn-list-skel__heading" />
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="rn-list-skel__row">
              <div className="skeleton-line rn-list-skel__cell rn-list-skel__cell--code" />
              <div className="skeleton-line rn-list-skel__cell rn-list-skel__cell--name" />
              <div className="skeleton-line rn-list-skel__cell rn-list-skel__cell--rating" />
              <div className="skeleton-line rn-list-skel__cell rn-list-skel__cell--wide" />
            </div>
          ))}
        </div>
      )
    }
    if (n !== 0) return null
    return (
      <div className="rn-empty">
        没有符合当前筛选条件的公司{progPartial ? '（部分公司数据暂不可用，结果可能不完整）' : ''}。
        <button type="button" onClick={resetFilters} className="tool-btn tool-btn--primary">清除筛选</button>
      </div>
    )
  }

  const moreFilterCount = (progSector !== '全部' ? 1 : 0) + (progGroup !== '全部' ? 1 : 0) + (valuationF !== 'all' ? 1 : 0) + (stageF !== '全部' ? 1 : 0)
  const valuationLabel = VALUATION_FILTERS.find(f => f.id === valuationF)?.label ?? valuationF

  const renderLynch = (): JSX.Element => (
    <>
      <details className="ui-card rn-card rn-details">
        <summary className="rn-summary">分组规则（点开查看）：林奇六类 × 巴菲特式护城河财务证据</summary>
        <div>
          <p className="rn-text">回答的是「这家公司该用什么标准买」，与「全部公司分类」里的评级（现在价格有没有赔率）互补，两者独立计算，不互相覆盖。全部由脚本按统一规则算出，用于初筛，边界公司会分错。</p>
          <p className="rn-text"><b>类型（按顺序判定）</b>：① 周期：行业属强周期（利润单边高增、从谷底回升也仍算周期——周期股高位时 PE 最低），或近三个 TTM 窗口利润「先升后降/先降后升」且波动 ≥1.6 倍；② 困境反转：TTM 归母亏损/刚由亏转盈/利润从谷底回升 ≥1.3 倍，利润回到谷底前水平之上即视为反转完成、按增速重判；③ 资产：PB &lt;1 的非金融股、REIT（PB 回到 1 以上即按增速重判）；④ 快速增长：有效增速 ≥20% 且营收 ≥10%；⑤ 稳健：有效增速 8–20%；⑥ 缓慢增长：&lt;8%。有效增速 = 「近一年」与「两年年化」中较小者，要求持续性。</p>
          <p className="rn-text"><b>同类关注度</b>不是买卖评级：它只回答「按这一类公司该用的标准，当前价格算不算合理」，高/中/低只在同类型内比较，跨类型不能比（周期股的「高」与成长股的「高」标准不同）。判定方式：快速增长看 PEG（PE ÷ 增速，增速封顶 50%；&lt;1 高、1–1.5 中）；稳健看 PE（≤15 高、≤22 中）；缓慢增长只在低 PE 或高股息（港股有股息数据）时给「中」；周期按盈利位置、不看 PEG——三年高位或连续高增一律「低」（低 PE 往往是顶部信号），刚从低位回升给「中」，位置不明为「待定」；PE 缺失时关注度为「待定」，不按「低」处理；困境反转看杠杆与最近季度是否改善；资产型看 PB 折价。</p>
          <p className="rn-text"><b>护城河（仅财务证据）</b>：定价权（毛利率显著高于同行业）、毛利稳定、资本回报（ROE 三年持续 ≥15%）、盈利持续、财务稳健、需求韧性，通过率 ≥83% 为「宽护城河迹象」、≥60% 为「窄」。它只能检验品牌/网络效应/转换成本通常留下的财务痕迹，不能证明护城河本身；金融股部分项不适用，数据不足的项不计分。局限：增速用历史值而非预期；无 FCF、无股息（A 股/美股）、无存货数据；一次性项目只在明显时剔除。</p>
        </div>
      </details>
      <div className="ui-cluster ui-cluster--scroll rn-filters" role="group" aria-label="林奇类型">
        {['全部', ...LYNCH_TYPES].map(t => (
          <button key={t} onClick={() => setLType(t)} className={chip(lType === t)} aria-pressed={lType === t}>{t} {t === '全部' ? lynchBase.length : lynchBase.filter(c => (lynchOf(c) as LynchInfo).t === t).length}</button>
        ))}
      </div>
      <div className="ui-cluster rn-filters">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜索公司名称或代码" aria-label="搜索公司名称或代码" className="rn-search" />
        {['全部', ...LYNCH_TIERS].map(t => <button key={t} onClick={() => setLTier(t)} className={chip(lTier === t)} aria-pressed={lTier === t}>{t === '全部' ? '关注度：全部' : `关注度：${t}`}</button>)}
        <DcfFilterChips value={dcfF} onChange={setDcfF} className="ui-cluster" />
        {['全部', '宽', '窄'].map(t => <button key={t} onClick={() => setLMoat(t)} className={chip(lMoat === t)} aria-pressed={lMoat === t}>{t === '全部' ? '护城河：全部' : `护城河：${t}`}</button>)}
        <button type="button" onClick={exportLynch} className="tool-btn">⬇ 导出当前（{lynchShown.length}）JSON</button>
      </div>
      <div className="ui-card rn-card">
        <Table
          heads={['公司', '林奇类型', '同类估值关注度', '护城河', '关键指标', '林奇判断', 'DCF', '候选']}
          rows={lynchShown.slice(0, limit).map(c => {
            const l = lynchOf(c) as LynchInfo
            return [
              <span>{companyLink(c.market, c.code, `${c.name} ${c.code}`)}</span>,
              <span className={badge('gray')}>{l.t}</span>,
              <span className={badge(tierTone(l.r))}>{l.r}</span>,
              l.m ? <span className={badge(moatTone(l.m.l))}>{l.m.l.replace('迹象', '')} {l.m.s}/{l.m.n}</span> : '—',
              <span className="rn-small-metrics">PE {fmt1(l.pe, '×')} · 利润 {fmt1(l.g, '%', true)}（两年年化 {fmt1(l.c, '%', true)}）{l.peg !== null && l.peg !== undefined ? ` · PEG ${l.peg}` : ''}{l.ph ? ` · ${l.ph}` : ''}{l.dy !== null && l.dy !== undefined ? ` · 股息 ${l.dy}%` : ''}</span>,
              <span className="rn-cell-wide">{l.v || l.w.join('；')}{l.f.length ? <span className="rn-small rn-small--inline"> ⚠ {l.f[0]}</span> : null}</span>,
              <DcfCell market={c.market} code={c.code} name={c.name} tools={tools} />,
              <CandidateButton on={isCand(c)} onClick={() => toggleCand(c)} />,
            ]
          })}
        />
        {emptyHint(lynchShown.length)}
        {lynchShown.length > limit && (
          <div className="rn-more">
            <button type="button" onClick={() => setLimit(l => l + 100)} className="tool-btn">显示更多（还有 {lynchShown.length - limit} 家）</button>
          </div>
        )}
        <p className="rn-footnote">默认按「同类关注度」再按护城河证据排序；点击公司进入分析页，页内有护城河各项证据。分类是脚本初筛，不构成投资建议。</p>
      </div>
    </>
  )

  const renderProgress = (): JSX.Element => (
    <>
      <div className="ui-cluster ui-cluster--scroll rn-filters rn-filters--primary" role="group" aria-label="搜索与评级">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜索公司名称或代码" aria-label="搜索公司名称或代码" className="rn-search" />
        {['全部', '优先关注', '条件关注', '观察', '回避', ...(catMarket === 'adr' || catMarket === 'hk' ? ['未估值'] : [])].map(r => (
          <button type="button" key={r} onClick={() => setRatingF(r)} className={chip(ratingF === r)} aria-pressed={ratingF === r}>
            {r} <span className="ui-chip__count">{r === '全部' ? secList.length : secList.filter(c => ratingOf(c) === r).length}</span>
          </button>
        ))}
      </div>

      {moreFilterCount > 0 && (
        <div className="rn-active-tags" aria-label="已生效筛选">
          <ul className="rn-active-tags__list">
            {progSector !== '全部' && (
              <li>
                <button type="button" className="rn-active-tag" onClick={() => updateParams({ sec: null })} aria-label={`移除行业筛选 ${progSector}`}>
                  行业：{progSector} <span aria-hidden="true">×</span>
                </button>
              </li>
            )}
            {progGroup !== '全部' && (
              <li>
                <button type="button" className="rn-active-tag" onClick={() => updateParams({ grp: null })} aria-label={`移除${groupLabel}筛选 ${progGroup}`}>
                  {groupLabel}：{progGroup} <span aria-hidden="true">×</span>
                </button>
              </li>
            )}
            {valuationF !== 'all' && (
              <li>
                <button type="button" className="rn-active-tag" onClick={() => setValuationF('all')} aria-label={`移除估值筛选 ${valuationLabel}`}>
                  {valuationLabel} <span aria-hidden="true">×</span>
                </button>
              </li>
            )}
            {stageF !== '全部' && (
              <li>
                <button type="button" className="rn-active-tag" onClick={() => setStageF('全部')} aria-label={`移除成熟度筛选 ${RESEARCH_STAGE[stageF].label}`}>
                  成熟度：{RESEARCH_STAGE[stageF].label} <span aria-hidden="true">×</span>
                </button>
              </li>
            )}
          </ul>
          <button type="button" className="rn-clear-filters" onClick={resetFilters}>清除筛选</button>
        </div>
      )}

      <div className="rn-toolbar">
        <details className={`rn-more-filters${moreFilterCount > 0 ? ' has-active' : ''}`}>
          <summary className={`tool-btn rn-more-filters__sum${moreFilterCount > 0 ? ' is-active' : ''}`}>
            <SlidersHorizontal size={16} aria-hidden="true" />
            <span>更多筛选{moreFilterCount > 0 ? `（${moreFilterCount}）` : ''}</span>
            <ChevronDown size={16} className="rn-chev" aria-hidden="true" />
          </summary>
          <div className="rn-more-filters__body">
            <div className="ui-cluster ui-cluster--scroll rn-filters" role="group" aria-label="板块">
              {['全部', ...progSectors].map(sec => (
                <button type="button" key={sec} onClick={() => updateParams({ sec: sec === '全部' ? null : sec })} className={chip(progSector === sec)} aria-pressed={progSector === sec}>
                  {sec} <span className="ui-chip__count">{sec === '全部' ? progList.length : progList.filter(c => c.sector === sec).length}</span>
                </button>
              ))}
            </div>
            {progGroups.length > 0 && (
              <div className="ui-cluster ui-cluster--scroll rn-filters" role="group" aria-label={groupLabel}>
                <span className="rn-inline-label">{groupLabel}</span>
                {['全部', ...progGroups].map(g => (
                  <button type="button" key={g} onClick={() => updateParams({ grp: g === '全部' ? null : g })} className={chip(progGroup === g)} aria-pressed={progGroup === g}>
                    {g} <span className="ui-chip__count">{g === '全部' ? progList.length : progList.filter(c => groupOf(c) === g).length}</span>
                  </button>
                ))}
              </div>
            )}
            <div className="ui-cluster rn-filters">
              <CompanyValuationFilterChips value={valuationF} onChange={setValuationF} />
            </div>
            <div className="ui-cluster rn-filters" role="group" aria-label="研究成熟度">
              <span className="rn-inline-label">成熟度</span>
              {(['全部', 'verified', 'draft', 'screen'] as const).map(id => (
                <button type="button" key={id} onClick={() => setStageF(id)} className={chip(stageF === id)} aria-pressed={stageF === id} title={id === '全部' ? undefined : RESEARCH_STAGE[id].desc}>
                  {id === '全部' ? '全部' : RESEARCH_STAGE[id].label} <span className="ui-chip__count">{id === '全部' ? secList.length : secList.filter(c => researchStage(c) === id).length}</span>
                </button>
              ))}
            </div>
          </div>
        </details>
        <div className="rn-result-bar">
          <p className="rn-result-bar__count" aria-label={`${progPartial ? '已加载' : '共'} ${progList.length} 家${progPartial ? '（部分数据暂不可用）' : ''}，当前 ${shownCompanies.length} 家`}>
            <span className="rn-result-bar__count-full">{progPartial ? '已加载' : '共'} {progList.length} 家{progPartial ? '（部分数据暂不可用）' : ''}，当前 {shownCompanies.length} 家</span>
            <span className="rn-result-bar__count-short" aria-hidden="true">{shownCompanies.length} / {progList.length} 家</span>
          </p>
          <div className="rn-result-bar__actions rn-export-desktop">
            {[[`导出当前筛选（${shownCompanies.length}）`, shownCompanies, `${catMarket}-${progSector}-${ratingF}`], [`导出该市场全部（${progList.length}）`, progList, `${catMarket}-全部`]].map(([label, list, name]) => (
              <button type="button" key={label as string} onClick={() => exportJson(list as typeof progList, name as string)} className="tool-btn rn-export-btn">
                ⬇ {label as string} JSON
              </button>
            ))}
          </div>
          <details className="rn-export-fold">
            <summary className="tool-btn rn-export-fold__sum">
              导出
              <ChevronDown size={16} className="rn-chev" aria-hidden="true" />
            </summary>
            <div className="rn-export-fold__menu" role="group" aria-label="导出选项">
              {[[`导出当前筛选（${shownCompanies.length}）`, shownCompanies, `${catMarket}-${progSector}-${ratingF}`], [`导出该市场全部（${progList.length}）`, progList, `${catMarket}-全部`]].map(([label, list, name]) => (
                <button type="button" key={`m-${label as string}`} onClick={() => exportJson(list as typeof progList, name as string)} className="tool-btn rn-export-btn">
                  ⬇ {label as string} JSON
                </button>
              ))}
            </div>
          </details>
        </div>
      </div>

      <div className="ui-card rn-card">
        <Table
          heads={['公司', '评级', '一句话结论', '估值', '候选']}
          rows={shownCompanies.slice(0, limit).map(c => [
            <span>{companyLink(c.market, c.code, `${c.name} ${c.code}`)}{(() => { const st = researchStage(c); return <span className={badge(st === 'verified' ? 'blue' : 'gray', 'rn-badge-inline')} title={RESEARCH_STAGE[st].desc}>{RESEARCH_STAGE[st].label}</span> })()}{catMarket === 'ndx' ? <span className={badge(c.market === 'ndx' ? 'blue' : 'gray', 'rn-badge-inline')}>{c.market === 'ndx' ? '纳指新增' : c.market === 'us' ? '同属标普500' : '美股非标普'}</span> : null}</span>,
            <span className={badge(toneOf(c.rating))}>{c.rating.length > 12 ? c.rating.slice(0, 12) + '…' : c.rating}</span>,
            <span className="rn-cell-wide">{c.headline}</span>,
            <CompanyValuationCell company={c} />,
            <CandidateButton on={isCand(c)} onClick={() => toggleCand(c)} />,
          ])}
        />
        {emptyHint(shownCompanies.length)}
        {shownCompanies.length > limit && (
          <div className="rn-more">
            <button type="button" onClick={() => setLimit(l => l + 100)} className="tool-btn">显示更多（已显示 {limit} / {shownCompanies.length}）</button>
          </div>
        )}
        <details className="rn-legend">
          <summary className="rn-legend__sum">口径</summary>
          <p className="rn-hint">偏低 / 偏高按现价相对基准价的折溢价显示；区间内用淡色，区间外加强颜色。情景区间是模型敏感性，不认证为今日内在价值；未来情景单列，待核原因与完整推导可点击查看。原研究评级保留。</p>
        </details>
        <p className="rn-footnote">
          点击公司名称进入该公司的分析页。成熟度：初筛＝程序化补全或没有可用情景价；情景草案＝有情景价但未逐家核读最新公告；事实已复核＝已核读公司原件，估值仍是未认证草案。能否据此决策，取决于你自己的估值与决策记录。{(usLoading || cnLoading || hkLoading || adrLoading || ndxNewLoading) ? ' 正在加载补全公司…' : ''}
        </p>
      </div>
    </>
  )

  const companyLink = (market: Market, code: string, label: string): React.ReactNode => {
    const exists = (market === 'us' ? usList : market === 'cn' ? cnList : market === 'adr' ? adrList : market === 'ndx' ? ndxNewList : hkList).some(c => c.code === code)
    const listUrl = `/research-notes?${params.toString()}`
    return exists
      ? <Link
          to={`/research-notes/${market}/${encodeURIComponent(code)}`}
          state={{ from: listUrl }}
          onClick={() => {
            try {
              sessionStorage.setItem('rn-scroll', JSON.stringify({ y: window.scrollY, key: listKeyOf(params) }))
            } catch { /* ignore */ }
          }}
          className="rn-link"
        >{label}</Link>
      : label
  }

  const viewSwitch = (): JSX.Element => (
    <Segmented label="视图" value={view} onChange={v => updateParams({ v: v === 'list' ? null : v })}
      items={[{ id: 'list', label: '评级列表' }, { id: 'lynch', label: '林奇分类' }, { id: 'combined', label: '综合筛选' }, { id: 'overview', label: '覆盖与进度' }]} />
  )

  const marketSwitch = (value: Market, onChange: (m: Market) => void): JSX.Element => (
    <Segmented label="市场" value={value} onChange={onChange} items={markets.map(([id, label]) => ({ id, label }))} />
  )

  const watchView = (
    <div>
      <p role="note" className="section-archived">已舍弃：这一页是早期笔记里的具体买卖价位、催化剂与“潜力标的”，和书里“不荐股、不预测”的方法相悖，不再更新，仅留存档，不构成投资建议。研究对象请放进候选池，按书第37章37.4写决策记录。</p>
      <p className="rn-eyebrow">交易观察清单（存档）</p>
      {([['美股', '美股（含美股上市的 ADR）'], ['港股', '港股'], ['A股', 'A 股'], ['商品', '商品']] as [string, string][]).map(([m, title]) => (
        <div key={m} className="ui-card rn-card">
          <h3 className="rn-card-title">{title}</h3>
          <Table
            heads={['标的', '买入价位 / 条件', '卖出价位 / 条件', '核心催化剂与逻辑']}
            rows={tradeWatch.filter(t => t.market === m).map(t => [t.name, t.buy, t.sell, t.why])}
          />
        </div>
      ))}
      <div className="ui-card rn-card">
        <h3 className="rn-card-title">事件日历与时间窗口</h3>
        <Table heads={['标的 / 主题', '时间窗口', '备注']} rows={tradeEvents} />
      </div>
      <div className="ui-card rn-card">
        <h3 className="rn-card-title">港股观察标的（早期笔记存档）</h3>
        <Table heads={['标的', 'PE / 股息率', '分类', '适合风格', '核心看点']} rows={hkWatchTargets} />
      </div>
    </div>
  )

  const maxCount = Math.max(...sp500Sectors.map(s => s.count))

  // 旧链接 ?tab=pool 跳到独立的候选池页
  if (activeTab === 'pool') return <Navigate to="/candidates" replace />

  return (
    <Page className="rn-page">
      <PageTitle>公司研究</PageTitle>
      <PageTabs<TabId> label="公司研究栏目" value={activeTab} onChange={setActiveTab}
        items={tabs.map(t => ({ id: t.id, label: t.label, icon: <t.icon size={14} /> }))} />
      {activeTab === 'companies' && (
        <div className="rn-info-bar">
          {!combinedLoading && <PageDataFreshness
            checkedAt={progList.map(c => c.marketRefresh?.checkedAt).filter(Boolean).sort().at(-1)}
            dataLabel="行情日期"
            dataDates={progList.map(c => c.marketRefresh?.priceDate)}
            researchAsOf={catMarket === 'ndx' ? NDX_ASOF : undefined}
          />}
          <div className="rn-info-bar__links">
            <Link to="/candidates" className="rn-link"><Star size={14} aria-hidden="true" /> 我的候选池 · <span aria-live="polite">{cand.items.length}</span> 家</Link>
            <Link to="/earnings" className="rn-link"><CalendarClock size={14} aria-hidden="true" /> 财报前瞻</Link>
          </div>
          <details className="rn-info-bar__note">
            <summary className="rn-info-bar__note-sum">
              <Info size={15} aria-hidden="true" />
              <span>数据说明</span>
              <span className="rn-fold-hint">展开说明</span>
              <ChevronDown size={14} className="rn-chev" aria-hidden="true" />
            </summary>
            <p>行情已更新到上述日期；评级与一句话结论来自原研究，模型待逐家复核。具体公司行情日期见公司详情。我的候选池可进估值、DCF、网格；财报前瞻列未来六周公司库财报日与这次要验证的事。</p>
          </details>
        </div>
      )}

      {activeTab === 'companies' && progPartial && !combinedLoading && (
        <Callout tone="warn" title="部分公司数据暂不可用" className="rn-partial">
          程序化补全的公司数据这次没有取到，当前只列出已加载的 {progList.length} 家（手工研究页），不是该市场的完整名单，计数和筛选结果都会偏少。
          {' '}<button type="button" className="tool-btn" onClick={retryProg}>重试</button>
        </Callout>
      )}

      {/* 内容区 */}
      <div>

        {/* ── 配置笔记：投资框架 + 家庭组合 ── */}
        {activeTab === 'notes' && (
          <div>
            {hint(<>资产配置相关的 Notion 笔记，和 <Link to="/investment-plan-2026" className="rn-link">投资计划</Link> 配合阅读。</>)}
            <Segmented label="配置笔记" value={notesView} onChange={v => updateParams({ n: v === 'framework' ? null : v })}
              items={[{ id: 'framework', label: '投资框架' }, { id: 'v6', label: '家庭组合 v6' }]} />
          </div>
        )}

        {activeTab === 'notes' && notesView === 'v6' && (
          <p role="note" className="section-archived">已舍弃：家庭组合 v6 是早期的配置笔记（含机会加仓扳机等规则），和书现行方案不一致，不再更新。配置以书第9章9.10「先用宽基搭底仓：三档模板」和投资计划为准，仅留存档。</p>
        )}

        {activeTab === 'notes' && notesView === 'framework' && (
          <div>
            <p className="rn-eyebrow">投资框架</p>
            <div className="ui-card rn-card rn-card--lead">
              {quote(philosophy.motto)}
              <div className="ui-stat-grid rn-stat-grid">
                {philosophy.structure.map(x => metricCard(`${x.label} · ${x.desc}`, x.pct))}
              </div>
            </div>

            {philosophy.images.map(img => {
              const src = `${import.meta.env.BASE_URL}images/philosophy/${img.file}`
              return (
                <div key={img.file} className="ui-card rn-card">
                  <h3 className="rn-card-title">{img.title}</h3>
                  <img
                    src={src}
                    alt={img.title}
                    loading="lazy"
                    onClick={() => setZoomImg({ src, title: img.title })}
                    className="rn-figure-img"
                  />
                  <p className="rn-text">{img.caption}（点击图片放大）</p>
                </div>
              )
            })}

            <div className="ui-card rn-card">
              <h3 className="rn-card-title">被动层 · 压舱石（五格等权）</h3>
              <Table heads={['资产', '占比', '定位']} rows={philosophy.passive.map(r => [r[0], <span className={badge('blue')}>{r[1]}</span>, r[2]])} />
              <div className="rn-gap">
                {philosophy.rebalance.map((t, i) => checkRow(t, 'var(--system-green)', i))}
              </div>
            </div>

            <div className="ui-card rn-card">
              <h3 className="rn-card-title">现金流测算</h3>
              {philosophy.cashflow.map((t, i) => checkRow(t, 'var(--system-green)', i))}
            </div>

            <div className="ui-card rn-card">
              <h3 className="rn-card-title">主动层 · 发动机（四大场景）</h3>
              <Table heads={['场景', '要点']} rows={philosophy.active} />
              <h3 className="rn-card-title rn-card-title--sub">单笔交易闭环执行卡</h3>
              {philosophy.tradeCard.map((t, i) => flowStep(i + 1, t))}
            </div>

            <div className="ui-card rn-card">
              <h3 className="rn-card-title">主动层风控（铁律防爆仓）</h3>
              {philosophy.activeRisk.map((t, i) => checkRow(t, 'var(--system-red)', i, 'warn'))}
              <hr className="rn-rule" />
              <h3 className="rn-card-title">资金防火墙</h3>
              {philosophy.firewall.map((t, i) => checkRow(t, 'var(--system-orange)', i, 'warn'))}
            </div>

            <div className="ui-card rn-card">
              <h3 className="rn-card-title">共同纪律</h3>
              <div>{philosophy.discipline.map(t => <span key={t} className={badge('green')}>{t}</span>)}</div>
            </div>
            {disclaimer}
          </div>
        )}

        {activeTab === 'notes' && notesView === 'v6' && (
          <div>
            <p className="rn-eyebrow">{portfolioV6.title}</p>
            <div className="ui-card rn-card rn-card--lead">
              {quote(portfolioV6.oneLiner)}
              <div className="ui-stat-grid rn-stat-grid">
                {metricCard('股票占比', '64%')}
                {metricCard('防守占比', '36%')}
                {metricCard('再平衡阈值', '>7%')}
                {metricCard('股票硬顶', '71%')}
              </div>
            </div>

            <div className="ui-card rn-card">
              <h3 className="rn-card-title">配置表（300 万示例）</h3>
              <Table
                heads={['模块', '占比', '金额', '标的']}
                rows={portfolioV6.allocation.map(a => [a.module, <span className={badge('blue')}>{a.pct}%</span>, a.amount, a.target])}
              />
              <p className="rn-text">{portfolioV6.structure}</p>
            </div>

            <div className="ui-card rn-card">
              <h3 className="rn-card-title">组合外必备</h3>
              {portfolioV6.outside.map((t, i) => checkRow(t, 'var(--system-green)', i))}
            </div>

            <div className="ui-card rn-card">
              <h3 className="rn-card-title">日常操作</h3>
              {portfolioV6.operations.map((t, i) => flowStep(i + 1, t))}
            </div>

            <div className="ui-card rn-card">
              <h3 className="rn-card-title">机会加仓扳机</h3>
              <Table
                heads={['资产', '首次触发', '加档条件（二选一）', '子弹上限/轮']}
                rows={portfolioV6.triggers.map(t => [t.asset, t.first, t.next, t.bullets])}
              />
              <p className="rn-text">{portfolioV6.triggerRules}</p>
            </div>

            <div className="ui-card rn-card">
              <h3 className="rn-card-title">优点</h3>
              {portfolioV6.pros.map((t, i) => checkRow(t, 'var(--system-green)', i))}
              <hr className="rn-rule" />
              <h3 className="rn-card-title">缺点（接受了才建仓）</h3>
              {portfolioV6.cons.map((t, i) => checkRow(t, 'var(--system-orange)', i, 'warn'))}
            </div>

            <div className="ui-card rn-card">
              <h3 className="rn-card-title">注意点</h3>
              {portfolioV6.cautions.map((t, i) => checkRow(t, 'var(--system-red)', i, 'warn'))}
            </div>

            <div className="ui-card rn-card">
              <h3 className="rn-card-title">口诀</h3>
              {portfolioV6.mantra.map(t => <div key={t}>{quote(t)}</div>)}
            </div>
            {disclaimer}
          </div>
        )}

        {/* ── 研究方法：林奇两主线 + 巴菲特边界（features/research-method） ── */}
        {activeTab === 'method' && (
          <div>
            <ResearchMethod />
            <p className="rn-disclaimer">主体摘自《正念投资》第15、18—24章，通用纪律整理自 Notion 个人笔记（{NOTION_SYNC_DATE}），仅为研究记录，不构成投资建议。</p>
          </div>
        )}

        {/* ── 观察价位 ── */}
        {activeTab === 'watch' && watchView}

        {/* ── 公司库 ── */}
        {activeTab === 'companies' && (
          <div>
            <details className="rn-notice-fold">
              <summary className="rn-notice-fold__sum">
                <Info size={16} aria-hidden="true" />
                <span className="rn-notice-fold__text">个人研究笔记，不是买卖建议</span>
                <span className="rn-fold-hint">展开说明</span>
                <ChevronDown size={16} className="rn-chev" aria-hidden="true" />
              </summary>
              <ResearchNotice />
            </details>
            <div className="rn-switch-row">
              {marketSwitch(catMarket, setCatMarket)}
              {viewSwitch()}
            </div>

            {catMarket === 'us' && (
              <div>
                {view === 'list' && renderProgress()}
                {view === 'lynch' && renderLynch()}
                {view === 'combined' && <CompanyCombined key={catMarket} companies={progList} lynch={lynch} ratingOf={ratingOf} loading={combinedLoading} isCandidate={isCand} onToggleCandidate={toggleCand} />}
                {view === 'overview' && (<div>
                <p className="rn-eyebrow">标普500 · 历史研究分组</p>
                <div className="ui-card rn-card">
                  <p className="rn-text">{sp500Note}</p>
                  {sp500Sectors.map(s => (
                    <div key={s.name} className="rn-bar">
                      <span className="rn-bar__label">{s.name}</span>
                      <div className="rn-bar__track" aria-hidden="true">
                        <div className="rn-bar__fill" style={{ width: `${(s.count / maxCount) * 100}%` }} />
                      </div>
                      <span className="rn-bar__count">{s.count}</span>
                    </div>
                  ))}
                </div>
                <div className="ui-card rn-card">
                  <h3 className="rn-card-title">已有公司研究记录（{usList.length} 条）</h3>
                  <div>
                    {usSectors.map(sec => (
                      <span key={sec} className={badge('blue')}>{sec} {usList.filter(c => c.sector === sec).length}</span>
                    ))}
                  </div>
                  <p className="rn-text">
                    点击下方研究进度里的公司名称，进入该公司的二级分析页。
                  </p>
                </div>
                <p className="rn-eyebrow rn-eyebrow--gap">研究进度</p>
                  <div className="ui-card rn-card">
                    <h3 className="rn-card-title">标普500 研究进度</h3>
                    <div className="ui-stat-grid rn-stat-grid">
                      {metricCard('已完成公司页', `${usList.length} 家`)}
                      {metricCard('医疗保健', `${healthProgress.total}+ 家`)}
                      {metricCard('金融', `${usList.filter(c => c.sector === '金融').length} 家`)}
                      {metricCard('可选消费', `${usList.filter(c => c.sector === '可选消费').length} 家`)}
                  {metricCard('日常消费', `${usList.filter(c => c.sector === '日常消费').length} 家`)}
                    </div>
                    <p className="rn-text">
                      统一基准赔率 = (Base−P)/(P−Bear)，先确认悲观价值低于现价，再比较约 2:1 门槛。上轮 ZTS/SPGI 情景缺少完整盈利与倍数桥接，PEP 的 2.3:1 属于乐观口径，因此原“仅三家达标”结论撤回。程序化补全中还有 AES、CINF、CVS、OMC、UHS 数值候选，公告复核后均需重建估值；详细处理见本页圆桌汇总。
                    </p>
                  </div>

                <div className="ui-card rn-card">
                  <h3 className="rn-card-title">覆盖范围</h3>
                  <p className="rn-text">{usCoverageNote}</p>
                </div>
                </div>)}
              </div>
            )}

            {catMarket === 'cn' && (
              <div>
                {view === 'list' && (combinedLoading && !progList.length ? emptyHint(0) : renderProgress())}
                {view === 'lynch' && renderLynch()}
                {view === 'combined' && <CompanyCombined key={catMarket} companies={progList} lynch={lynch} ratingOf={ratingOf} loading={combinedLoading} isCandidate={isCand} onToggleCandidate={toggleCand} />}
                {view === 'overview' && (<div>
                <p className="rn-eyebrow">沪深产业链</p>
                {cnChains.map(chain => (
                  <div key={chain.name} className="ui-card rn-card">
                    <h3 className="rn-card-title">{chain.name}</h3>
                    <Table heads={['环节', '核心标的']} rows={chain.rows} />
                    <div className="rn-gap">
                      <span className={badge('green')}>{chain.focus}</span>
                    </div>
                  </div>
                ))}

                <div className="ui-card rn-card">
                  <h3 className="rn-card-title">化工龙头排名</h3>
                  <Table
                    heads={['#', '公司', '层级', '动态PE', '结论', '核心依据']}
                    rows={chemRanking.map(c => [
                      c.rank,
                      companyLink('cn', c.code, `${c.name} ${c.code}`),
                      <span className={badge(c.tier === 'A' ? 'green' : c.tier === 'B' ? 'blue' : 'gray')}>{c.tier}层</span>,
                      c.pe,
                      <span className={badge('blue')}>{c.label}</span>,
                      c.why,
                    ])}
                  />
                </div>

                <div className="ui-card rn-card">
                  <h3 className="rn-card-title">新材料核心六家</h3>
                  <Table
                    heads={['#', '公司', '总分', '一句话依据']}
                    rows={newMaterialRanking.map(c => [c.rank, companyLink('cn', c.code, `${c.name} ${c.code}`), <span className={badge('green')}>{c.score}</span>, c.why])}
                  />
                </div>

                <p className="rn-eyebrow rn-eyebrow--gap">研究进度</p>
                  <div className="ui-card rn-card">
                    <h3 className="rn-card-title">综合排名（盈亏比 / 胜率 / 时间效率）</h3>
                    <Table
                      heads={['公司', '盈亏比', '胜率', '时间效率', '综合']}
                      rows={compositeRank.map(c => [c.name, c.risk, c.win, c.time, <span className={badge(c.total <= 3 ? 'green' : 'blue')}>{c.total}</span>])}
                    />
                  </div>

                <div className="ui-card rn-card">
                  <h3 className="rn-card-title">覆盖范围与「沪深500」的定义</h3>
                  <p className="rn-text">{cnCoverageNote}</p>
                </div>
                </div>)}
              </div>
            )}

            {catMarket === 'hk' && (
              <div>
                {view === 'list' && renderProgress()}
                {view === 'lynch' && renderLynch()}
                {view === 'combined' && <CompanyCombined key={catMarket} companies={progList} lynch={lynch} ratingOf={ratingOf} loading={combinedLoading} isCandidate={isCand} onToggleCandidate={toggleCand} />}
                {view === 'overview' && (
                  <div className="ui-card rn-card">
                    <h3 className="rn-card-title">港股覆盖说明</h3>
                    <p className="rn-text">{hkNote}</p>
                  </div>
                )}
              </div>
            )}
            {catMarket === 'adr' && (
              <div>
                {view === 'list' && renderProgress()}
                {view === 'lynch' && renderLynch()}
                {view === 'combined' && <CompanyCombined key={catMarket} companies={progList} lynch={lynch} ratingOf={ratingOf} loading={combinedLoading} isCandidate={isCand} onToggleCandidate={toggleCand} />}
                {view === 'overview' && (
                  <div className="ui-card rn-card">
                    <h3 className="rn-card-title">美股非标普 · 覆盖说明</h3>
                    <p className="rn-text">{adrNote}</p>
                    <a href={`${import.meta.env.BASE_URL}research/adr-2026-10-07/index.html`} target="_blank" rel="noreferrer" className="rn-link">查看四个分类、66家公司完整报告与一手来源</a>
                  </div>
                )}
              </div>
            )}
            {catMarket === 'ndx' && (
              <div>
                {view === 'list' && renderProgress()}
                {view === 'lynch' && renderLynch()}
                {view === 'combined' && <CompanyCombined key={catMarket} companies={progList} lynch={lynch} ratingOf={ratingOf} loading={combinedLoading} isCandidate={isCand} onToggleCandidate={toggleCand} />}
                {view === 'overview' && (
                  <div className="ui-card rn-card">
                    <h3 className="rn-card-title">纳指100 · 覆盖说明</h3>
                    <p className="rn-text">{ndxNote()}</p>
                  </div>
                )}
              </div>
            )}
            {disclaimer}
          </div>
        )}

      </div>

      {/* 图片放大 */}
      {zoomImg && (
        <div className="rn-zoom" onClick={() => setZoomImg(null)} role="dialog" aria-label={zoomImg.title}>
          <img src={zoomImg.src} alt={zoomImg.title} className="rn-zoom__img" />
          <p className="rn-zoom__hint">点击任意位置关闭</p>
        </div>
      )}

    </Page>
  )
}
