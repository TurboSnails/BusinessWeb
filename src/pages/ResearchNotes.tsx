import React, { useState, useEffect } from 'react'
import { Link, useNavigationType, useSearchParams } from 'react-router-dom'
import {
  BookOpen,
  Compass,
  Layers,
  Target,
  Grid3x3,
  Wrench,
  CheckCircle2,
  AlertTriangle,
  ArrowRight
} from 'lucide-react'
import {
  NOTION_SYNC_DATE,
  portfolioV6,
  philosophy,
  researchStandard,
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
  devIdeas,
  batchTool,
  toneOf,
  Tone
} from '../data/notionNotes'
import { useCompanies, useLynch, sectorsOf, Market, Company, LynchInfo } from '../data/companies'

type TabId = 'philosophy' | 'strategy' | 'standard' | 'category' | 'dev'

const tabs: { id: TabId; label: string; icon: React.ElementType }[] = [
  { id: 'philosophy', label: '投资理念', icon: Compass },
  { id: 'strategy', label: '策略配置', icon: Layers },
  { id: 'standard', label: '研究标准', icon: Target },
  { id: 'category', label: '分类数据', icon: Grid3x3 },
  { id: 'dev', label: '开发设想', icon: Wrench },
]

const toneColors: Record<Tone, { bg: string; color: string }> = {
  green: { bg: 'rgba(52,199,89,0.12)', color: 'var(--system-green)' },
  blue: { bg: 'rgba(0,122,255,0.10)', color: 'var(--system-blue)' },
  orange: { bg: 'rgba(255,149,0,0.12)', color: 'var(--system-orange)' },
  red: { bg: 'rgba(255,59,48,0.12)', color: 'var(--system-red)' },
  gray: { bg: 'var(--bg-secondary)', color: 'var(--text-secondary)' },
}

