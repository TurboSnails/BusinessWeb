// 入口页静态内容：9 道题、理由、路线清单（稳定 stepId）、术语与图例。
// 只引用书章节与站内已有路由；不含行情、金额或具体产品代码。
// 措辞原则：只描述书里的条件与做法，不说「批准 / 可以投 / 推荐」；书中案例数字标明是案例。
import type { Answer, Qid, Route } from './types'

/* ───────── 书章节链接 ───────── */

export const BOOK = {
  opening: '开篇-美好的愿望.md',
  ch7: '第7章-配置优先.md',
  base: '专题-家庭财务底座.md',
  ch8: '第8章-动态平衡.md',
  ch9: '第9章-参考方案.md',
  ch10: '第10章-标普500与纳指100落地.md',
  ch18: '第18章-我的投资选择.md',
  ch19: '第19章-总纲.md',
  ch23: '第23章-能力圈与护城河.md',
  ch28: '第28章-估值.md',
  ch33: '第33章-组合搭配.md',
  ch34: '第34章-怎么拿住.md',
  ch35: '第35章-什么时候卖.md',
  ch36: '第36章-仓位与纪律.md',
  ch37: '第37章-犯错与复盘.md',
  appC: '附录C-年度操作日历.md',
  appI: '附录I-术语表.md',
} as const

/**
 * 一处书中出处。section 是该章第几个「## 」标题（从 0 起），阅读页据此生成 #chapter-section-N 锚点；
 * heading 是该标题的开头文字，content.test 会逐条核对 public/first-book 下的原文，防止章节改动后锚点错位。
 */
export interface ChapterRef {
  file: string
  label: string
  section?: number
  heading?: string
}

const ref = (file: string, label: string, section?: number, heading?: string): ChapterRef => ({ file, label, section, heading })

export const REF = {
  // 阅读页加载后不一定停在锚点，所以链接文字直接写明是第几节
  openingFourSteps: ref(BOOK.opening, '开篇第五节「如果只能做一件事」', 5, '五、如果只能做一件事'),
  openingFirstWeek: ref(BOOK.opening, '开篇 · 第一周的三件事', 7, '怎样读这本书'),
  s7_1: ref(BOOK.ch7, '7.1', 0, '7.1'),
  s7_2: ref(BOOK.ch7, '7.2', 1, '7.2'),
  s7_8: ref(BOOK.ch7, '7.8 五条红线', 7, '7.8'),
  baseOrder: ref(BOOK.base, '家庭财务底座 · 顺序', 0, '底座.1'),
  baseDebt: ref(BOOK.base, '家庭财务底座 · 负债', 2, '底座.3'),
  baseGoals: ref(BOOK.base, '家庭财务底座 · 按日期分开装', 4, '底座.5'),
  s8_2: ref(BOOK.ch8, '8.2', 1, '8.2'),
  s8_3: ref(BOOK.ch8, '8.3', 2, '8.3'),
  s8_6: ref(BOOK.ch8, '8.6', 6, '8.6'),
  s9_1: ref(BOOK.ch9, '9.1', 0, '9.1'),
  s9_4: ref(BOOK.ch9, '9.4', 3, '9.4'),
  s9_5: ref(BOOK.ch9, '9.5', 4, '9.5'),
  s9_9: ref(BOOK.ch9, '9.9', 8, '9.9'),
  s9_10: ref(BOOK.ch9, '9.10', 9, '9.10'),
  s10_1: ref(BOOK.ch10, '10.1', 0, '10.1'),
  s10_7: ref(BOOK.ch10, '10.7', 6, '10.7'),
  s10_9: ref(BOOK.ch10, '10.9', 8, '10.9'),
  s18_1: ref(BOOK.ch18, '18.1', 0, '18.1'),
  s18_9: ref(BOOK.ch18, '18.9', 8, '18.9'),
  s18_10: ref(BOOK.ch18, '18.10', 9, '18.10'),
  ch19: ref(BOOK.ch19, '第19章'),
  ch23: ref(BOOK.ch23, '第23章'),
  ch28: ref(BOOK.ch28, '第28章'),
  s33_1: ref(BOOK.ch33, '33.1', 0, '33.1'),
  s33_2: ref(BOOK.ch33, '33.2', 1, '33.2'),
  s33_3: ref(BOOK.ch33, '33.3', 2, '33.3'),
  s34_1: ref(BOOK.ch34, '34.1', 0, '34.1'),
  ch35: ref(BOOK.ch35, '第35章'),
  s36_4: ref(BOOK.ch36, '36.4', 3, '36.4'),
  s36_5: ref(BOOK.ch36, '36.5', 4, '36.5'),
  s37_2: ref(BOOK.ch37, '37.2', 1, '37.2'),
  s37_4: ref(BOOK.ch37, '37.4', 3, '37.4'),
  s37_5: ref(BOOK.ch37, '37.5', 4, '37.5'),
  s37_7: ref(BOOK.ch37, '37.7', 6, '37.7'),
  appC: ref(BOOK.appC, '附录C'),
  appI: ref(BOOK.appI, '附录I 术语表'),
} satisfies Record<string, ChapterRef>

