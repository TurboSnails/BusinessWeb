export type LabVerdict = 'strong' | 'recommend' | 'try' | 'experiment' | 'avoid'
export type LabStatus = '进行中' | '计划中' | '未开始' | '已暂停' | '已停止' | '不做'

export interface LabShowcaseItem {
  title: string
  desc: string
  path: string
}

export interface LabLogEntry {
  date: string
  did: string
  result: string
}

export interface LabDirection {
  slug: string
  title: string
  verdict: LabVerdict
  fit: 1 | 2 | 3 | 4 | 5
  status: LabStatus
  /** 卡片上的一句理由 */
  reason: string
  /** 详情页：为什么做 / 为什么不做 */
  why: string
  hoursPerWeek?: number
  startCost?: string
  limits?: { budget?: string; deadline?: string; stopWhen?: string }
  firstStep?: string
  /** 只记已经发生的事，没开始就留空 */
  logs: LabLogEntry[]
}

export const VERDICT_LABEL: Record<LabVerdict, string> = {
  strong: '强烈推荐',
  recommend: '推荐',
  try: '可以试',
  experiment: '实验',
  avoid: '不推荐',
}

// 只放已经做出来、能直接用的东西
export const LAB_SHOWCASE: LabShowcaseItem[] = [
  { title: '投资分析 Skill 包', desc: '三套投资分析 Skill 专家，可完整下载', path: '/invest/ai-tools' },
  { title: '公司估值', desc: '六方法三情景估值与报告导出', path: '/valuation' },
  { title: '网格交易', desc: 'ETF / 个股网格模拟、回测与记录', path: '/grid-trading' },
  { title: '这个网站', desc: '用 React 自己搭的个人站，本身就是第一个作品', path: '/about' },
]

