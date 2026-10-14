import { LAB_DIRECTIONS } from './aiLab'

export interface NavItem {
  path: string
  label: string
}

export interface HubLink {
  path: string
  label: string
  desc: string
  /** 栏目页卡片上的短说明（14 字以内）；完整说明 desc 用于搜索与工作台 */
  short?: string
  /** 已舍弃的页面：保留可访问，子页面顶部显示这条说明 */
  archived?: string
  /** 次要入口：栏目页收进组内折叠区 */
  minor?: boolean
}

export interface HubGroup {
  id: string
  step?: string
  title: string
  hint?: string
  collapsed?: boolean
  links: HubLink[]
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/', label: '首页' },
  { path: '/invest', label: '投资' },
  { path: '/ai', label: 'AI实验室' },
  { path: '/blog', label: '博客' },
  { path: '/knowledge', label: '知识图谱' },
  { path: '/life', label: '自由空间' },
  { path: '/about', label: '关于' },
]

// 按投资流程分组：规则（书与年度计划）→ 观察盘（宏观到个股情绪）→ 分析筛选（行业到公司）→ 候选池 → 工具与参考。
// 分组同时决定子页面顶部的「同组切换条」和搜索分类，同一组只放同一件事。
// minor：在栏目页收进组内的折叠区，不占主卡片位置；子页面切换条里照常出现。
export const INVEST_GROUPS: HubGroup[] = [
  {
    id: 'rules',
    title: '规则',
    hint: '先读书、定计划，再看盘、选公司、用工具。',
    links: [
      { path: '/first-book', label: '我的书', short: '《正念投资》全文与目录', desc: '《正念投资：普通人用规则代替盯盘的投资方法》全文与目录' },
      { path: '/investment-plan-2026', label: '投资计划', short: '三笔钱、红线与产业趋势', desc: '三笔钱、再平衡、红线与回撤补仓，以及 AI 算力链等产业趋势判断' },
    ],
  },
  {
    id: 'watch',
    title: '观察盘',
    hint: '每天看一眼观察盘就够；细节页只在需要时打开。看环境，不据此下单。',
    links: [
      { path: '/watch', label: '观察盘', short: '宏观、全球、A股一页看完', desc: '宏观阶段与关键读数、全球主要指数与商品汇率、A 股涨跌停与资金流向，一页看完' },
      { path: '/monitor', label: '宏观温度', short: '中美港周期与估值位置', desc: '中美港经济温度、周期阶段、估值分位与对应动作', minor: true },
      { path: '/pulse', label: '全球行情', short: '指数热力图与 A 股走势', desc: '全球指数热力图、A 股指数 K 线与成交', minor: true },
      { path: '/daily-analysis', label: 'A股每日复盘', short: '涨跌停、连板与资金', desc: '自动获取 A 股行情、涨跌停与连板复盘', minor: true },
      { path: '/sector-rotation', label: '板块轮动', short: '板块强弱与轮动', desc: '行业板块的相对强弱与轮动阶段', minor: true },
      { path: '/limit-up-analysis', label: '涨停板块', short: '每日涨停按概念归类', desc: '每日涨停股按概念板块归类，含连板与涨停原因', minor: true },
    ],
  },
  {
    id: 'research',
    title: '分析筛选',
    hint: '从行业到公司：先看行业怎么运转，再挑值得研究的公司。',
    links: [
      { path: '/industry-landscape', label: '产业格局', short: '行业结构、龙头与格局', desc: '固态电池、半导体、AI算力、AI应用、机器人、军工、新能源车、光伏储能、核电电网、创新药、低空与商业航天、消费电子、白酒、银行、新材料、前沿科技，和一页纸主题研究卡' },
      { path: '/future-trends', label: '主题研究', short: '按主题看产业链与公司', desc: 'AI、智驾、机器人、固态电池、创新药、航空航天、新能源等主题的产业链、核心公司与逐家研究' },
      { path: '/research-notes', label: '公司研究', short: '四个市场的公司库', desc: '美股、港股、A 股公司库、林奇六分类与研究方法' },
      { path: '/invest/national-team', label: '国家队持仓', short: '汇金证金社保持仓变化', desc: '汇金、证金、社保等持有哪些 A 股：按机构、行业、个股看持仓与季度变化' },
    ],
  },
  {
    id: 'candidates',
    title: '候选池',
    hint: '研究筛出来的公司和你自己挑的公司放在一起，逐家估值、跟踪价格条件。',
    links: [
      { path: '/candidates', label: '候选池', short: '我的候选与研究筛出', desc: '我的候选池（备注、排序、云同步）与研究筛出的可买卖、价格太贵公司，一键进入估值、DCF 与网格' },
    ],
  },
  {
    id: 'tools',
    title: '工具与参考',
    hint: '估值看价格贵不贵，网格管买卖节奏，ETF 地图查选品。从候选池进入会自动带上公司。',
    links: [
      { path: '/valuation', label: '估值工作台', short: '自动取财报，六法三情景', desc: '连接本机估值服务，自动采集财报，六方法三情景估值与报告导出' },
      { path: '/dcf', label: 'DCF 计算器', short: '手动填假设，算安全边际', desc: 'WACC + 五年现金流折现估值与安全边际，手动填写假设，无需本机服务，可保存记录' },
      { path: '/grid-trading', label: '网格交易', short: 'A 股 / ETF 网格回测', desc: 'A 股与 ETF 网格模拟、回测与记录' },
      { path: '/invest/etf', label: 'ETF 流派地图', short: '各类 ETF 与主要风险', desc: '宽基、因子、主题、债券、商品等流派的主要 ETF 与风险' },
      { path: '/industry-etf', label: 'ETF 清单', short: '宽基与行业 ETF 选品', desc: '宽基首选与 7 个行业组共 59 只 ETF，附趋势备注与独立分析笔记' },
      { path: '/notes', label: '研究笔记', short: 'ETF 估值与趋势分析', desc: '逐只 ETF 的估值、权重、趋势与失效条件分析笔记' },
      { path: '/invest/bond-fund-report', label: '债基研究报告', short: '1—3 年持有的债基梳理', desc: '2026 年 10 月债券基金报告原文：中短债、纯债与二级债基的历史数据和风险提示' },
    ],
  },
  {
    id: 'related',
    title: '相关',
    links: [
      { path: '/ai/ai-skills', label: 'AI 投研 Skills', desc: '开发协作、投资分析、视频创作与小说写作 Skills 的介绍和下载包' },
    ],
  },
  {
    id: 'archived',
    title: '已舍弃',
    hint: '和书里的方法不一致，不再更新，只留存档。',
    collapsed: true,
    links: [
      { path: '/trading-philosophy', label: '道与术（短线策略）', desc: '早期短线交易体系', archived: '已舍弃：这是早期的短线交易体系，需要盯盘，和书里「不盯盘、不预测」的方法相反，仅留存档。' },
      { path: '/investment-strategy', label: '综合投资策略框架', desc: '巴菲特 · 邓普顿 · 双阶段轮动', archived: '已舍弃：这套框架已不再使用，方法以书和投资计划为准，仅留存档。' },
      { path: '/mainland-investment-targets', label: 'A 股观察池（AI 扩散）', desc: '2026 年 1 月的 AI 主题标的清单', archived: '已舍弃：这是 2026 年 1 月按 AI 主题整理的具体标的清单，含“立即配置”“回调加仓”等买卖建议和未注明来源的预测数字，与书里“不荐股、无来源的数字不写”相悖，内容已过期，仅留存档，不构成投资建议。观察池请按书第32、36章自己建立。' },
      { path: '/investment-targets', label: '美股观察池', desc: '未完成的占位页', archived: '已舍弃：这一页从未完成。观察池请按书第32、36章自己建立：10到20家，每家一份统一决策记录（37.4）。' },
    ],
  },
]