/** 与站内其他书链一致：/first-book/read/<encodeURIComponent(file)>[#chapter-section-N] */
export const chapterHref = (r: ChapterRef): string =>
  `/first-book/read/${encodeURIComponent(r.file)}${r.section !== undefined ? `#chapter-section-${r.section}` : ''}`

/* ───────── 术语（白话）：结果卡里第一次出现时就地展开，页底也有完整列表 ───────── */

export const TERMS = {
  activeCap: { term: '主动额度', text: '允许自己研究个股的资金上限，按参考总额的百分比算；是上限，可以为 0，不需要用完。' },
  referenceTotal: { term: '参考总额', text: '统一管理的金融资金：配置底仓 + 主动额度 + 备用金（书 9.1、7.4）；已知的近期支出先排除在外，自住房不计入。备用金算在这个分母里，但不能投入股票。例如参考总额 20 万元，5% 就是 1 万元。' },
  core: { term: '底仓', text: '长期的主要部分：靠事先定的比例和检查日拿着的宽基指数基金与债券部分，不需要判断个股。' },
  threeQuestions: { term: '三问', text: '愿意承受（看到亏损时心理和行为）、能够承受（亏了还付得起生活和合同义务）、需要承受（目标是否真需要这么大的风险）；取三者里最低的那一档（7.2、9.10）。' },
  broadIndex: { term: '宽基指数基金', text: '跟踪沪深 300、标普 500 这类覆盖很多公司的指数的基金，不押单个行业或公司。' },
} as const

/* ───────── 9 道题（边界无重叠、无空档） ───────── */

export interface Question {
  id: Qid
  title: string
  hint?: string
  options: Array<{ value: Answer; label: string }>
  refs: ChapterRef[]
}