export default function ResearchNotes(): JSX.Element {
  // 页签/市场/板块存在 URL 查询参数里：从公司二级页返回时能回到原来的位置
  const navType = useNavigationType()
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab')
  const activeTab: TabId = tabs.some(t => t.id === tabParam) ? (tabParam as TabId) : 'philosophy'
  const mParam = params.get('m')
  const catMarket: Market | 'watch' = mParam === 'cn' || mParam === 'hk' || mParam === 'adr' || mParam === 'watch' ? mParam : 'us'
  const vParam = params.get('v')
  const view = vParam === 'overview' ? 'overview' : vParam === 'lynch' ? 'lynch' : 'list'
  const progSector = params.get('sec') || '全部'
  const inCategory = activeTab === 'category'
  const { list: usList, loading: usLoading } = useCompanies('us', inCategory)
  const { list: cnList, loading: cnLoading } = useCompanies('cn', inCategory)
  const { list: hkList, loading: hkLoading } = useCompanies('hk', inCategory)
  const { list: adrList, loading: adrLoading } = useCompanies('adr', inCategory)
  const lynch = useLynch(inCategory)
  const [lTier, setLTier] = useState('全部')
  const [lMoat, setLMoat] = useState('全部')
  const [lType, setLType] = useState('全部')
  const [q, setQ] = useState('')
  const [ratingF, setRatingF] = useState('全部')
  const [limit, setLimit] = useState(60)
  useEffect(() => { setLimit(60) }, [catMarket, progSector, q, ratingF, lTier, lMoat, lType, view])
  const updateParams = (patch: Record<string, string | null>): void =>
    setParams(prev => {
      const next = new URLSearchParams(prev)
      Object.entries(patch).forEach(([k, v]) => (v === null ? next.delete(k) : next.set(k, v)))
      return next
    }, { replace: true })
  const setActiveTab = (t: TabId): void => updateParams({ tab: t })
  const setCatMarket = (m: Market | 'watch'): void => updateParams({ tab: 'category', m, sec: null, v: null })
  const setProgSector = (sec: string): void => updateParams({ sec: sec === '全部' ? null : sec })
  const [showBackToTop, setShowBackToTop] = useState(false)
  const [zoomImg, setZoomImg] = useState<{ src: string; title: string } | null>(null)

  useEffect(() => {
    // 从公司二级页返回时恢复滚动位置，否则回到顶部
    let y = 0
    try {
      // 只有“返回”（POP）才恢复，从导航栏新进入一律回到顶部
      y = navType === 'POP' ? Number(sessionStorage.getItem('rn-scroll') || 0) : 0
      sessionStorage.removeItem('rn-scroll')
    } catch { /* 隐私模式下忽略 */ }
    window.scrollTo(0, y)
    const handleScroll = () => setShowBackToTop(window.scrollY > 400)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const card: React.CSSProperties = {
    background: 'var(--bg-card)',
    border: '1px solid rgba(255,255,255,0.7)',
    borderRadius: 'var(--radius-lg)',
    padding: '24px 28px',
    marginBottom: '16px',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    boxShadow: 'var(--shadow-md)',
  }

  const sectionTitle: React.CSSProperties = {
    fontSize: '11px',
    fontWeight: 600,
    color: 'var(--text-tertiary)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: '16px',
  }

  const cardTitle: React.CSSProperties = { fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 14px' }

  const badge = (tone: Tone): React.CSSProperties => ({
    display: 'inline-block',
    fontSize: '12px',
    padding: '3px 10px',
    borderRadius: '6px',
    marginRight: '6px',
    marginBottom: '6px',
    background: toneColors[tone].bg,
    color: toneColors[tone].color,
    fontWeight: 500,
    whiteSpace: 'nowrap',
  })

  const th: React.CSSProperties = { padding: '10px 14px', textAlign: 'left', color: 'var(--text-secondary)', fontWeight: 600, borderBottom: '0.5px solid var(--border-primary)', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '10px 14px', color: 'var(--text-secondary)', borderBottom: '0.5px solid var(--border-primary)' }

  const Table = ({ heads, rows }: { heads: string[]; rows: React.ReactNode[][] }): JSX.Element => (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ background: 'var(--bg-secondary)' }}>
            {heads.map(h => <th key={h} style={th}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ background: i % 2 === 1 ? 'var(--bg-secondary)' : 'transparent' }}>
              {r.map((c, j) => (
                <td key={j} style={j === 0 ? { ...td, color: 'var(--text-primary)', fontWeight: 500 } : td}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  const checkRow = (text: React.ReactNode, accent: string, key?: React.Key, icon: 'check' | 'warn' = 'check'): JSX.Element => (
    <div key={key} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '10px', fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
      {icon === 'check'
        ? <CheckCircle2 size={16} color={accent} style={{ flexShrink: 0, marginTop: '2px' }} />
        : <AlertTriangle size={16} color={accent} style={{ flexShrink: 0, marginTop: '2px' }} />}
      <span>{text}</span>
    </div>
  )

  const flowStep = (num: number, children: React.ReactNode): JSX.Element => (
    <div key={num} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: '16px' }}>
      <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(0,122,255,0.12)', color: 'var(--system-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 600, flexShrink: 0 }}>
        {num}
      </div>
      <div style={{ fontSize: '14px', color: 'var(--text-secondary)', paddingTop: '4px', lineHeight: 1.7 }}>{children}</div>
    </div>
  )

  const metricCard = (label: string, value: string): JSX.Element => (
    <div key={label} style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: '16px 18px' }}>
      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 6px' }}>{label}</p>
      <p style={{ fontSize: '22px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>{value}</p>
    </div>
  )

  const quote = (children: React.ReactNode): JSX.Element => (
    <div style={{ borderLeft: '2px solid var(--border-primary)', paddingLeft: '14px', marginBottom: '14px' }}>
      <p style={{ fontSize: '14px', color: 'var(--text-secondary)', fontStyle: 'italic', margin: 0, lineHeight: 1.7 }}>{children}</p>
    </div>
  )

  const grid = (min: number): React.CSSProperties => ({ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: '12px' })

  const disclaimer = (
    <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', lineHeight: 1.6, margin: '8px 0 0' }}>
      内容整理自 Notion 个人笔记（{NOTION_SYNC_DATE}），仅为研究记录，不构成投资建议。
    </p>
  )

  const usSectors = sectorsOf(usList)
  const progList = catMarket === 'cn' ? cnList : catMarket === 'hk' ? hkList : catMarket === 'adr' ? adrList : usList
  const progSectors = sectorsOf(progList)
  const secList = progSector === '全部' ? progList : progList.filter(c => c.sector === progSector)
  // 各来源评级用语不一（Notion 手写：逢低增持/买入/首选/核心配置…），统一归到四档；未识别的一律「观察」
  const ratingOf = (c: { rating: string }): string => {
    const r = c.rating
    if (/^未估值/.test(r)) return '未估值'
    if (/^(回避|暂不|暂缓)/.test(r)) return '回避'
    if (/^(优先关注|优先跟踪|买入|首选|核心配置|均衡优选|稳健增配)/.test(r)) return '优先关注'
    if (/^(条件|HOLD（条件候选）|优先观察|观察优先|重点观察|邮轮组优先|质地优先|增长可持续|质量观察（第|优质但待价|逢低增持)/.test(r)) return '条件关注'
    return '观察'
  }
  const hkNote = '港股范围 = 恒生指数成分股（取自维基百科 2026-01 名单）∪ 恒生科技与主要 H 股龙头补充，共尝试 127 家，已覆盖 124 家；领展（823）、药明生物（2269）、药明康德（2359）数据接口失败，未覆盖。这不是官方指数口径，是「港股大盘蓝筹」的研究池。数据来自东方财富：PE/PB/股息率直接取其已换算值（港股报告币种常与交易币种不同，不能自行用 EPS 除股价）；增速按财年窗口计算，并附最新中期利润同比。港股页面全部为程序化研究页，规则与局限同「研究标准」页，评级用于筛选与排序。'
  const adrNote = '美股非标普：在美国交易所可买卖、但不在标普500 内的知名公司（ADR 或直接上市），按三组归类——海外龙头（台积电、阿斯麦、诺和诺德、丰田、汇丰等）、中概（阿里、拼多多、京东、百度、网易、携程等）、新兴市场平台（Grab、Sea、MercadoLibre、Nu 等）；特别小的公司不收，共 58 家。名单是我按知名度与市值挑的研究池，不是官方指数口径；必和必拓、力拓、联合利华、帝亚吉欧、英美烟草、百济神州因数据源缺失未收录。数据来自东方财富美股财务指标：ADR 的 EPS 按普通股、以报告币种（人民币/新台币/欧元/日元等）计，与美元 ADS 股价之间还隔着汇率与 ADS 比例，数据源没有给出，所以本页不算 PE 与三情景，评级一律标「未估值」，只提供林奇分类（看增长）与护城河财务证据（看毛利、ROE、盈利持续性）。需要估值请自行按报告币种与 ADS 比例换算后判断。'
  const shownCompanies = secList.filter(c => (ratingF === '全部' || ratingOf(c) === ratingF) && (!q.trim() || (c.name + c.code).toLowerCase().includes(q.trim().toLowerCase())))

  // 导出：公司、代码、评级、结论（当前筛选 / 全部）
  const exportJson = (list: typeof progList, label: string): void => {
    const rows = list.map(c => ({ 市场: c.market === 'us' ? '标普500' : c.market === 'hk' ? '港股' : c.market === 'adr' ? '美股非标普' : '沪深', 代码: c.code, 公司: c.name, 板块: c.sector, 评级: c.rating, 归类: ratingOf(c), 结论: c.headline }))
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${label}-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const LYNCH_TYPES = ['快速增长型', '稳健型', '缓慢增长型', '周期型', '困境反转型', '资产型']
  const tierRank: Record<string, number> = { 高: 0, 中: 1, 低: 2 }
  const moatTone = (l: string): Tone => (l.startsWith('宽') ? 'green' : l.startsWith('窄') ? 'blue' : 'gray')
  const tierTone = (t: string): Tone => (t === '高' ? 'green' : t === '中' ? 'blue' : 'gray')
  const lynchOf = (c: Company): LynchInfo | undefined => lynch[`${c.market}:${c.code}`]
  const fmt1 = (x: number | null | undefined, sfx = '', plus = false): string => (x === null || x === undefined ? '—' : `${plus && x > 0 ? '+' : ''}${x}${sfx}`)
  const lynchBase = progList.filter(c => lynchOf(c))
  const lynchShown = lynchBase
    .filter(c => {
      const l = lynchOf(c) as LynchInfo
      return (lType === '全部' || l.t === lType) && (lTier === '全部' || l.r === lTier) && (lMoat === '全部' || (l.m && l.m.l.startsWith(lMoat))) && (!q.trim() || (c.name + c.code).toLowerCase().includes(q.trim().toLowerCase()))
    })
    .sort((a, b) => {
      const la = lynchOf(a) as LynchInfo; const lb = lynchOf(b) as LynchInfo
      const d = (tierRank[la.r] ?? 3) - (tierRank[lb.r] ?? 3)
      if (d) return d
      const ma = la.m && la.m.n ? la.m.s / la.m.n : -1; const mb = lb.m && lb.m.n ? lb.m.s / lb.m.n : -1
      return mb - ma
    })
  const exportLynch = (): void => {
    const rows = lynchShown.map(c => { const l = lynchOf(c) as LynchInfo; return { 市场: c.market === 'us' ? '标普500' : c.market === 'hk' ? '港股' : c.market === 'adr' ? '美股非标普' : '沪深', 代码: c.code, 公司: c.name, 板块: c.sector, 林奇类型: l.t, 同类关注度: l.r, 护城河: l.m ? `${l.m.l}（${l.m.s}/${l.m.n}）` : '—', 结论: [l.v, ...l.w].filter(Boolean).join('；'), 站内评级: c.rating } })
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob)
    a.download = `${catMarket}-林奇-${lType}-${lTier}-${lMoat}-${new Date().toISOString().slice(0, 10)}.json`; a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }
  const chipStyle = (on: boolean): React.CSSProperties => ({ border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px', fontWeight: 500, padding: '6px 12px', borderRadius: 'var(--radius-full)', background: on ? 'var(--system-blue)' : 'var(--bg-secondary)', color: on ? '#fff' : 'var(--text-secondary)' })
  const renderLynch = (): JSX.Element => (
    <>
      <details style={{ ...card, padding: '14px 18px' }}>
        <summary style={{ cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>分组规则（点开查看）：林奇六类 × 巴菲特式护城河财务证据</summary>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.8, marginTop: '10px' }}>
          <p style={{ margin: '0 0 8px' }}>回答的是「这家公司该用什么标准买」，与「全部公司分类」里的评级（现在价格有没有赔率）互补，两者独立计算，不互相覆盖。全部由脚本按统一规则算出，用于初筛，边界公司会分错。</p>
          <p style={{ margin: '0 0 6px' }}><b>类型（按顺序判定）</b>：① 困境反转：TTM 归母亏损/刚由亏转盈/利润从谷底回升 ≥1.3 倍；② 周期：行业属强周期，或近三个 TTM 窗口利润「先升后降/先降后升」且波动 ≥1.6 倍（单边高增不算周期）；③ 资产：PB &lt;1 的非金融股、REIT；④ 快速增长：有效增速 ≥20% 且营收 ≥10%；⑤ 稳健：有效增速 8–20%；⑥ 缓慢增长：&lt;8%。有效增速 = 「近一年」与「两年年化」中较小者，要求持续性。</p>
          <p style={{ margin: '0 0 6px' }}><b>同类关注度</b>不是买卖评级：它只回答「按这一类公司该用的标准，当前价格算不算合理」，高/中/低只在同类型内比较，跨类型不能比（周期股的「高」与成长股的「高」标准不同）。判定方式：快速增长看 PEG（PE ÷ 增速，增速封顶 50%；&lt;1 高、1–1.5 中）；稳健看 PE（≤15 高、≤22 中）；缓慢增长只在低 PE 或高股息（港股有股息数据）时给「中」；周期按盈利位置——三年高位一律「低」（低 PE 往往是顶部信号），刚从低位回升给「中」；困境反转看杠杆与最近季度是否改善；资产型看 PB 折价。</p>
          <p style={{ margin: 0 }}><b>护城河（仅财务证据）</b>：定价权（毛利率显著高于同行业）、毛利稳定、资本回报（ROE 三年持续 ≥15%）、盈利持续、财务稳健、需求韧性，通过率 ≥83% 为「宽护城河迹象」、≥60% 为「窄」。它只能检验品牌/网络效应/转换成本通常留下的财务痕迹，不能证明护城河本身；金融股部分项不适用，数据不足的项不计分。局限：增速用历史值而非预期；无 FCF、无股息（A 股/美股）、无存货数据；一次性项目只在明显时剔除。</p>
        </div>
      </details>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '4px 0 10px' }}>
        {['全部', ...LYNCH_TYPES].map(t => (
          <button key={t} onClick={() => setLType(t)} style={chipStyle(lType === t)}>{t} {t === '全部' ? lynchBase.length : lynchBase.filter(c => (lynchOf(c) as LynchInfo).t === t).length}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', margin: '0 0 10px' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜索公司名称或代码"
          style={{ flex: '1 1 180px', minWidth: '150px', fontSize: '13px', padding: '8px 14px', borderRadius: 'var(--radius-full)', border: '1px solid var(--border-primary)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontFamily: 'inherit' }} />
        {['全部', '高', '中', '低'].map(t => <button key={t} onClick={() => setLTier(t)} style={chipStyle(lTier === t)}>{t === '全部' ? '关注度：全部' : `关注度：${t}`}</button>)}
        {['全部', '宽', '窄'].map(t => <button key={t} onClick={() => setLMoat(t)} style={chipStyle(lMoat === t)}>{t === '全部' ? '护城河：全部' : `护城河：${t}`}</button>)}
        <button onClick={exportLynch} style={{ ...chipStyle(false), border: '1px solid var(--border-primary)', background: 'var(--bg-card)' }}>⬇ 导出当前（{lynchShown.length}）JSON</button>
      </div>
      <div style={card}>
        <Table
          heads={['公司', '林奇类型', '同类估值关注度', '护城河', '关键指标', '林奇判断']}
          rows={lynchShown.slice(0, limit).map(c => {
            const l = lynchOf(c) as LynchInfo
            return [
              <span>{companyLink(c.market, c.code, `${c.name} ${c.code}`)}</span>,
              <span style={badge('gray')}>{l.t}</span>,
              <span style={badge(tierTone(l.r))}>{l.r}</span>,
              l.m ? <span style={badge(moatTone(l.m.l))}>{l.m.l.replace('迹象', '')} {l.m.s}/{l.m.n}</span> : '—',
              <span style={{ display: 'block', minWidth: '150px', fontSize: '12px' }}>PE {fmt1(l.pe, '×')} · 利润 {fmt1(l.g, '%', true)}（两年年化 {fmt1(l.c, '%', true)}）{l.peg !== null && l.peg !== undefined ? ` · PEG ${l.peg}` : ''}{l.ph ? ` · ${l.ph}` : ''}{l.dy !== null && l.dy !== undefined ? ` · 股息 ${l.dy}%` : ''}</span>,
              <span style={{ display: 'block', minWidth: '200px' }}>{l.v || l.w.join('；')}{l.f.length ? <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}> ⚠ {l.f[0]}</span> : null}</span>,
            ]
          })}
        />
        {lynchShown.length > limit && (
          <div style={{ textAlign: 'center', marginTop: '14px' }}>
            <button onClick={() => setLimit(l => l + 100)} style={chipStyle(false)}>显示更多（还有 {lynchShown.length - limit} 家）</button>
          </div>
        )}
        <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: '12px 0 0' }}>默认按「同类关注度」再按护城河证据排序；点击公司进入分析页，页内有护城河各项证据。分类是脚本初筛，不构成投资建议。</p>
      </div>
    </>
  )

  const renderProgress = (): JSX.Element => (
    <>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '4px 0 12px' }}>
        {['全部', ...progSectors].map(sec => (
          <button key={sec} onClick={() => updateParams({ sec: sec === '全部' ? null : sec })}
            style={{ border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px', fontWeight: 500, padding: '6px 14px', borderRadius: 'var(--radius-full)', background: progSector === sec ? 'var(--system-blue)' : 'var(--bg-secondary)', color: progSector === sec ? '#fff' : 'var(--text-secondary)', transition: 'all 0.2s' }}>
            {sec} {sec === '全部' ? progList.length : progList.filter(c => c.sector === sec).length}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', margin: '0 0 16px' }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜索公司名称或代码"
          style={{ flex: '1 1 200px', minWidth: '160px', fontSize: '13px', padding: '8px 14px', borderRadius: 'var(--radius-full)', border: '1px solid var(--border-primary)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none' }} />
        {['全部', '优先关注', '条件关注', '观察', '回避', ...(catMarket === 'adr' ? ['未估值'] : [])].map(r => (
          <button key={r} onClick={() => setRatingF(r)}
            style={{ border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px', fontWeight: 500, padding: '6px 12px', borderRadius: 'var(--radius-full)', background: ratingF === r ? 'var(--system-blue)' : 'var(--bg-secondary)', color: ratingF === r ? '#fff' : 'var(--text-secondary)' }}>
            {r} {r === '全部' ? secList.length : secList.filter(c => ratingOf(c) === r).length}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '0 0 12px' }}>
        {[[`导出当前筛选（${shownCompanies.length}）`, shownCompanies, `${catMarket}-${progSector}-${ratingF}`], [`导出该市场全部（${progList.length}）`, progList, `${catMarket}-全部`]].map(([label, list, name]) => (
          <button key={label as string} onClick={() => exportJson(list as typeof progList, name as string)}
            style={{ border: '1px solid var(--border-primary)', cursor: 'pointer', fontFamily: 'inherit', fontSize: '12px', fontWeight: 500, padding: '6px 12px', borderRadius: 'var(--radius-full)', background: 'var(--bg-card)', color: 'var(--text-secondary)' }}>
            ⬇ {label as string} JSON
          </button>
        ))}
      </div>
      <div style={card}>
        <Table
          heads={['公司', '评级', '一句话结论']}
          rows={shownCompanies.slice(0, limit).map(c => [
            <span>{companyLink(c.market, c.code, `${c.name} ${c.code}`)}{c.auto ? <span style={{ ...badge('gray'), marginLeft: '6px', marginBottom: 0, fontSize: '10px' }}>程序化</span> : null}</span>,
            <span style={badge(toneOf(c.rating))}>{c.rating.length > 12 ? c.rating.slice(0, 12) + '…' : c.rating}</span>,
            <span style={{ display: 'block', minWidth: '220px' }}>{c.headline}</span>,
          ])}
        />
        {shownCompanies.length > limit && (
          <div style={{ textAlign: 'center', marginTop: '14px' }}>
            <button onClick={() => setLimit(l => l + 100)} style={{ border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px', fontWeight: 500, padding: '8px 20px', borderRadius: 'var(--radius-full)', background: 'var(--bg-secondary)', color: 'var(--system-blue)' }}>显示更多（已显示 {limit} / {shownCompanies.length}）</button>
          </div>
        )}
        <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: '12px 0 0' }}>
          点击公司名称进入该公司的分析页；标有「程序化」的公司页由脚本按统一规则生成。{(usLoading || cnLoading || hkLoading || adrLoading) ? ' 正在加载补全公司…' : ''}
        </p>
      </div>
    </>
  )

  const companyLink = (market: Market, code: string, label: string): React.ReactNode => {
    const exists = (market === 'us' ? usList : market === 'cn' ? cnList : market === 'adr' ? adrList : hkList).some(c => c.code === code)
    return exists
      ? <Link to={`/research-notes/${market}/${encodeURIComponent(code)}`} onClick={() => { try { sessionStorage.setItem('rn-scroll', String(window.scrollY)) } catch { /* ignore */ } }} style={{ color: 'var(--system-blue)', textDecoration: 'none', fontWeight: 500 }}>{label}</Link>
      : label
  }

  const viewSwitch = (overviewLabel: string): JSX.Element => (
    <div style={{ display: 'flex', gap: '8px', margin: '0 0 16px' }}>
      {([['list', '全部公司分类'], ['lynch', '林奇分组'], ['overview', overviewLabel]] as [string, string][]).map(([v, label]) => (
        <button key={v} onClick={() => updateParams({ v: v === 'list' ? null : v })}
          style={{ border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px', fontWeight: 600, padding: '7px 16px', borderRadius: 'var(--radius-full)', background: view === v ? 'var(--text-primary)' : 'var(--bg-secondary)', color: view === v ? 'var(--bg-primary)' : 'var(--text-secondary)' }}>
          {label}
        </button>
      ))}
    </div>
  )

  const marketSwitch = <T extends string>(value: T, onChange: (m: T) => void, withWatch = false): JSX.Element => (
    <div style={{ display: 'inline-flex', gap: '4px', padding: '4px', borderRadius: 'var(--radius-full)', background: 'var(--bg-secondary)', marginBottom: '20px' }}>
      {([['us', '标普500'], ['cn', '沪深500'], ['hk', '港股'], ['adr', '美股非标普'], ...(withWatch ? [['watch', '交易价位']] : [])] as [string, string][]).map(([m, label]) => (
        <button
          key={m}
          onClick={() => onChange(m as T)}
          style={{
            border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px', fontWeight: 600,
            padding: '7px 18px', borderRadius: 'var(--radius-full)',
            background: value === m ? 'var(--system-blue)' : 'transparent',
            color: value === m ? '#fff' : 'var(--text-secondary)',
            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {label}
        </button>
      ))}
    </div>
  )

  const watchView = (
    <div>
      <p style={sectionTitle}>交易观察清单</p>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.7 }}>价位为历史笔记，空白表示待补充，不视为交易指令；执行前请核对行情、财报与风险。</p>
      {([['美股', '美股（含美股上市的 ADR）'], ['港股', '港股'], ['A股', 'A 股'], ['商品', '商品']] as [string, string][]).map(([m, title]) => (
        <div key={m} style={card}>
          <h3 style={cardTitle}>{title}</h3>
          <Table
            heads={['标的', '买入价位 / 条件', '卖出价位 / 条件', '核心催化剂与逻辑']}
            rows={tradeWatch.filter(t => t.market === m).map(t => [t.name, t.buy, t.sell, t.why])}
          />
        </div>
      ))}
      <div style={card}>
        <h3 style={cardTitle}>事件日历与时间窗口</h3>
        <Table heads={['标的 / 主题', '时间窗口', '备注']} rows={tradeEvents} />
      </div>
      <div style={card}>
        <h3 style={cardTitle}>港股六大潜力标的</h3>
        <Table heads={['标的', 'PE / 股息率', '分类', '适合风格', '核心看点']} rows={hkWatchTargets} />
      </div>
    </div>
  )

  const maxCount = Math.max(...sp500Sectors.map(s => s.count))

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)', paddingBottom: '80px' }}>
      {/* 页面头部 */}
      <div style={{ background: 'linear-gradient(135deg, #5856D6 0%, #007AFF 100%)', padding: '40px 24px 32px' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
            <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <BookOpen size={24} color="#fff" />
            </div>
            <div>
              <h1 style={{ fontSize: '22px', fontWeight: 700, color: '#fff', margin: 0 }}>研究笔记汇总</h1>
              <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.8)', margin: 0 }}>同步自 Notion · {NOTION_SYNC_DATE}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tab 导航 */}
      <div style={{ position: 'sticky', top: '60px', zIndex: 10, background: 'var(--glass-bg)', backdropFilter: 'var(--glass-blur)', WebkitBackdropFilter: 'var(--glass-blur)', borderBottom: '0.5px solid var(--border-primary)' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto', padding: '0 20px', display: 'flex', gap: '4px', overflowX: 'auto' }}>
          {tabs.map(tab => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '14px 16px',
                  border: 'none',
                  background: 'transparent',
                  color: isActive ? 'var(--system-blue)' : 'var(--text-secondary)',
                  fontFamily: 'inherit',
                  fontSize: '14px',
                  fontWeight: isActive ? 600 : 400,
                  cursor: 'pointer',
                  borderBottom: isActive ? '2px solid var(--system-blue)' : '2px solid transparent',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.15s',
                }}
              >
                <Icon size={14} />
                {tab.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* 内容区 */}
      <div style={{ maxWidth: '760px', margin: '0 auto', padding: '28px 20px' }}>

        {/* ── 投资理念 ── */}
        {activeTab === 'philosophy' && (
          <div>
            <p style={sectionTitle}>投资框架</p>
            <div style={{ ...card, border: '1.5px solid rgba(0,122,255,0.35)', background: 'rgba(0,122,255,0.04)' }}>
              {quote(philosophy.motto)}
              <div style={grid(150)}>
                {philosophy.structure.map(x => metricCard(`${x.label} · ${x.desc}`, x.pct))}
              </div>
            </div>

            {philosophy.images.map(img => {
              const src = `${import.meta.env.BASE_URL}images/philosophy/${img.file}`
              return (
                <div key={img.file} style={{ ...card, padding: '20px' }}>
                  <h3 style={cardTitle}>{img.title}</h3>
                  <img
                    src={src}
                    alt={img.title}
                    loading="lazy"
                    onClick={() => setZoomImg({ src, title: img.title })}
                    style={{ width: '100%', height: 'auto', borderRadius: 'var(--radius-md)', cursor: 'zoom-in', display: 'block' }}
                  />
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '12px 0 0', lineHeight: 1.7 }}>{img.caption}（点击图片放大）</p>
                </div>
              )
            })}

            <div style={card}>
              <h3 style={cardTitle}>被动层 · 压舱石（五格等权）</h3>
              <Table heads={['资产', '占比', '定位']} rows={philosophy.passive.map(r => [r[0], <span style={badge('blue')}>{r[1]}</span>, r[2]])} />
              <div style={{ marginTop: '16px' }}>
                {philosophy.rebalance.map((t, i) => checkRow(t, 'var(--system-green)', i))}
              </div>
            </div>

            <div style={card}>
              <h3 style={cardTitle}>现金流测算</h3>
              {philosophy.cashflow.map((t, i) => checkRow(t, 'var(--system-green)', i))}
            </div>

            <div style={card}>
              <h3 style={cardTitle}>主动层 · 发动机（四大场景）</h3>
              <Table heads={['场景', '要点']} rows={philosophy.active} />
              <h3 style={{ ...cardTitle, margin: '20px 0 12px' }}>单笔交易闭环执行卡</h3>
              {philosophy.tradeCard.map((t, i) => flowStep(i + 1, t))}
            </div>

            <div style={card}>
              <h3 style={cardTitle}>主动层风控（铁律防爆仓）</h3>
              {philosophy.activeRisk.map((t, i) => checkRow(t, 'var(--system-red)', i, 'warn'))}
              <hr style={{ border: 'none', borderTop: '0.5px solid var(--border-primary)', margin: '20px 0' }} />
              <h3 style={cardTitle}>资金防火墙</h3>
              {philosophy.firewall.map((t, i) => checkRow(t, 'var(--system-orange)', i, 'warn'))}
            </div>

            <div style={card}>
              <h3 style={cardTitle}>共同纪律</h3>
              <div>{philosophy.discipline.map(t => <span key={t} style={badge('green')}>{t}</span>)}</div>
            </div>
            {disclaimer}
          </div>
        )}

        {/* ── 策略配置 ── */}
        {activeTab === 'strategy' && (
          <div>
            <p style={sectionTitle}>{portfolioV6.title}</p>
            <div style={{ ...card, border: '1.5px solid rgba(0,122,255,0.35)', background: 'rgba(0,122,255,0.04)' }}>
              {quote(portfolioV6.oneLiner)}
              <div style={grid(140)}>
                {metricCard('股票占比', '64%')}
                {metricCard('防守占比', '36%')}
                {metricCard('再平衡阈值', '>7%')}
                {metricCard('股票硬顶', '71%')}
              </div>
            </div>

            <div style={card}>
              <h3 style={cardTitle}>配置表（300 万示例）</h3>
              <Table
                heads={['模块', '占比', '金额', '标的']}
                rows={portfolioV6.allocation.map(a => [a.module, <span style={badge('blue')}>{a.pct}%</span>, a.amount, a.target])}
              />
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '14px 0 0', lineHeight: 1.7 }}>{portfolioV6.structure}</p>
            </div>

            <div style={card}>
              <h3 style={cardTitle}>组合外必备</h3>
              {portfolioV6.outside.map((t, i) => checkRow(t, 'var(--system-green)', i))}
            </div>

            <div style={card}>
              <h3 style={cardTitle}>日常操作</h3>
              {portfolioV6.operations.map((t, i) => flowStep(i + 1, t))}
            </div>

            <div style={card}>
              <h3 style={cardTitle}>机会加仓扳机</h3>
              <Table
                heads={['资产', '首次触发', '加档条件（二选一）', '子弹上限/轮']}
                rows={portfolioV6.triggers.map(t => [t.asset, t.first, t.next, t.bullets])}
              />
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '14px 0 0', lineHeight: 1.7 }}>{portfolioV6.triggerRules}</p>
            </div>

            <div style={card}>
              <h3 style={cardTitle}>优点</h3>
              {portfolioV6.pros.map((t, i) => checkRow(t, 'var(--system-green)', i))}
              <hr style={{ border: 'none', borderTop: '0.5px solid var(--border-primary)', margin: '20px 0' }} />
              <h3 style={cardTitle}>缺点（接受了才建仓）</h3>
              {portfolioV6.cons.map((t, i) => checkRow(t, 'var(--system-orange)', i, 'warn'))}
            </div>

            <div style={card}>
              <h3 style={cardTitle}>注意点</h3>
              {portfolioV6.cautions.map((t, i) => checkRow(t, 'var(--system-red)', i, 'warn'))}
            </div>

            <div style={card}>
              <h3 style={cardTitle}>口诀</h3>
              {portfolioV6.mantra.map(t => <div key={t}>{quote(t)}</div>)}
            </div>
            {disclaimer}
          </div>
        )}

        {/* ── 研究标准 ── */}
        {activeTab === 'standard' && (
          <div>
            <p style={sectionTitle}>研究标准 · 适用于所有公司</p>
            <div style={{ ...card, border: '1.5px solid rgba(0,122,255,0.35)', background: 'rgba(0,122,255,0.04)' }}>
              <h3 style={cardTitle}>核心投资目标</h3>
              {quote(researchStandard.goal)}
              {researchStandard.applies.map((t, i) => checkRow(t, 'var(--system-blue)', i))}
            </div>

            <div style={card}>
              <h3 style={cardTitle}>研究流程（五步）</h3>
              {researchStandard.flow.map((f, i) => flowStep(i + 1, (
                <>
                  <strong style={{ color: 'var(--text-primary)' }}>{f.title}</strong>
                  <span style={{ ...badge('blue'), marginLeft: '8px', marginBottom: 0 }}>{f.skill}</span>
                  <div>{f.desc}</div>
                </>
              )))}
            </div>

            <div style={card}>
              <h3 style={cardTitle}>三个研究 skill 的分工</h3>
              <Table heads={['skill', '什么时候用', '特点']} rows={researchStandard.skills.map(k => [<span><strong style={{ color: 'var(--text-primary)' }}>{k[0]}</strong><br /><code style={{ fontSize: '11px' }}>{k[1]}</code></span>, k[2], k[3]])} />
              <p style={{ fontSize: '12px', color: 'var(--text-tertiary)', margin: '12px 0 0', lineHeight: 1.6 }}>注意：专家团圆桌不给买卖指令；另外两个会给方向性结论，口径不要混用。</p>
            </div>

            <div style={card}>
              <h3 style={cardTitle}>立论：资深 PM 七问</h3>
              {researchStandard.pmQuestions.map((t, i) => flowStep(i + 1, t))}
            </div>

            <div style={card}>
              <h3 style={cardTitle}>数据纪律</h3>
              {researchStandard.dataRules.map((t, i) => checkRow(t, 'var(--system-green)', i))}
              <h3 style={{ ...cardTitle, margin: '20px 0 12px' }}>各市场财报节奏与看点</h3>
              <Table heads={['市场', '披露节奏', '口径与看点']} rows={researchStandard.calendar} />
            </div>

            <div style={card}>
              <h3 style={cardTitle}>口径纪律</h3>
              <Table heads={['项目', '要求']} rows={researchStandard.caliber} />
            </div>

            <div style={card}>
              <h3 style={cardTitle}>程序化研究页的规则（补全批）</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 14px', lineHeight: 1.7 }}>为补齐标普500 与沪深500 成分股，脚本对每家公司按同一套规则取数并计算；定性部分只做简述。它用于筛选与排序，不含公司特有催化与风险，不等同于逐家深度研究。</p>
              <Table heads={['项目', '规则']} rows={[
                ['数据源', '美股：东方财富单季财务 + 新浪日线；A 股：同花顺财务摘要（累计口径还原为单季）+ 新浪日线 + 中证/巨潮行业分类。成分股：标普500 公开名单（2026-09-30）、中证500 成分。'],
                ['TTM 口径', '美股：最近四个单季稀释 EPS 之和（GAAP）；A 股：TTM 归母净利 ÷ 最新隐含股本（规避送转前后 EPS 新旧口径混用）。'],
                ['拆股/除权', '美股按隐含股本的持续阶跃与价格跳变折算；A 股按财报发布后的价格跳变（≥1.28 倍）折算。页面会标出折算记录，需核实。'],
                ['一次性项归一化', '最近四季中若有 1 个季度净利率明显偏离其余三季的紧密区间，用其余三季中位净利率替换；金融、地产不做。归一化前后 EPS 均列出。'],
                ['基准情景', 'EPS = 归一化 TTM ×(1+g)，g = 最新季营收同比 ×0.7，限 −5%~+20%；倍数 = 现倍数与板块中位的中点，但不高于现倍数 1.25 倍，限 7–40。'],
                ['悲观 / 乐观', '悲观：EPS ×(1−h)，h 为 15%（防御）/20%（一般）/25–30%（周期），倍数 = min(现倍数, 0.6×板块中位)，下限 5。乐观：EPS ×(1+2g+8%)，倍数 = 1.15×基准。'],
                ['买入区', '由 (Base−P)/(P−Bear)=2 反推 P=(Base+2Bear)/3，取 ±5%。'],
                ['评级', '盈亏比 ≥2 优先关注；1–2 条件关注；其余观察；TTM 亏损回避。封顶为观察的情形：数据不稳定（营收同比波动 >40–50%、股本变动 >25%、EPS 符号翻转）、悲观价 ≥ 现价；金融股最高条件关注；非金融负债率 >80% 最高条件关注。'],
                ['不做的事', 'REIT 不做 EPS 情景（需 FFO）；亏损公司不做 EPS 情景；未取到的一律标 [MISSING]。'],
                ['已知局限', '规则对高 PE 公司偏严（悲观倍数压到板块中位的 60%），对低 PE 公司偏宽；一次性项识别可能漏判或误判；FCF、分部占比、一致预期、下跌原因均未取到。'],
              ]} />
            </div>

            {researchStandard.checklist.map((c, i) => (
              <div key={c.title} style={card}>
                <h3 style={cardTitle}>{i + 1}. {c.title}</h3>
                {c.items.map((t, j) => checkRow(t, 'var(--system-green)', j))}
              </div>
            ))}

            <div style={card}>
              <h3 style={cardTitle}>估值方法</h3>
              {researchStandard.valuation.map((t, i) => checkRow(t, 'var(--system-blue)', i))}
            </div>

            <div style={card}>
              <h3 style={cardTitle}>常见数据陷阱</h3>
              <Table heads={['陷阱', '典型表现', '做法']} rows={researchStandard.traps} />
            </div>

            <div style={card}>
              <h3 style={cardTitle}>对抗检验</h3>
              {researchStandard.adversarial.map((t, i) => checkRow(t, 'var(--system-orange)', i, 'warn'))}
            </div>

            <div style={card}>
              <h3 style={cardTitle}>最终返回标准（每家公司的成稿必须包含）</h3>
              <Table heads={['#', '模块', '必含内容', '最低要求']} rows={researchStandard.finalReport} />
              <h3 style={{ ...cardTitle, margin: '20px 0 12px' }}>深度分级</h3>
              <Table heads={['形式', '包含', '什么时候用']} rows={researchStandard.depth} />
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '14px 0 0', lineHeight: 1.7 }}>{researchStandard.chat}</p>
            </div>

            <div style={card}>
              <h3 style={cardTitle}>固定结论格式</h3>
              <Table heads={['项目', '要求']} rows={researchStandard.verdict.map(v => [v.label, v.text])} />
              <div style={{ marginTop: '14px' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginRight: '8px' }}>行动分类</span>
                {researchStandard.action.map(a => <span key={a} style={badge('gray')}>{a}</span>)}
              </div>
            </div>

            <div style={card}>
              <h3 style={cardTitle}>仓位与风控</h3>
              {researchStandard.position.map((t, i) => checkRow(t, 'var(--system-red)', i, 'warn'))}
            </div>

            <div style={card}>
              <h3 style={cardTitle}>红线</h3>
              {researchStandard.redlines.map((t, i) => checkRow(t, 'var(--system-red)', i, 'warn'))}
            </div>
            {disclaimer}
          </div>
        )}

        {/* ── 分类数据 ── */}
        {activeTab === 'category' && (
          <div>
            {marketSwitch(catMarket, setCatMarket, true)}

            {catMarket === 'watch' && watchView}

            {catMarket === 'us' && (
              <div>
                {viewSwitch('板块与研究进度')}
                {view === 'list' && renderProgress()}
                {view === 'lynch' && renderLynch()}
                {view === 'overview' && (<div>
                <p style={sectionTitle}>标普500 · GICS 板块</p>
                <div style={card}>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '0 0 16px', lineHeight: 1.7 }}>{sp500Note}</p>
                  {sp500Sectors.map(s => (
                    <div key={s.name} style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px', fontSize: '13px' }}>
                      <span style={{ width: '110px', color: 'var(--text-primary)', flexShrink: 0 }}>{s.name}</span>
                      <div style={{ flex: 1, height: '8px', borderRadius: '4px', background: 'var(--bg-secondary)' }}>
                        <div style={{ width: `${(s.count / maxCount) * 100}%`, height: '100%', borderRadius: '4px', background: 'var(--system-blue)' }} />
                      </div>
                      <span style={{ width: '28px', textAlign: 'right', color: 'var(--text-secondary)' }}>{s.count}</span>
                    </div>
                  ))}
                </div>
                <div style={card}>
                  <h3 style={cardTitle}>已完成公司研究（{usList.length} 家）</h3>
                  <div>
                    {usSectors.map(sec => (
                      <span key={sec} style={badge('blue')}>{sec} {usList.filter(c => c.sector === sec).length}</span>
                    ))}
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '8px 0 0', lineHeight: 1.7 }}>
                    点击下方研究进度里的公司名称，进入该公司的二级分析页。
                  </p>
                </div>
                <p style={{ ...sectionTitle, marginTop: '28px' }}>研究进度</p>
                  <div style={card}>
                    <h3 style={cardTitle}>标普500 研究进度</h3>
                    <div style={grid(140)}>
                      {metricCard('已完成公司页', `${usList.length} 家`)}
                      {metricCard('医疗保健', `${healthProgress.total}+ 家`)}
                      {metricCard('金融', `${usList.filter(c => c.sector === '金融').length} 家`)}
                      {metricCard('可选消费', `${usList.filter(c => c.sector === '可选消费').length} 家`)}
                  {metricCard('日常消费', `${usList.filter(c => c.sector === '日常消费').length} 家`)}
                    </div>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '16px 0 0', lineHeight: 1.7 }}>
                      统一框架“盈利—持续性—估值—盈亏比”，Base/Bear ≥ 约 2:1 才算首次介入赔率成立。截至 2026-09-30，可选消费板块已收官；医疗仅 ZTS（2.97×，条件成立时）、金融仅 SPGI（2.20×）、日常消费仅 PEP（2.3:1）达标；其余均为观察/等待。信息技术 51 家已按最新季度财报重做；「程序化」标注的补全批（标普500 缺口）由脚本按统一规则生成，规则见「研究标准」页。
                    </p>
                  </div>

                <div style={card}>
                  <h3 style={cardTitle}>覆盖范围</h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.8 }}>
                    标普500 成分股 503 家（2026-09-30 公开名单），已覆盖 502 家：此前 Notion 整理的 208 家（其中信息技术 51 家已重做）+ 程序化补全 294 家；另有 2 家此前收录但已不在名单内。未覆盖：HONA（上市不足 5 个季度，数据不足）。
                    程序化补全批的规则与局限见「研究标准」页；这些公司不含公司特有催化与风险，评级用于筛选与排序。
                  </p>
                </div>
                </div>)}
              </div>
            )}

            {catMarket === 'cn' && (
              <div>
                {viewSwitch('产业链与研究进度')}
                {view === 'list' && renderProgress()}
                {view === 'lynch' && renderLynch()}
                {view === 'overview' && (<div>
                <p style={sectionTitle}>沪深产业链</p>
                {cnChains.map(chain => (
                  <div key={chain.name} style={card}>
                    <h3 style={cardTitle}>{chain.name}</h3>
                    <Table heads={['环节', '核心标的']} rows={chain.rows} />
                    <div style={{ marginTop: '14px' }}>
                      <span style={badge('green')}>{chain.focus}</span>
                    </div>
                  </div>
                ))}

                <div style={card}>
                  <h3 style={cardTitle}>化工龙头排名</h3>
                  <Table
                    heads={['#', '公司', '层级', '动态PE', '结论', '核心依据']}
                    rows={chemRanking.map(c => [
                      c.rank,
                      companyLink('cn', c.code, `${c.name} ${c.code}`),
                      <span style={badge(c.tier === 'A' ? 'green' : c.tier === 'B' ? 'blue' : 'gray')}>{c.tier}层</span>,
                      c.pe,
                      <span style={badge('blue')}>{c.label}</span>,
                      c.why,
                    ])}
                  />
                </div>

                <div style={card}>
                  <h3 style={cardTitle}>新材料核心六家</h3>
                  <Table
                    heads={['#', '公司', '总分', '一句话依据']}
                    rows={newMaterialRanking.map(c => [c.rank, companyLink('cn', c.code, `${c.name} ${c.code}`), <span style={badge('green')}>{c.score}</span>, c.why])}
                  />
                </div>

                <p style={{ ...sectionTitle, marginTop: '28px' }}>研究进度</p>
                  <div style={card}>
                    <h3 style={cardTitle}>综合排名（盈亏比 / 胜率 / 时间效率）</h3>
                    <Table
                      heads={['公司', '盈亏比', '胜率', '时间效率', '综合']}
                      rows={compositeRank.map(c => [c.name, c.risk, c.win, c.time, <span style={badge(c.total <= 3 ? 'green' : 'blue')}>{c.total}</span>])}
                    />
                  </div>

                <div style={card}>
                  <h3 style={cardTitle}>覆盖范围与「沪深500」的定义</h3>
                  <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.8 }}>
                    沪深市场没有名为「沪深500」的官方指数。本页的范围 = 沪深300（300 家大盘股）∪ 中证500（500 家中盘股）∪ 此前整理的产业链龙头中不在这两个指数内的 37 家，共 837 家。已覆盖 832 家：手工研究页 26 家 + 程序化页 806 家（含此前只有产业链条目的公司）。
                    未覆盖 5 家：越秀资本（000987）、国盛证券（002670）、电投水电（600292）、永安期货（600927）——财务数据口径不适用本规则；九号公司（689009）——数据接口失败。
                    A 股页面的业务描述取自同花顺主营介绍；沪深300 成分股补写了护城河、行业判断与公司特有风险的简述，中证500 成分股只有按中证行业分类的行业简述；评级用于筛选与排序。
                  </p>
                </div>
                </div>)}
              </div>
            )}

            {catMarket === 'hk' && (
              <div>
                {viewSwitch('覆盖说明')}
                {view === 'list' && renderProgress()}
                {view === 'lynch' && renderLynch()}
                {view === 'overview' && (
                  <div style={card}>
                    <h3 style={cardTitle}>港股覆盖说明</h3>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.8 }}>{hkNote}</p>
                  </div>
                )}
              </div>
            )}
            {catMarket === 'adr' && (
              <div>
                {viewSwitch('覆盖说明')}
                {view === 'list' && renderProgress()}
                {view === 'lynch' && renderLynch()}
                {view === 'overview' && (
                  <div style={card}>
                    <h3 style={cardTitle}>美股非标普：覆盖说明</h3>
                    <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.8 }}>{adrNote}</p>
                  </div>
                )}
              </div>
            )}
            {catMarket !== 'watch' && disclaimer}
          </div>
        )}

        {/* ── 开发设想 ── */}
        {activeTab === 'dev' && (
          <div>
            <p style={sectionTitle}>多模型协作 Agent 设想</p>
            <div style={{ ...card, border: '1.5px solid rgba(0,122,255,0.35)', background: 'rgba(0,122,255,0.04)' }}>
              {quote(devIdeas.vision)}
              {devIdeas.architecture.map((a, i) => flowStep(i + 1, (
                <>
                  <strong style={{ color: 'var(--text-primary)' }}>{a.step}</strong>
                  <span style={{ ...badge('blue'), marginLeft: '8px', marginBottom: 0 }}>{a.mode}</span>
                  <div>{a.text}</div>
                </>
              )))}
            </div>

            <div style={card}>
              <h3 style={cardTitle}>设计原则</h3>
              {devIdeas.principles.map((t, i) => checkRow(t, 'var(--system-green)', i))}
            </div>

            <div style={card}>
              <h3 style={cardTitle}>参考项目</h3>
              <Table heads={['项目', '值得抄的部分']} rows={devIdeas.refs.map(r => [r.name, r.note])} />
            </div>

            <div style={card}>
              <h3 style={cardTitle}>学习路径</h3>
              {devIdeas.learning.map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', marginBottom: '10px', fontSize: '14px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  <ArrowRight size={16} color="var(--system-blue)" style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span>{t}</span>
                </div>
              ))}
            </div>

            <p style={{ ...sectionTitle, marginTop: '28px' }}>{batchTool.title}</p>
            <div style={card}>
              <h3 style={cardTitle}>使用流程</h3>
              {batchTool.steps.map((t, i) => flowStep(i + 1, t))}
              <hr style={{ border: 'none', borderTop: '0.5px solid var(--border-primary)', margin: '20px 0' }} />
              <h3 style={cardTitle}>数据质量规则</h3>
              {batchTool.rules.map((t, i) => checkRow(t, 'var(--system-blue)', i))}
              <div style={{ marginTop: '10px' }}><span style={badge('orange')}>{batchTool.note}</span></div>
            </div>
          </div>
        )}
      </div>

      {/* 图片放大 */}
      {zoomImg && (
        <div
          onClick={() => setZoomImg(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.85)', overflow: 'auto', padding: '16px', cursor: 'zoom-out' }}
        >
          <img src={zoomImg.src} alt={zoomImg.title} style={{ display: 'block', width: '100%', maxWidth: '1600px', minWidth: '320px', margin: '0 auto', borderRadius: '8px' }} />
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '12px', textAlign: 'center', margin: '12px 0 0' }}>点击任意位置关闭</p>
        </div>
      )}

      {/* 回到顶部 */}
      {showBackToTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          style={{
            position: 'fixed', bottom: '24px', right: '24px',
            width: '44px', height: '44px', borderRadius: '50%',
            background: 'var(--system-blue)', color: '#fff',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'var(--shadow-lg)', zIndex: 100,
          }}
        >
          ↑
        </button>
      )}
    </div>
  )
}