const ALL_LINKS: Array<{ group: HubGroup; link: HubLink }> = INVEST_GROUPS.flatMap(group =>
  group.links.map(link => ({ group, link }))
)

function matchesPath(base: string, pathname: string): boolean {
  return pathname === base || pathname.startsWith(base + '/')
}

export function findInvestEntry(pathname: string): { group: HubGroup; link: HubLink } | null {
  if (matchesPath('/ai', pathname)) return null
  if (matchesPath('/daily-analysis/legacy', pathname)) {
    const parent = ALL_LINKS.find(entry => entry.link.path === '/daily-analysis')
    if (parent) return { group: parent.group, link: { path: '/daily-analysis/legacy', label: '每日分析 · 历史旧版', desc: '原有手工复盘、导入导出与云同步' } }
  }
  let best: { group: HubGroup; link: HubLink } | null = null
  for (const entry of ALL_LINKS) {
    if (!matchesPath(entry.link.path, pathname)) continue
    if (!best || entry.link.path.length > best.link.path.length) best = entry
  }
  return best
}

export function isNavActive(itemPath: string, pathname: string): boolean {
  if (itemPath === '/') return pathname === '/'
  if (itemPath === '/invest') {
    return matchesPath('/invest', pathname) || findInvestEntry(pathname) !== null
  }
  return matchesPath(itemPath, pathname)
}