export const QUESTIONS: Question[] = [
  {
    id: 'q1',
    title: '不算投资的钱，你手头的现金能撑几个月的必要开支？',
    hint: '必要开支：房租或房贷、吃饭、保险。手头现金要先扣掉 1 年内确定要花的钱（学费、装修），再算能撑几个月。',
    options: [
      { value: 'a', label: '不到 3 个月' },
      { value: 'b', label: '3 个月到不足 6 个月' },
      { value: 'c', label: '6 个月及以上' },
    ],
    refs: [REF.openingFourSteps, REF.s7_1],
  },
  {
    id: 'q2',
    title: '你现在有信用卡分期、网贷这类高息欠款吗？或者打算借钱来投资？',
    hint: '信用卡分期、消费贷、网贷算高息；正常的房贷、公积金贷款不算。',
    options: [
      { value: 'a', label: '有' },
      { value: 'b', label: '没有' },
    ],
    refs: [REF.baseDebt, REF.s7_8],
  },
  {
    id: 'q3',
    title: '准备投资的这笔钱，最早什么时候可能要用？',
    hint: '比如退休后的生活费、买房首付、孩子学费。3 年内要用的钱，书里放在现金与短期低风险资产，不放股票类资产（家庭财务底座 · 按日期分开装）。',
    options: [
      { value: 'a', label: '不到 3 年' },
      { value: 'b', label: '3 年到不足 5 年' },
      { value: 'c', label: '5 年及以上' },
    ],
    refs: [REF.baseGoals, REF.s7_2, REF.s9_10],
  },
  {
    id: 'q4',
    title: '扣掉应急金和近期用款后，能长期放着的钱大约有多少？',
    hint: '只算 3 年内都不会用到的那部分，不是你的全部存款；按人民币等值估一个档位即可，本页只记档位，不记金额。',
    options: [
      { value: 'a', label: '不到 1 万元' },
      { value: 'b', label: '1 万到不足 10 万元' },
      { value: 'c', label: '10 万到不足 100 万元' },
      { value: 'd', label: '100 万元及以上' },
    ],
    refs: [REF.s9_9],
  },
  {
    id: 'q5',
    title: '假如账户一年里跌了 30%，你最可能怎么做？',
    options: [
      { value: 'a', label: '受不了，会卖掉' },
      { value: 'b', label: '难受，但不动' },
      { value: 'c', label: '经历过类似下跌，当时按计划把比例调回了目标' },
      { value: 'd', label: '没经历过，不确定' },
    ],
    refs: [REF.s7_2, REF.s18_1],
  },
  {
    id: 'q6',
    title: '每周你愿意、并且真能拿出多少时间管投资？',
    options: [
      { value: 'a', label: '每周不到 1 小时' },
      { value: 'b', label: '每周 1 小时到不足 2 小时' },
      { value: 'c', label: '每周 2 小时到不足 5 小时' },
      { value: 'd', label: '每周 5 小时及以上' },
    ],
    refs: [REF.s18_9],
  },
  {
    id: 'q7',
    title: '你能看懂一家公司的利润表和现金流量表，或者对某个行业的生意有一线了解吗？',
    hint: '利润表看公司赚了多少，现金流量表看钱实际进出多少；看不懂很正常。',
    options: [
      { value: 'a', label: '都不能' },
      { value: 'b', label: '一点点' },
      { value: 'c', label: '能，而且有熟悉的行业' },
    ],
    refs: [REF.s18_1],
  },
  {
    id: 'q8',
    title: '过去一年，你有没有因为追涨、听消息或者频繁看账户，做过事后后悔的买卖？',
    options: [
      { value: 'a', label: '经常' },
      { value: 'b', label: '偶尔' },
      { value: 'c', label: '几乎没有（已经投资一年以上）' },
      { value: 'd', label: '还没开始投资，或投资不足一年' },
    ],
    refs: [REF.s34_1, REF.s37_2],
  },
  {
    id: 'q9',
    title: '最近有没有人向你承诺收益、拉你进「老师带单」群，或者让你把钱转到别人账户？',
    options: [
      { value: 'a', label: '有' },
      { value: 'b', label: '没有' },
    ],
    refs: [REF.s7_8],
  },
]

export const QIDS: Qid[] = QUESTIONS.map(q => q.id)

export const allowedAnswers = (qid: Qid): Answer[] => QUESTIONS.find(q => q.id === qid)?.options.map(o => o.value) ?? []

/* ───────── 理由（规则命中 → 文案 + 出处）：只描述条件，不做资格认定 ───────── */

export interface Reason { text: string; refs: ChapterRef[] }