// 顺序即同分时的展示顺序
export const LAB_DIRECTIONS: LabDirection[] = [
  {
    slug: 'ai-skills',
    title: 'AI 工具 / Skill / Agent',
    verdict: 'strong',
    fit: 5,
    status: '进行中',
    reason: '已有三套投资 Skill，新领域有先发优势',
    why: '把自己反复做的事写成 Skill、Agent 或 MCP，先给自己用，再公开分享。程序员加投资作者的组合刚好能做出别人做不出的专业 Skill，而且这个领域还很新。',
    hoursPerWeek: 3,
    startCost: '¥0',
    firstStep: '把三套投资 Skill 的使用反馈整理出来，挑最常用的一个做成可单独安装的版本。',
    logs: [
      { date: '2026-10-06', did: '发布三套投资分析 Skill 的介绍页与完整下载包', result: '已上线到「正念投资 › AI 工具」' },
    ],
  },
  {
    slug: 'indie-dev',
    title: '独立产品开发',
    verdict: 'strong',
    fit: 5,
    status: '进行中',
    reason: '程序员本行，第一个产品从书里长出来',
    why: '路线是：建站 → 正念投资 AI V0.1 → 公开验证。V0.1 输入一家公司，按书里的框架一步步提问：分类、产业、商业模式、护城河、财报、估值、周期、证伪条件，最后生成投资决策卡，不预测涨跌。',
    hoursPerWeek: 4,
    startCost: '¥0',
    limits: { stopWhen: '找不到 20 个愿意持续使用的真实用户，就回到框架本身重新想' },
    firstStep: '做出正念投资 AI V0.1 的最小版本，找 20 个真实用户试用。',
    logs: [
      { date: '2026-10-04', did: '个人网站改版为「正念生活」，按书重组栏目', result: '网站作为第一个作品上线' },
    ],
  },
  {
    slug: 'free-tools',
    title: '免费在线工具',
    verdict: 'recommend',
    fit: 4,
    status: '未开始',
    reason: '做一次长期获客，和书互相引流',
    why: '比如 FIRE / 400 万倒计时计算器、家庭财务体检、定投回测。工具解决一个具体问题，用的人会顺着找到书和其他作品。',
    hoursPerWeek: 2,
    startCost: '¥0',
    firstStep: '先做一个 FIRE 倒计时计算器：输入资产、储蓄率、预期收益，算出离目标还有几年。',
    logs: [],
  },
  {
    slug: 'digital-goods',
    title: '数字商品',
    verdict: 'recommend',
    fit: 4,
    status: '未开始',
    reason: '无库存、几乎不用客服',
    why: '书的电子版、投资计划 Notion / Excel 模板、Skill 完整包、小册子。做一次可以卖很多次，和个人定位最搭。',
    hoursPerWeek: 2,
    startCost: '¥0',
    firstStep: '把 2026 投资计划整理成一份可复制的模板，先免费发，看有多少人要。',
    logs: [],
  },
  {
    slug: 'blog',
    title: '博客',
    verdict: 'recommend',
    fit: 4,
    status: '未开始',
    reason: '沉淀自己的读者，也整理思路',
    why: '写 AI 编程实践、副业实验复盘、工具背后的思考。写作本身就是整理思路，文章也是其他方向的入口。',
    hoursPerWeek: 2,
    startCost: '¥0',
    firstStep: '每两周一篇，第一篇写这个 AI 实验室为什么这样分方向。',
    logs: [],
  },
  {
    slug: 'newsletter',
    title: 'Newsletter',
    verdict: 'recommend',
    fit: 3,
    status: '计划中',
    reason: '读者归自己，等有读者再开',
    why: '每月一封：实验进展加投资计划执行情况。读者是自己的，不受平台推荐影响。读者太少时发出去没有回应，所以放在博客之后。',
    hoursPerWeek: 1,
    startCost: '¥0',
    firstStep: '博客写满 6 篇后再开订阅。',
    logs: [],
  },
  {
    slug: 'video',
    title: '视频',
    verdict: 'try',
    fit: 3,
    status: '未开始',
    reason: '曝光大但很耗时，先做录屏 + 字幕',
    why: '视频平台曝光最大，但一条像样的视频至少 3 到 5 小时，和每周几小时的预算冲突。先用最低成本的形式试：工具演示录屏加字幕。',
    hoursPerWeek: 2,
    startCost: '¥0',
    limits: { deadline: '先做 5 条', stopWhen: '5 条之后看播放与反馈，没有起色就停' },
    firstStep: '录一条「公司估值」工具的使用演示。',
    logs: [],
  },
  {
    slug: 'dropshipping',
    title: '无货源电商',
    verdict: 'experiment',
    fit: 2,
    status: '未开始',
    reason: '和优势关系不大，限 3 个月 / ¥5000',
    why: '这个模式拼的是选品、价格战、平台规则和客服，很吃时间，利润也越来越薄，和程序员的优势关系不大。可以当一次实验来了解电商，但先定死边界。',
    hoursPerWeek: 3,
    startCost: '¥5000 以内',
    limits: { budget: '¥5000', deadline: '3 个月', stopWhen: '到期未盈利即停' },
    firstStep: '开始前先写好选品规则和每周记账表，再决定平台。',
    logs: [],
  },
  {
    slug: 'outsourcing',
    title: 'AI 外包接单',
    verdict: 'avoid',
    fit: 1,
    status: '不做',
    reason: '仍是拿时间换钱，和时间自主相反',
    why: '接单本质上是换一个老板拿时间换钱，需求和节奏都由别人定，正是离开全职工作想摆脱的东西。',
    logs: [],
  },
  {
    slug: 'content-farm',
    title: '代写 / 内容农场',
    verdict: 'avoid',
    fit: 1,
    status: '不做',
    reason: '损害个人品牌，平台规则风险高',
    why: '用 AI 批量产出低质内容换流量，短期也许有收入，但会损害个人品牌，平台规则一变就归零。',
    logs: [],
  },
  {
    slug: 'paid-signals',
    title: '付费投资群 / 荐股',
    verdict: 'avoid',
    fit: 1,
    status: '不做',
    reason: '违背书里“不荐股”，且有合规风险',
    why: '书的核心是不盯盘、不预测、不荐股。收费荐股既违背这个原则，又有证券投资咨询的合规风险。',
    logs: [],
  },
]

export function recommendedDirections(): LabDirection[] {
  // Array.prototype.sort 是稳定排序，同分保持数据里的顺序
  return LAB_DIRECTIONS.filter(d => d.verdict !== 'avoid').sort((a, b) => b.fit - a.fit)
}

export function avoidedDirections(): LabDirection[] {
  return LAB_DIRECTIONS.filter(d => d.verdict === 'avoid')
}

export function findDirection(slug: string): LabDirection | undefined {
  return LAB_DIRECTIONS.find(d => d.slug === slug)
}

export function labStats(): { works: number; running: number; stopped: number } {
  return {
    works: LAB_SHOWCASE.length,
    running: LAB_DIRECTIONS.filter(d => d.status === '进行中').length,
    stopped: LAB_DIRECTIONS.filter(d => d.status === '已停止').length,
  }
}