export interface SearchablePage {
  path: string
  label: string
  group: string
  desc?: string
  archived?: boolean
}

export interface WorkbenchTool {
  path: string
  label: string
  desc: string
}

// 不在导航和投资分组里、但有固定路径的页面
const EXTRA_PAGES: SearchablePage[] = [
  { path: '/daily-analysis/legacy', label: '每日分析 · 历史旧版', group: '投资 · 历史旧版', desc: '原有手工复盘、导入导出与云同步', archived: true },
  { path: '/first-book/slow-is-fast', label: '书的目录', group: '投资 · 规则', desc: '《正念投资》目录与章节' },
  { path: '/grid-trading/records', label: '网格记录', group: '投资 · 工具', desc: '已保存的网格模拟与回测记录' },
  { path: '/ai/fullstack-roadmap', label: '全栈学习路线', group: 'AI实验室', desc: 'AI 全栈开发学习计划' },
  { path: '/ai/dev-team', label: 'dev-team 使用说明', group: 'AI实验室', desc: 'Orca 开发团队的安装、自检、配置、派工与验证范围' },
]

/** 跳转面板与最近访问共用的页面注册表，由导航、投资分组和 AI 方向拼出，不另外手写 */
export const SEARCHABLE_PAGES: SearchablePage[] = [
  ...NAV_ITEMS.map(i => ({ path: i.path, label: i.label, group: '栏目' })),
  ...INVEST_GROUPS.flatMap(g =>
    g.links.filter(l => !LAB_DIRECTIONS.some(d => l.path === `/ai/${d.slug}`)).map(l => ({
      path: l.path,
      label: l.label,
      group: `投资 · ${g.title}`,
      desc: l.desc,
      ...(l.archived ? { archived: true } : {}),
    }))
  ),
  ...EXTRA_PAGES,
  ...LAB_DIRECTIONS.map(d => ({ path: `/ai/${d.slug}`, label: d.title, group: 'AI实验室 · 方向', desc: d.reason })),
]

export function findSearchablePage(pathname: string): SearchablePage | null {
  return SEARCHABLE_PAGES.find(p => p.path === pathname) ?? null
}

const descOf = (path: string): string => findSearchablePage(path)?.desc ?? ''

export const WORKBENCH_TOOLS: WorkbenchTool[] = [
  { path: '/candidates', label: '候选池', desc: descOf('/candidates') },
  { path: '/research-notes', label: '公司研究', desc: descOf('/research-notes') },
  { path: '/valuation', label: '估值工作台', desc: descOf('/valuation') },
  { path: '/dcf', label: 'DCF', desc: descOf('/dcf') },
  { path: '/grid-trading', label: '网格交易', desc: descOf('/grid-trading') },
  { path: '/watch', label: '观察盘', desc: descOf('/watch') },
  { path: '/knowledge', label: '知识图谱', desc: '个人知识库与笔记关系图' },
  { path: '/first-book', label: '我的书', desc: descOf('/first-book') },
]

/** 关键词按空格切开，每个词都要命中；label 开头 > label 包含 > 其他字段；已舍弃永远最后 */
export function searchPages(query: string, pages: SearchablePage[] = SEARCHABLE_PAGES): SearchablePage[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const first = terms[0]
  const scored = pages.flatMap((page, index) => {
    const label = page.label.toLowerCase()
    const haystack = [page.label, page.group, page.desc ?? '', page.path].join(' ').toLowerCase()
    if (!terms.every(t => haystack.includes(t))) return []
    const rank = !first ? 0 : label.startsWith(first) ? 0 : label.includes(first) ? 1 : 2
    return [{ page, index, rank: rank + (page.archived ? 10 : 0) }]
  })
  return scored.sort((a, b) => a.rank - b.rank || a.index - b.index).map(s => s.page)
}