export const REASONS: Record<string, Reason> = {
  'foundation-emergency': {
    text: '应急金还不到 6 个月必要支出。书里的第一步是先把 6—12 个月的应急金和近期用款留出来，这部分不进市场。',
    refs: [REF.openingFourSteps, REF.s7_1],
  },
  'foundation-debt': {
    text: '有高息欠款，或打算借钱投资。先还高息欠款；用生活资金或借来的钱投资，是书里最想帮你避开的一件事。',
    refs: [REF.baseDebt, REF.s7_8],
  },
  'foundation-horizon': {
    text: '这笔钱 3 年内可能要用。书里把 3 年内要用的钱放在现金与短期低风险资产，不放股票类资产（包括宽基指数基金）。如果你还有 3 年以后才用的钱，可以按那笔钱重新做一次自测。',
    refs: [REF.baseGoals, REF.openingFourSteps, REF.s7_2],
  },
  'horizon-mid': {
    text: '这笔钱 3 到 5 年内可能动用。书中 9.10 把「五年内可能动用部分资金」列为最保守那一档的适用情形，越临近用钱越要从股票类资产里移出；所以这里不研究个股，主动额度为 0，比例仍由你按三问确认。',
    refs: [REF.s9_10, REF.baseGoals],
  },
  'small-amount': {
    text: '能长期放着的钱不到 1 万元。书中 9.9 这一档的第一步是先攒够应急金，产品上最多只配一只低费宽基指数基金（书中案例，不是必须照做的指令）；清单里的债基和定比例两步这一档可以先放一放。主动额度为 0。',
    refs: [REF.s9_9],
  },
  'amount-mid': {
    text: '能长期放着的钱在 1 万到 10 万元之间。书中这一档主动额度为 0 或极低，先确认自己能连续两年不看账户也不焦虑。',
    refs: [REF.s9_9],
  },
  'time-short': {
    text: '每周不到 2 小时。第一次做主动研究，书里建议先试跑连续 4 周、每周 2—4 小时；时间不够就先不研究个股。',
    refs: [REF.s18_9],
  },
  'ability-none': {
    text: '暂时看不懂财报，也没有熟悉的行业。先把长期的主要部分放在覆盖面广的指数上，研究能力可以以后再练。',
    refs: [REF.s18_1, REF.s9_10],
  },
  'behavior-sell': {
    text: '跌 30% 会卖掉。这是「愿意承受」偏低的信号：比例要由你按三问定得更保守（股票占比更低），先不谈研究个股。',
    refs: [REF.s7_2],
  },
  'behavior-unknown': {
    text: '还没经历过大跌，不确定自己会怎么做。书里看的是行为证据，不是性格标签；没有证据时按保守处理，比例定得低一些，先不研究个股。',
    refs: [REF.s18_1, REF.s7_2],
  },
  'behavior-chase': {
    text: '过去一年经常因为追涨、听消息或频繁看账户，做了后悔的买卖。先用检查日和冷静期管住手，再谈研究个股。',
    refs: [REF.s34_1, REF.s37_2, REF.s37_5],
  },
  'eligible-combined': {
    text: '按你的回答，资金、时间、能力和行为都没有触发先打底或省心的条件（这不是资格审核）。仍以底仓为主；书中给的起点上限是参考总额的 5%，也可以为 0。',
    refs: [REF.s9_9, REF.s33_1],
  },
  'newbie-no-record': {
    text: '还没开始投资或不足一年。没有交易记录不等于守得住纪律，书里看的是行为证据，所以本页最多给到结合路线。',
    refs: [REF.s18_1, REF.s34_1],
  },
  'research-ready': {
    text: '每周 5 小时及以上、有熟悉的行业、过去一年几乎没有后悔的买卖：按本页依据书 18.9、9.4、33.1 做的保守判断，你的回答可以先试研究路线（这是本页的规则，不是书中的硬性条件，也不是能力认证）。仍以底仓为主，书中给的起点上限同样是 5%。',
    refs: [REF.s18_9, REF.s9_4, REF.s33_1],
  },
  'large-amount': {
    text: '能长期放着的钱在 100 万元及以上。金额变大后，书里说最大的新风险是过度自信和渠道集中，不是市场波动。',
    refs: [REF.s9_9],
  },
}

/* ───────── 路线 ───────── */

