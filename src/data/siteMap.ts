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
  { path: '/life', label: '自由之路' },
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
      { path: '/invest/my-plan', label: '我的计划与持仓', short: '本机预算与检查日', desc: '本机整理应急需求、三笔预算、配置类别、定投备忘与检查日；可从旧记录预览导入；不构成投资建议' },
      { path: '/investment-plan-2026', label: '2026 投资计划（作者示例）', short: '作者示例配置与红线', desc: '作者示例：三笔钱、再平衡、红线与回撤补仓，以及 AI 算力链等产业趋势判断；与「我的计划与持仓」是另一份独立记录' },
    ],
  },
  {
    id: 'watch',
    title: '观察盘',
    hint: '每天看一眼观察盘就够；细节页只在需要时打开。看环境，不据此下单。',
    links: [
      { path: '/watch', label: '观察盘', short: '宏观、全球、A股一页看完', desc: '宏观阶段与关键读数、全球主要指数与商品汇率、A 股涨跌停与资金流向，一页看完' },
      { path: '/invest/strategy', label: '综合策略', short: '宏观 + 股市：仓位怎么定', desc: '把宏观攻守和市场雷达合在一起看，直接回答现在怎么做、处在什么位置、为什么、什么情况下要动；仓位按宏观档位定，雷达的冷热决定这个阶段具体怎么做；附九种状态的历史表现与研究记录', minor: true },
      { path: '/invest/macro-posture', label: '宏观攻守', short: '现在该进攻还是防守', desc: '参考九位宏观投资人公开方法提炼的美股综合攻守指标：五档仓位、置信度、距离改判，拿不准的指标分级放外圈；规则公开，附 1973 年以来回测', minor: true },
      { path: '/invest/market-radar', label: '市场雷达', short: '自建：估值、拥挤度与宽度', desc: '自建的指标体系，只从股市自身看冷热：流动性、估值、仓位与拥挤度、交易结构、盈利五个维度，每项给出读数、历史百分位与冷热；冷热的历史表现与综合分检验', minor: true },
      { path: '/monitor', label: '宏观温度', short: '中美港宏观读数与牛熊周期', desc: '中美港经济温度、牛熊周期六维证据、周月趋势与复盘记录', minor: true },
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
      { path: '/earnings', label: '财报前瞻', short: '财报日、预期与待验证', desc: '公司库未来六周财报日历（盘前 / 盘后、是否确认）、一致预期与近四季超预期幅度、已公布结果，附站内评级、三情景与「这次要验证什么」' },
      { path: '/invest/national-team', label: '国家队持仓', short: '汇金证金社保持仓变化', desc: '汇金、证金、社保等持有哪些 A 股：按机构、行业、个股看持仓与季度变化' },
    ],
  },
  {
    id: 'candidates',
    title: '候选池',
    hint: '研究筛出来的公司和你自己挑的公司放在一起，逐家估值、跟踪价格条件。',
    links: [
      { path: '/candidates', label: '候选池', short: '我的候选与研究筛出', desc: '我的候选池（备注、排序、云同步）与按历史情景门槛筛选的研究公司，一键进入估值、DCF 与网格' },
      { path: '/radar', label: '机会雷达', short: '价值回归与快速增长短名单', desc: '先按林奇分类，再分两条线筛：价值回归看正常盈利与 DCF 买入参考价，快速增长看增速持续与 PE 压力条件，护城河与财务稳健加减分；周期型与困境反转型不进主线。每日更新，可一键加入候选池' },
    ],
  },
  {
    id: 'tools',
    title: '工具与参考',
    hint: '估值看价格贵不贵，网格管买卖节奏，ETF 地图查选品。从候选池进入会自动带上公司。',
    links: [
      { path: '/invest/comprehensive-valuation', label: '综合估值', short: '四维方法、情景测算与研究卡', desc: '资产质量、交叉估值、预期差与风险预算；三情景收益及赔率测算，导出研究卡' },
      { path: '/invest/macro-masters', label: '宏观大师', short: '偏攻还是偏守，九位怎么看', desc: '先给本站按公开数据归纳的当前位置：短线偏攻还是偏守、处在什么阶段、什么情况会改判；再对照德鲁肯米勒、达利欧、马克斯、都铎·琼斯、茨威格、格兰瑟姆、索罗斯、邓普顿、科斯托拉尼各自的方法、指标与可靠性。大师读数是本站映射，未经回测证实；综合攻守结论见宏观攻守页，不构成买卖建议' },
      { path: '/invest/top-masters', label: '顶级投资人', short: '六位顶级投资人怎么看周期', desc: '从九位宏观投资人中按可核对的长期业绩选出德鲁肯米勒、索罗斯、邓普顿、都铎·琼斯、达利欧、马克斯六位：各自的业绩与来源、怎么看周期、按其方法现在怎么看，以及普通股票投资者能学什么、不要模仿什么。读数为本站映射，不构成买卖建议' },
      { path: '/invest/ai-token-economics', label: 'AI 降价与利润', short: 'Token 用量、降价与毛利', desc: 'Ramp 企业样本的 Token 用量、支出与价格变化，OpenAI / Anthropic 收入集中度、单位毛利敏感性与跟踪清单；数据整理自 AI 对话，待独立核实' },
      { path: '/invest/fundamental-quant', label: '基本面量化', short: '书籍方法、因子与策略验证', desc: '以《投资策略实战分析》为起点的基本面量化方法库：因子口径、策略草案、林奇分类衔接与 A 股验证路径' },
      { path: '/invest/factor-lab', label: '因子实验室', short: '三市场因子挖掘与回测', desc: '长期因子挖掘的研究基建：三个市场的数据、引擎校验、试验登记簿与锁箱护栏、每一轮挖掘的进度和候选；通过检验也不自动加入综合策略，不构成买卖建议' },
      { path: '/valuation', label: '估值工作台', short: '自动取财报，六法三情景', desc: '连接本机估值服务，自动采集财报，六方法三情景估值与报告导出' },
      { path: '/dcf', label: 'DCF 计算器', short: '输入股票一键估算', desc: '输入名称或代码自动取财报估算合理价、三情景与买入参考价，可逐项调整假设并保存记录' },
      { path: '/invest/index-valuation', label: '指数估值', short: '各指数估值分位与股债息差', desc: '美股、A 股、港股主要指数离高点多远、价格与市盈率的历史分位、估值热力图，以及沪深300与标普500的股债息差' },
      { path: '/index-panorama/', label: '指数全景', short: 'A股港股美股指数估值分位', desc: 'A 股、港股、美股宽基与行业主题指数的点位与估值分位，详情附已核实相关 ETF；可加十字参考线；静态数据包，工作日可刷新' },
      { path: '/grid-trading', label: '网格交易', short: 'A 股 / ETF 网格回测', desc: 'A 股与 ETF 网格模拟、回测与记录' },
      { path: '/money-freedom', label: '财富自由计算器', short: '多少钱可以财富自由', desc: '480X + K×n + M + H 估算一生所需，结合储蓄与收益率推算自由年龄，并对照 4% 法则' },
      { path: '/invest/etf', label: 'ETF 流派地图', short: '各类 ETF 与主要风险', desc: '宽基、因子、主题、债券、商品等流派的主要 ETF 与风险' },
      { path: '/industry-etf', label: 'ETF 清单', short: '宽基与行业 ETF 选品', desc: '宽基首选与 7 个行业组共 59 只 ETF，附趋势备注与独立分析笔记' },
      { path: '/notes', label: '研究笔记', short: 'ETF 估值与趋势分析', desc: '逐只 ETF 的估值、权重、趋势与失效条件分析笔记' },
      { path: '/invest/bond-fund-report', label: '债基研究报告', short: '1—3 年持有的债基梳理', desc: '2026 年 10 月债券基金报告原文：中短债、纯债与二级债基的历史数据和风险提示' },
      { path: '/invest/blogger-views', label: '博主观点整理', short: '公开视频逐条整理，仅作了解', desc: '财经博主公开视频的逐条整理：讲了什么、给了哪些规则、哪些无法核实。仅作了解，不是本站方法' },
    ],
  },
  {
    id: 'lab-observe',
    title: '实验观察',
    hint: '对照研究中的观察页，入口彼此独立；未验证，不是买卖指令。',
    links: [
      { path: '/lab/etf-flow', label: 'ETF 资金流', short: '全A/宽基申购净流入大周期', desc: '同花顺原口径全市场与宽基 ETF 日度申购净流入，叠加上证指数；实验观察，不是买卖指令' },
      { path: '/lab/etf-uptrend', label: 'ETF 主升浪', short: '名单·历史上涨区间·倒推历史', desc: '同花顺主升浪每日快照：趋势回踩、新入池、分类筛选、历史上涨区间与 AI 原因、倒推历史；来源非自有模型，观察中' },
      { path: '/lab/etf-watch-pool', label: '行业观察池', short: '高波动行业 ETF 只看信号', desc: '研究导出的行业观察池：只显示历史对照与方案标签，不并入复盘、不发提醒' },
      { path: '/lab/etf-macd-good', label: '创业板择时优选', short: 'Y1+创业板择时研究名单', desc: '研究筛出的创业板择时优选 ETF；独立入口，不默认写入复盘' },
      { path: '/lab/etf-hs300-timing', label: '沪深300择时优选', short: '只认金叉+沪深300择时名单', desc: '研究筛出的沪深300择时优选 ETF；独立入口，不默认写入复盘' },
      { path: '/lab/etf-signal-plans', label: '三方案回测', short: '创业板/沪深300/纯MACD', desc: '对单只 ETF 跑三套研究口径波段方案的全历史与逐年回测；不并入网格主流程' },
      { path: '/lab/etf-timing', label: '择时实验', short: '择时＋只认金叉影子记录', desc: '一条 ETF 择时规则的样本外与影子运行观察；未验证，不是买卖指令' },
      { path: '/lab/portfolio-rebalance', label: '组合再平衡回测', short: '目标权重、偏离再平衡与大跌切换', desc: '选几只美股设目标权重，对比不动、动态平衡、等权与纳指 100；支持大跌时分步切换稳定股；历史回测，不是买卖指令' },
    ],
  },
  {
    id: 'third-party',
    title: '三方平台',
    hint: '参照第三方 App 的功能做的页面，数据来自公开行情，与这些平台官方无关。',
    links: [
      { path: '/market-mood', label: '开盘啦', short: '照开盘啦做的市场情绪页', desc: '收盘后的短线情绪：综合强度、涨跌分布、涨停与连板晋级、活跃股、大幅回撤、风向标、权重与融资余额' },
      { path: '/ths-mood', label: '同花顺', short: '照同花顺做的市场情绪页', desc: '收盘后的情绪指数与情绪状态、涨跌分布、盘面评分与强弱指数、短线风向标、涨停封成比、涨停分析与近 10 日涨停数' },
      { path: '/jixing', label: '今天几星', short: '照「今天几星」做的估值星级页', desc: '参照银行螺丝钉的小程序：本站自算的市场星级与历史星级、A 股指数估值表、港股与全球指数估值、牛熊信号板' },
    ],
  },
  {
    id: 'related',
    title: '相关',
    links: [
      { path: '/ai/ai-skills', label: 'AI 投研 Skills', desc: '任务深挖、开发协作、投资分析、视频创作与小说写作 Skills 的介绍和下载包' },
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
  { path: '/invest/start', label: '从这里开始', group: '投资 · 规则', desc: '新手入门：5 分钟自测该不该投、走哪条路线（先打底 / 省心 / 结合 / 研究），了解定投与检查日；答案只存在本机' },
  { path: '/life/human-3', label: 'Human 3.0 人生规划', group: '自由之路', desc: '心智、身体、精神、事业四象限访谈与90天行动计划' },
  { path: '/daily-analysis/legacy', label: '每日分析 · 历史旧版', group: '投资 · 历史旧版', desc: '原有手工复盘、导入导出与云同步', archived: true },
  { path: '/first-book/slow-is-fast', label: '书的目录', group: '投资 · 规则', desc: '《正念投资》目录与章节' },
  { path: '/grid-trading/records', label: '网格记录', group: '投资 · 工具', desc: '已保存的网格模拟与回测记录' },
  { path: '/etf-review', label: 'ETF 复盘', group: '投资 · 工具', desc: '自选 ETF 分组观察与每日复盘笔记，数据保存在本机浏览器' },
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

/** 工作台卡片用短说明（≤18 字），不靠省略号截断长 desc */
const shortOf = (path: string, fallback: string): string => {
  const link = INVEST_GROUPS.flatMap(g => g.links).find(l => l.path === path)
  return link?.short ?? fallback
}

export const WORKBENCH_TOOLS: WorkbenchTool[] = [
  { path: '/candidates', label: '候选池', desc: shortOf('/candidates', '我的候选与研究筛出') },
  { path: '/research-notes', label: '公司研究', desc: shortOf('/research-notes', '四个市场的公司库') },
  { path: '/valuation', label: '估值工作台', desc: shortOf('/valuation', '自动取财报，六法三情景') },
  { path: '/dcf', label: 'DCF', desc: shortOf('/dcf', '输入股票一键估算') },
  { path: '/grid-trading', label: '网格交易', desc: shortOf('/grid-trading', 'A 股 / ETF 网格回测') },
  { path: '/watch', label: '观察盘', desc: shortOf('/watch', '宏观、全球、A股一页看完') },
  { path: '/knowledge', label: '知识图谱', desc: '知识库与笔记关系' },
  { path: '/first-book', label: '我的书', desc: shortOf('/first-book', '《正念投资》全文与目录') },
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

/** ⌘K 公司索引的一条（public/data/company-index.json，由 scripts/build-company-index.mjs 生成） */
export interface CompanyIndexEntry {
  c: string // 代码
  n: string // 名称
  m: 'us' | 'ndx' | 'adr' | 'hk' | 'cn'
  s?: string // 板块
  p?: string // 拼音首字母（仅含汉字的名称，构建时生成，如 txkg）
  q?: string // 全拼，无声调无空格（如 tengxunkonggu）
}

export const COMPANY_MARKET_LABEL: Record<CompanyIndexEntry['m'], string> = { us: '标普500', ndx: '纳指100', adr: '美股非标普', hk: '港股', cn: 'A股' }

export const companyPath = (e: Pick<CompanyIndexEntry, 'c' | 'm'>): string => `/research-notes/${e.m}/${encodeURIComponent(e.c)}`

const stripZeros = (s: string): string => s.replace(/^0+(?=.)/, '')

/**
 * 代码精确 > 代码前缀 > 名称前缀 > 名称包含 > 拼音首字母（精确 > 前缀）> 全拼（精确 > 前缀 > 包含）；不分大小写。
 * 纯数字查询对港股去掉前导零再比（700 / 0700 / 00700 都命中 00700）。
 * 拼音只对 2 个及以上纯字母的查询生效（可带空格，如 teng xun），排在代码和名称命中之后，
 * 所以 aapl 这类美股代码仍是代码命中排第一；全拼包含（maotai → 贵州茅台）至少 3 个字母，免得太散。
 */
export function searchCompanies(query: string, entries: CompanyIndexEntry[], limit = 8): CompanyIndexEntry[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const digits = /^\d+$/.test(q)
  const py = /^[a-z\s]+$/.test(q) ? q.replace(/\s+/g, '') : ''
  const usePinyin = py.length >= 2
  const scored = entries.flatMap((e, index) => {
    const code = e.c.toLowerCase()
    const name = e.n.toLowerCase()
    const codeQ = digits && e.m === 'hk' ? stripZeros(q) : q
    const codeV = digits && e.m === 'hk' ? stripZeros(code) : code
    let rank = codeV === codeQ ? 0 : codeV.startsWith(codeQ) ? 1 : name.startsWith(q) ? 2 : name.includes(q) ? 3 : -1
    if (rank < 0 && usePinyin) {
      rank = e.p === py ? 4 : e.p?.startsWith(py) ? 5 : e.q === py ? 6 : e.q?.startsWith(py) ? 7 : py.length >= 3 && e.q?.includes(py) ? 8 : -1
    }
    return rank < 0 ? [] : [{ e, index, rank }]
  })
  return scored.sort((a, b) => a.rank - b.rank || a.index - b.index).slice(0, limit).map(s => s.e)
}