export const ROUTE_INFO: Record<Route, { title: string; badge: string; summary: string }> = {
  foundation: {
    title: '先打底',
    badge: '先打底 · 暂不进市场',
    summary: '先把要用的钱留出来、把高息欠款还掉。这一步做完之前，不需要选任何产品。',
  },
  simple: {
    title: '省心',
    badge: '省心 · 不研究个股（主动额度 0）',
    summary: '这条路线里，长期的主要部分通常放在宽基指数基金和债券基金上，比例由你自己定；平时少看账户，按检查日核对。这不是让你现在就去买。',
  },
  combined: {
    title: '结合',
    badge: '结合 · 底仓为主',
    summary: '先把省心路线的底仓与检查日想清楚，再用很小的上限练习研究一家公司。这不是让你现在就去买。',
  },
  research: {
    title: '研究',
    badge: '研究 · 仍以底仓为主',
    summary: '在结合路线基础上扩大研究范围；额度是上限，不是要用完的任务。这不是让你现在就去买。',
  },
}

/** 已经持有股票或基金的人：结果不是清仓指令（33.3、37.5、8.2） */
export const EXISTING_HOLDINGS = {
  summary: '已经持有股票或基金？这个结果不是让你马上卖掉',
  points: [
    '自测结果说的是以后怎么安排，不是对现有持仓的买卖指令；「不研究个股 / 主动额度 0」也不是让你把现有持仓全部卖掉。',
    '先把现有持仓列成一张表：每只的买入理由、占参考总额的比例、这笔钱什么时候要用。',
    '到第一个检查日再逐只核对、按事先写好的条件处理，不需要一次处理完；书里改组合的顺序是先改金额、再检查假设。',
    '亏损时急着全部卖出，和追涨一样是冲动交易：先登记，等冷静期过了再决定。资金安全问题和必要用款照常及时处理。',
  ],
  refs: [REF.s33_3, REF.s8_2, REF.s37_5],
}

/* ───────── 路线清单：stepId 稳定，跨路线共用同一步时用同一个 id ───────── */

export interface StepLink { to: string; label: string }
export interface Step {
  id: string
  title: string
  detail?: string
  links?: StepLink[]
  refs?: ChapterRef[]
}
export interface StepGroup { id: string; title: string; note?: string; steps: Step[] }

/** 链到现有页面时如实说明：那些页面的数字与状态是站长的观察记录或作者示例，不是推荐 */
const LINK_ETF: StepLink = { to: '/industry-etf#broad-etf', label: '宽基 ETF 清单（站长观察记录，不是推荐）' }
const LINK_PLAN_TEMPLATES: StepLink = { to: '/investment-plan-2026?tab=allocation', label: '投资计划页的三档模板（默认的均衡档和金额是作者示例，不是给你的比例）' }
const LINK_CANDIDATES_NOTE = '「研究筛出」「可买卖」是站长的研究状态，不是建议'

const STEP_FOUR_STEPS: Step = {
  id: 'read-four-steps',
  title: '读开篇第五节「如果只能做一件事」的四步',
  detail: '先留出要用的钱 → 长期钱再研究少数能理解的资产 → 定检查日 → 其余暂缓。',
  refs: [REF.openingFourSteps],
}
const STEP_EMERGENCY: Step = {
  id: 'emergency-fund',
  title: '算应急金：每月必要支出 × 6—12 个月',
  detail: '用本页下方的临时算式，只在这台设备的内存里算，不保存。',
  links: [{ to: '#start-emergency', label: '去算一算' }],
  refs: [REF.openingFourSteps, REF.s7_1],
}
const STEP_RED_LINES: Step = {
  id: 'red-lines',
  title: '读五条红线：承诺收益、转账给别人、代你操作、带单、用生活资金或借钱投资',
  refs: [REF.s7_8],
}
const STEP_REVIEW: Step = {
  id: 'review-date',
  title: '定检查日，加入自己的日历',
  detail: '每季度或每半年核对一次资金用途、产品与比例。',
  links: [{ to: '#start-review', label: '设检查日' }],
  refs: [REF.openingFourSteps, REF.appC],
}

export const FOUNDATION_STEPS: StepGroup = {
  id: 'foundation',
  title: '先打底',
  steps: [
    STEP_FOUR_STEPS,
    STEP_EMERGENCY,
    {
      id: 'near-term-money',
      title: '把 3 年内确定要用的钱单独放好，放在现金与短期低风险资产，不进股票类资产',
      refs: [REF.baseGoals, REF.s7_1],
    },
    {
      id: 'debt-and-insurance',
      title: '查一遍保障是否够，再还高息欠款',
      detail: '书里的顺序是先补洞，再求收益（顺序不是铁律，按自己的情况调整）。',
      refs: [REF.baseOrder, REF.baseDebt],
    },
    STEP_RED_LINES,
    {
      id: 'redo-when-ready',
      title: '应急金攒够、欠款还清后，回来重做一次自测',
      links: [{ to: '#start-assessment', label: '回到自测' }],
    },
  ],
}

export const SIMPLE_STEPS: StepGroup = {
  id: 'simple',
  title: '省心路线',
  steps: [
    STEP_FOUR_STEPS,
    STEP_EMERGENCY,
    STEP_RED_LINES,
    {
      id: 'three-questions',
      title: '按「愿意 / 能够 / 需要承受」三问，自己定股票和债券的比例',
      detail: '取三者里最低的那一档。本页不替你判定保守、均衡或积极；拿不准时可以先暂存待核，不要默认各一半（开篇四步②）。',
      links: [LINK_PLAN_TEMPLATES],
      refs: [REF.s7_2, REF.s9_10],
    },
    {
      id: 'know-products',
      title: '认识产品：先看懂宽基指数基金跟踪什么指数',
      detail: '清单是站长的观察记录，不是购买推荐，也没有列债基。先看懂每只跟踪什么指数，费用点「基金档案」核对；技术面、网格两列省心路线不用看。书里建议权益以覆盖面广的 A 股宽基为主（9.10）。',
      links: [LINK_ETF, { to: '/invest/etf', label: 'ETF 投资指南' }],
      refs: [REF.s10_1, REF.s9_10],
    },
    {
      id: 'pre-trade-check',
      title: '如果决定开始投，下单前先逐项自查账户与交易条件',
      refs: [REF.s10_9],
    },
    {
      id: 'contribution-budget',
      title: '如果打算定投，先定每月（或每季）能拿出的上限，写在自己的备忘里',
      detail: '单次金额太小、被最低佣金吃掉一截时，可以改成按季。',
      refs: [REF.s10_7, REF.s9_9],
    },
    STEP_REVIEW,
    {
      id: 'check-then-act',
      title: '检查日先更新金额，再按事先选好的方式决定要不要调整',
      detail: '书里有两种触发方式：到期就调回目标，或偏离超过阈值才调（8.2）；本页按开篇四步③：检查日核对，达到事先定的条件才调整。',
      links: [{ to: '/investment-plan-2026?tab=allocation', label: '投资计划页 · 再平衡检查（默认数字是作者示例）' }],
      refs: [REF.s8_2, REF.s8_3, REF.s8_6],
    },
    {
      id: 'cooling-off',
      title: '想临时买卖：先登记，等冷静期过了再决定（必要用款和资金安全问题照常处理）',
      links: [{ to: '/investment-plan-2026?tab=allocation&sec=discipline', label: '纪律与交易前检查' }],
      refs: [REF.s37_5],
    },
    {
      id: 'annual-review',
      title: '每年做一次复盘：收益之外，也核对现金流与时间',
      refs: [REF.s37_7],
    },
  ],
}

export const COMBINED_STEPS: StepGroup = {
  id: 'combined',
  title: '结合路线：练习研究一家公司',
  note: '先把上面省心路线的底仓和检查日想清楚，再做这一组。',
  steps: [
    {
      id: 'active-cap',
      title: '确认主动额度上限（书中起点 5%，可以为 0）',
      detail: '额度是上限，不是任务。书中案例的单只上限是参考总额的 4%—5%（分母是参考总额，不是主动额度）；起点 5% 时这几乎就是全部主动额度，不为凑数买入（36.5）。',
      refs: [REF.s9_5, REF.s9_9, REF.s33_1],
    },
    {
      id: 'lynch-two-lines',
      title: '学本站从林奇六类中选的两条主线（价值回归、快速增长）：先分类，再决定投不投、投多少',
      links: [{ to: '/research-notes', label: '公司研究 · 研究方法' }],
      refs: [REF.ch19],
    },
    {
      id: 'one-company',
      title: '只挑一家公司研究；站内的评级和结论卡是观察状态与研究记录，不是买卖指令',
      links: [{ to: '/research-notes', label: '公司研究（评级是观察状态，不是买卖指令）' }],
      refs: [REF.s18_9],
    },
    {
      id: 'decision-record',
      title: '把研究过的公司加入候选池，写下决策记录（为什么、看错的条件）',
      detail: `观察可以宽，但要能说清生意和主要风险才进观察池；观察不等于持仓（36.4）。候选池里${LINK_CANDIDATES_NOTE}。`,
      links: [{ to: '/candidates', label: `候选池（${LINK_CANDIDATES_NOTE}）` }],
      refs: [REF.s37_4, REF.s36_4],
    },
    {
      id: 'earnings-dates',
      title: '记下这家公司的财报日',
      links: [{ to: '/earnings', label: '财报前瞻' }],
      refs: [REF.appC],
    },
    {
      id: 'valuation-after-research',
      title: '研究做完、能解释经营假设后，再用估值工具（可选）',
      links: [{ to: '/dcf', label: 'DCF' }],
      refs: [REF.ch28],
    },
    {
      id: 'exit-criteria',
      title: '事先写好持有与卖出的条件，定期复盘；满足「不适合我」任一条判据，就考虑退出主动部分（不是退出投资）',
      refs: [REF.s18_10, REF.ch35],
    },
  ],
}

export const RESEARCH_STEPS: StepGroup = {
  id: 'research',
  title: '研究路线：扩大研究范围',
  note: '在结合路线的基础上增加；底仓仍是大头。',
  steps: [
    {
      id: 'research-shortlist',
      title: '用研究线索库找线索（线索不是推荐）',
      links: [
        { to: '/radar', label: '机会雷达（研究线索，不是推荐）' },
        { to: '/candidates?tab=research', label: `候选池 · 研究筛出（${LINK_CANDIDATES_NOTE}）` },
      ],
      refs: [REF.s36_4],
    },
    {
      id: 'moat-and-industry',
      title: '能力圈与护城河：先问「十年后它还在赚钱吗」',
      links: [{ to: '/industry-landscape', label: '产业格局' }],
      refs: [REF.ch23],
    },
    {
      id: 'portfolio-risk',
      title: '把研究持仓放回整个组合，检查共同风险',
      links: [{ to: '/investment-plan-2026?tab=allocation&sec=risk', label: '投资计划页 · 风险透视（默认数字是作者示例）' }],
      refs: [REF.s33_1, REF.s33_2],
    },
  ],
}

/** 路线 → 清单分组（结合 = 省心 + 结合；研究 = 省心 + 结合 + 研究） */
export const ROUTE_STEPS: Record<Route, StepGroup[]> = {
  foundation: [FOUNDATION_STEPS],
  simple: [SIMPLE_STEPS],
  combined: [SIMPLE_STEPS, COMBINED_STEPS],
  research: [SIMPLE_STEPS, COMBINED_STEPS, RESEARCH_STEPS],
}

export const ALL_STEP_IDS: string[] = [...new Set([FOUNDATION_STEPS, SIMPLE_STEPS, COMBINED_STEPS, RESEARCH_STEPS].flatMap(g => g.steps.map(s => s.id)))]

/* ───────── 这些先别开（省心 / 先打底） ───────── */

export const NOT_YET: Array<{ label: string; why: string }> = [
  { label: '每日分析、涨停分析', why: '每天的涨跌与题材，和检查日规则无关' },
  { label: '板块轮动', why: '轮动不是再平衡，别混在一起（8.5）' },
  { label: '机会雷达', why: '研究线索库，留给结合 / 研究路线' },
  { label: '全球行情脉搏', why: '看得越勤，看到下跌的次数越多，和检查日规则无关（34.1）' },
]

/* ───────── 可信度图例：来源类型与有效性是两回事，标识带文字（只列站内实际用到的标签） ───────── */

export const LEGEND: Array<{ label: string; text: string }> = [
  { label: '规则', text: '书里写明的做法与边界，例如应急金 6—12 个月、检查日核对。' },
  { label: '历史数据', text: '过去某段时间的统计，带日期与口径，不代表以后。' },
  { label: '自动数据', text: '脚本定时抓取的行情或公告，可能延迟或缺失；自动不等于可靠。' },
  { label: '仅观察', text: '放在那里看看，还没有足够证据支持据此行动。' },
  { label: '已舍弃', text: '试过、有具体证据说明不适合的方法，保留作对照。' },
  { label: '你填写的', text: '你自己在这台设备上填的数字，网站不核对它是否准确。' },
]

/* ───────── 术语（白话；详见附录I） ───────── */

export const GLOSSARY: Array<{ term: string; text: string }> = [
  { term: '应急金', text: '不算投资、随时能取出的钱，用来应付失业、看病这类意外；书里建议 6—12 个月的必要支出（书 7.1 叫「收入中断储备」）。' },
  { term: '近期用款', text: '已经确定日期的支出，比如学费、装修、首付；3 年内要用的不放股票类资产（书 7.1「已知近期支出」）。' },
  TERMS.referenceTotal,
  TERMS.core,
  TERMS.broadIndex,
  { term: '中短债 / 纯债基金', text: '主要买债券的基金，波动通常比股票小，但也会下跌，不能代替应急现金。' },
  { term: '定投', text: '按固定周期投入固定金额。价值在纪律，不在小额高频；先定预算再定频率。' },
  { term: '检查日', text: '事先定好的核对日期（每季度或每半年）。平时不用反复看账户；资金安全、重大产品公告和家庭用款变化仍要及时处理。' },
  { term: '再平衡', text: '比例偏离目标后调回。书里有两种触发：到期就调，或偏离超过阈值才调（8.2）；本页按开篇四步③：检查日核对，达到事先定的条件才调。' },
  { term: '相对偏离', text: '（当前占比 − 目标占比）÷ 目标占比。例如目标 20%、现在 24%，相对偏离是 (24−20)÷20＝20%，不是 4 个百分点。' },
  TERMS.activeCap,
  { term: '冷静期', text: '想临时买卖时，先等一段事先约定的时间再决定，例如 48 小时（书中示例参数，37.5）。' },
  TERMS.threeQuestions,
]

/* ───────── 合规声明 ───────── */

export const DISCLAIMER = '本页内容来自《正念投资》的规则整理，不构成投资建议，不推荐具体基金或股票，不承诺收益。'
export const RISK_NOTE = '任何投资都可能亏损，包括宽基指数基金和债券基金。自测结果只是阅读与准备的顺序，不是对你资金或资格的审核。'
export const RESULT_NOTE = '这是按书中规则整理的准备顺序，不是投资建议，也不是资格审核。'
export const PRIVACY_NOTE = '答案、清单和检查日只保存在这台设备的浏览器里，不上传、不进网址；自测、清单和检查日都不发送网络请求。'
/** 未到检查日时的统一说法（开篇四步③的例外） */
export const BETWEEN_CHECKS = '未到检查日，资金安全、重大产品公告和家庭用款变化仍要及时处理。'
