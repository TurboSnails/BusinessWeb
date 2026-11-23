import { findDirection } from '../data/aiLab'
import { publishedManifest } from '../features/blog/generated-manifest'
import type { BlogEntry } from '../features/blog/catalog'

export const SITE_NAME = 'Live'
// canonical 始终指向主站（Vercel）；GitHub Pages 副本也会指向这里，避免重复收录
export const SITE_ORIGIN = (import.meta.env.VITE_SITE_URL as string | undefined) ?? 'https://business-web-black.vercel.app'

export interface RouteSeo {
  title: string
  description?: string
  /** 工具页、个人数据页不希望被收录 */
  noindex?: boolean
}

const DEFAULT_DESCRIPTION = '投资 · AI · 独立开发 · 自由生活。《正念投资》作者的长期实验。'

export const MACRO_MASTER_NAMES: Record<string, string> = {
  druckenmiller: '斯坦利·德鲁肯米勒',
  dalio: '瑞·达利欧',
  marks: '霍华德·马克斯',
  'tudor-jones': '保罗·都铎·琼斯',
  zweig: '马丁·茨威格',
  grantham: '杰里米·格兰瑟姆',
  soros: '乔治·索罗斯',
  templeton: '约翰·邓普顿爵士',
  kostolany: '安德烈·科斯托拉尼',
}

// 精确路径优先；其次按前缀匹配（最长前缀胜出）
const EXACT: Record<string, RouteSeo> = {
  '/': { title: 'Live｜投资 · AI · 独立开发 · 自由生活', description: DEFAULT_DESCRIPTION },
  '/invest': { title: '投资｜A 股与美股研究、方法与工具', description: '沪深 A 股与美股标普 500 的研究笔记、投资方法、ETF 指南与网格交易工具。' },
  '/invest/market-radar': { title: '我的市场雷达｜流动性、估值、拥挤度与交易结构', description: '自建的五维指标体系：流动性、估值、仓位与拥挤度、交易结构、盈利，各项读数与历史百分位，雷达档位与大师方案并排对照并公开回测；不构成买卖建议。' },
  '/invest/top-masters': { title: '六位顶级投资人怎么看周期｜业绩、方法与当前读数', description: '德鲁肯米勒、索罗斯、邓普顿、都铎·琼斯、达利欧、马克斯六位：公开业绩与来源、周期框架、按其方法的当前判断，以及股票投资者能学什么；不构成买卖建议。' },
  '/invest/macro-masters': { title: '宏观大师怎么看周期｜当前位置与九位的方法', description: '汇总当前周期阶段与短线偏攻或偏守的证据，并对照九位宏观投资人的思路、指标与可靠性；均为本站口径，不构成买卖建议。' },
  '/invest/macro-posture': { title: '宏观攻守｜现在该进攻还是防守', description: '参考九位宏观投资人公开方法提炼的美股综合攻守指标：五档仓位与置信度、距离改判、外圈分级指标，以及 1973 年以来的公开回测。' },
  '/ai/ai-skills': { title: 'AI Skills 工具库｜AI实验室', description: '可下载的 AI Skills：Orca 开发团队、投资分析、视频创作与小说写作，含安装方法和提示词示例。' },
  '/industry-etf': { title: 'ETF 与债券基金清单', description: '宽基、策略、商品、货币 ETF、场外债基与 7 个行业组 59 只行业 ETF，附日周月均线、MACD、RSI 技术面与研究备注。' },
  '/invest/start': { title: '从这里开始｜普通人投资入门自测', description: '5 分钟自测：先确认该不该投，再看适合先打底、省心、结合还是研究路线；定下检查日。答案只存在你的浏览器，不构成投资建议、不承诺收益。' },
  '/invest/my-plan': { title: '我的计划与持仓｜本机预算与检查日', description: '在本机记录家庭资金用途、三笔投资预算、配置类别与检查日；支持从旧记录预览导入。不构成投资建议、不承诺收益；服务器默认收不到本机计划。', noindex: true },
  '/invest/etf': { title: 'ETF 投资指南', description: 'ETF 的选择、定投与网格交易思路。' },
  '/invest/fundamental-quant': { title: '基本面量化｜书籍方法、因子与策略验证', description: '从《投资策略实战分析》出发，整理基本面量化方法、因子口径、策略研究卡及 A 股验证路径，与林奇式公司研究衔接。' },
  '/invest/bond-fund-report': { title: '债基研究报告｜1—3 年持有', description: '2026 年 10 月债券基金研究报告存档，整理中短债、纯债与二级债基的历史数据和风险。原文数据未逐条复核。', noindex: true },
  '/invest/national-team': { title: '国家队持仓｜汇金、证金、社保的 A 股持仓', description: '按报告期追踪中央汇金、证金公司、社保基金等持有的 A 股：机构、行业、个股持仓与季度变化。' },
  // 对他人公开视频的整理，含未核实的说法，不交给搜索引擎
  '/invest/blogger-views': { title: '博主观点整理', description: '财经博主公开视频的逐条整理，仅作了解。', noindex: true },
  '/ai': { title: 'AI 工作室｜独立开发与 AI 学习路线', description: '用 AI 做独立开发：学习路线、实验方向与工具笔记。' },
  '/blog': { title: '博客｜投资、AI 与自由生活', description: '关于投资的耐心、AI 的实践，和通往自由生活的每一步。' },
  '/ai/fullstack-roadmap': { title: 'AI 全栈学习路线', description: '从零到独立开发者的 AI 全栈学习计划。' },
  '/ai/dev-team': { title: 'dev-team 使用说明｜Orca 开发团队', description: 'Orca 开发团队 dev-team 的完整使用说明：安装、自检、项目配置、日常派工、交接与验证范围，含完整 ZIP 和原文下载。' },
  '/life/my-analysis': { title: '我的人生解析', description: '个人访谈结论，需密码解锁阅读。', noindex: true },
  '/life/human-3': { title: 'Human 3.0 人生规划', description: '逐题访谈，梳理心智、身体、精神、事业与90天行动。', noindex: true },
  '/life': { title: '自由之路', description: '自由生活的长期实验记录。' },
  '/about': { title: '关于', description: '《正念投资》作者，投资、AI 与独立开发的长期实验。' },
  '/pulse': { title: '市场脉搏', description: '每日市场情绪与宏观数据快照。' },
  '/investment-plan-2026': { title: '投资计划', description: '资产配置、纪律红线、风险阶段与产业趋势判断。' },
  '/investment-targets': { title: '美股观察池（已舍弃）', description: '未完成的占位页，已舍弃。观察池请按《正念投资》第 32、36 章自己建立。', noindex: true },
  '/mainland-investment-targets': { title: 'A 股观察池（存档）', description: '2026 年 1 月的 AI 主题标的清单存档，内容已过期，不构成投资建议。', noindex: true },
  '/daily-analysis': { title: '每日分析', description: '自动获取 A 股指数、成交额、涨跌停、连板梯队和股票排行榜，保留交易日快照。' },
  '/daily-analysis/legacy': { title: '每日分析 · 历史旧版', description: '原有手工复盘记录、导入导出与云同步。', noindex: true },
  '/limit-up-analysis': { title: '涨停板分析', description: '涨停板数据与题材轮动复盘。' },
  '/market-mood': { title: '开盘啦 · 市场情绪', description: '参照开盘啦市场情绪页，收盘后的 A 股短线情绪：综合强度、涨停表现、连板强度、活跃股与市场量能。' },
  '/market-mood/daban': { title: '开盘啦 · 打板', description: '参照开盘啦打板页：涨停、炸板、跌停、自然涨停、曾跌停、新股与竞价逐股列表，个股溢价基因。' },
  '/market-mood/lhb': { title: '开盘啦 · 龙虎榜', description: '参照开盘啦龙虎榜：每日上榜个股、买卖席位、机构与活跃营业部。' },
  '/market-mood/plates': { title: '开盘啦 · 板块题材', description: '参照开盘啦板块页：行业与概念排行、板块强度、题材涨停分布。' },
  '/market-mood/funds': { title: '开盘啦 · 资金', description: '参照开盘啦资金页：全市场与个股主力资金、行业资金流。' },
  '/market-mood/abnormal': { title: '开盘啦 · 异动监管', description: '参照开盘啦异动监管：偏离值与严重异动预警、停复牌、会不会上龙虎榜、盘中异动雷达。' },
  '/market-mood/review': { title: '开盘啦 · 复盘', description: '参照开盘啦复盘：赚钱效应、盘面亮点标签、亏钱效应、百日新高、涨跌停家数曲线。' },
  '/market-mood/rank': { title: '开盘啦 · 人气排行', description: '参照开盘啦榜单：人气榜、个股与板块区间排行、机构多日榜。' },
  '/market-mood/auction': { title: '开盘啦 · 竞价尾盘', description: '参照开盘啦竞价与尾盘：早盘竞价复盘、板块竞价、尾盘集合竞价。' },
  '/market-mood/disclosure': { title: '开盘啦 · 财报避雷', description: '参照开盘啦业绩与避雷：业绩披露日历与超预期、ST 与退市风险、股东人数、大宗交易、机构调研。' },
  '/market-mood/timeline': { title: '开盘啦 · 时间线', description: '参照开盘啦大盘直播与市场雷达：盘后还原的当日盘面时间线、板块异动与个股异动。' },
  '/market-mood/holders': { title: '开盘啦 · 持仓两融', description: '参照开盘啦资金与股东：融资融券个股排行、基金季度持仓变化、牛散追踪。' },
  '/market-mood/stock': { title: '开盘啦 · 个股', description: '盘后个股检索：区间统计、月度收益率、筹码分布模型、PE/PB 历史估值带与分位。' },
  '/market-mood/irm': { title: '开盘啦 · 互动问答', description: '参照开盘啦互动易：深交所互动易与上证 e 互动每日问答、问询函与监管函。' },
  '/jixing': { title: '今天几星 · 今日星级', description: '参照微信小程序「今天几星」：本站按公开估值数据自算的 A 股市场星级（1–5.9 星）与 2012 年以来的历史星级。' },
  '/jixing/table': { title: '今天几星 · 估值表', description: '参照「今天几星」估值表：A 股宽基、行业、红利等指数的市盈率、市净率、股息率及历史百分位，标注低估 / 正常 / 高估；支持按名称与代码搜索。' },
  '/jixing/threshold': { title: '今天几星 · 阀值表', description: '螺丝钉指数阀值表的本站版：各指数低估线 / 高估线（近 10 年 30%/70% 分位）、距低估线距离与估值状态。' },
  '/jixing/map': { title: '今天几星 · 指数地图', description: '把估值表指数按分组与规模×风格象限排布，一眼看估值状态；可跳到估值表对应行。' },
  '/jixing/daily': { title: '今天几星 · 指数日报', description: '每个交易日的星级变化、指数涨跌、PE/PB 分位变动，以及进入 / 退出低估与高估的名单。' },
  '/jixing/global': { title: '今天几星 · 港股全球', description: '参照「今天几星」港股与全球估值：恒生、恒生科技、标普 500、纳斯达克 100 等指数估值百分位与黄金。' },
  '/jixing/signals': { title: '今天几星 · 牛熊信号板', description: '参照「今天几星」牛熊信号板：巴菲特指标、股债性价比、全收益/M2、市净率百分位、融资成交与本站整理的市场消息。' },
  '/ths-mood': { title: '同花顺 · 市场情绪', description: '参照同花顺 App 的市场情绪与涨停模块，收盘后的 A 股情绪指数、盘面评分、短线风向标、涨停封成比与涨停分析。' },
  '/ths-mood/market': { title: '同花顺 · 市场', description: '参照同花顺「市场」分析页：主要指数估值分区、资金供需、货币与债市风向。' },
  '/ths-mood/cbond': { title: '同花顺 · 可转债', description: '参照同花顺可转债专区：转债全景、选债表、套利机会、打新债日历。' },
  '/ths-mood/datacenter': { title: '同花顺 · 数据中心', description: '参照同花顺数据中心：新股与次新、限售解禁、增减持、质押与商誉风险。' },
  '/ths-mood/hk': { title: '同花顺 · 港股通与AH', description: '参照同花顺港股通：南向资金、AH 溢价、港股通持股变化、港股卖空。' },
  '/ths-mood/etf': { title: '同花顺 · ETF资金', description: '参照同花顺 ETF 专区：宽基 ETF 份额与申购净流入、指数调仓。' },
  '/ths-mood/screener': { title: '同花顺 · 技术选股', description: '参照同花顺选股预设：收盘后按技术条件筛选全市场，附全市场新高与涨跌家数走势。' },
  '/ths-mood/industry': { title: '同花顺 · 行业景气', description: '参照同花顺板块景气度：行业估值分位、盈利与增速、股息率，以及指数贡献度。' },
  '/trading-philosophy': { title: '交易哲学', description: '长期主义的交易原则与纪律。' },
  '/sector-rotation': { title: '板块轮动', description: '行业板块轮动的观察框架与数据。' },
  '/investment-strategy': { title: '投资策略', description: '长期投资的策略框架与执行方法。' },
  '/first-book': { title: '我的书｜《正念投资》', description: '《正念投资》及相关写作全文在线阅读。' },
  '/first-book/slow-is-fast': { title: '正念投资｜在线阅读', description: '从家庭资金安排到公司研究，用规则管理投资。选择适合自己的阅读路线，学习配置、估值、风险与复盘。' },
  '/future-trends': { title: '主题研究', description: 'AI、机器人、固态电池等主题的产业链、核心公司与逐家研究。' },
  '/watch': { title: '观察盘', description: '宏观阶段、全球主要指数与 A 股情绪，一页看完。', noindex: true },
  '/candidates': { title: '候选池', description: '我的候选公司与按历史情景门槛筛选的研究公司，一键进入估值、DCF 与网格。', noindex: true },
  '/industry-landscape': { title: '产业格局', description: '重点产业链与竞争格局梳理。' },
  '/research-notes': { title: '研究笔记｜公司与行业研究', description: '沪深 A 股、港股、美股的公司研究笔记与审计报告。' },
  '/etf-review': { title: 'ETF 复盘', description: '自选 ETF 每日复盘笔记：溢价、情绪、结论与计划动作。', noindex: true },
  '/grid-trading': { title: '网格交易计算器', description: 'ETF 与个股网格交易的参数求解、回测与模拟。' },
  '/money-freedom': { title: '财富自由计算器', description: '用 480X + K×n + M + H 估算一生所需的钱，推算自由年龄，并对照 4% 法则。' },
  '/valuation': { title: '公司估值工作台', noindex: true },
  '/invest/ai-token-economics': { title: 'AI 降价与利润｜Token 用量、价格与毛利', description: 'Ramp 企业样本的 Token 用量、支出与价格变化，OpenAI 与 Anthropic 的收入集中度及单位毛利敏感性。数据整理自 AI 对话，未独立核实。', noindex: true },
  '/invest/comprehensive-valuation': { title: '综合估值｜四维方法与三情景测算', description: '从资产质量、交叉估值、预期差到风险预算，手工测算三情景收益与赔率，导出公司研究卡。', noindex: true },
  '/dcf': { title: 'DCF 估值', noindex: true },
  '/index-panorama': { title: '指数全景｜宽基与行业估值分位', description: 'A 股、港股、美股宽基与行业主题指数的点位与估值分位，详情附已核实相关 ETF。静态收盘数据包。' },
  '/index-panorama/': { title: '指数全景｜宽基与行业估值分位', description: 'A 股、港股、美股宽基与行业主题指数的点位与估值分位，详情附已核实相关 ETF。静态收盘数据包。' },
  '/lab/etf-timing': { title: '择时实验｜择时＋只认金叉（观察中）', description: '一条 ETF 择时规则的逐步检验：样本外检验、2011 年起指数长历史检验与每周影子运行记录。观察中、未验证，不是买卖指令。', noindex: true },
  '/lab/etf-flow': { title: 'ETF 资金流｜全A/宽基申购净流入（实验）', description: '同花顺原口径全市场与宽基 ETF 日度申购净流入叠加上证指数。实验观察，不是买卖指令。', noindex: true },
  '/lab/etf-uptrend': { title: 'ETF 主升浪｜区间与倒推历史（实验）', description: '同花顺主升浪每日快照：名单、历史上涨区间、AI 上涨原因与倒推历史。来源非自有模型，观察中，不是买卖指令。', noindex: true },
  '/lab/etf-watch-pool': { title: '行业观察池｜只看信号（实验）', description: '高波动与大行业 ETF 观察名单的历史对照。不并入复盘、不发提醒，不是投资建议。', noindex: true },
  '/lab/etf-macd-good': { title: '创业板择时优选｜研究名单（实验）', description: 'Y1 + 创业板择时研究筛出的 ETF 名单。观察中，不是买卖指令。', noindex: true },
  '/lab/etf-hs300-timing': { title: '沪深300择时优选｜研究名单（实验）', description: '只认金叉 + 沪深300择时研究筛出的 ETF 名单。观察中，不是买卖指令。', noindex: true },
  '/lab/etf-signal-plans': { title: '三方案回测｜创业板/沪深300/纯MACD（实验）', description: '单只 ETF 的三套研究口径波段回测。不并入网格，不是买卖指令。', noindex: true },
  '/earnings': { title: '财报前瞻', description: '公司库未来六周的财报日、一致预期与历史超预期幅度，附站内评级、三情景位置与这次要验证的事项。不预测、不荐股。' },
  '/radar': { title: '机会雷达', description: '按林奇分类分两条线的研究短名单：价值回归（正常盈利 + DCF 买入参考价）与快速增长（增速持续 + PE 压力条件），护城河与财务稳健加减分，每日更新。' },
  '/knowledge': { title: '知识中心', noindex: true },
  '/monitor': { title: '监控面板', noindex: true },
}

const PREFIX: Array<[string, RouteSeo]> = [
  ['/grid-trading/records', { title: '网格交易记录', noindex: true }],
  ['/invest/blogger-views/', { title: '博主观点整理', noindex: true }],
  ['/first-book/read/', { title: '《正念投资》在线阅读', description: '《正念投资》章节全文在线阅读。' }],
  ['/research-notes/', { title: '公司研究笔记', description: '单家公司的研究笔记、财务与估值要点。' }],
  ['/future-trends/solid-state/', { title: '固态电池｜公司研究', description: '固态电池公司业务敞口、财务质量、估值假设、多空观点与证据。' }],
  ['/future-trends/company/', { title: '主题研究｜公司研究', description: '公司经营、护城河、隐忧、情景估值与研究证据。' }],
  ['/ai/', { title: 'AI 实验方向', description: 'AI 独立开发的实验方向与笔记。' }],
]

export function resolveSeo(pathname: string, blogEntries: BlogEntry[] = publishedManifest): RouteSeo & { known: boolean } {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  const exact = EXACT[path]
  if (exact) return { ...exact, known: true }
  if (path.startsWith('/invest/macro-masters/')) {
    const name = MACRO_MASTER_NAMES[path.slice('/invest/macro-masters/'.length)]
    if (name) return { title: `${name}怎么看周期｜宏观大师`, description: `${name}的周期思路、观察指标、近似读数与公开局限；均为本站整理，不构成买卖建议。`, known: true }
    return { title: '页面不存在', noindex: true, known: false }
  }
  if (path.startsWith('/blog/')) {
    const slug = path.slice('/blog/'.length)
    const post = blogEntries.find(entry => entry.status === 'published' && entry.slug === slug)
    return post ? { title: `${post.title}｜博客`, description: post.summary, known: true } : { title: '页面不存在', noindex: true, known: false }
  }
  const direction = path.startsWith('/ai/') ? findDirection(path.slice('/ai/'.length)) : undefined
  if (direction) return { title: `${direction.title}｜AI实验室`, description: direction.reason, known: true }
  let best: [string, RouteSeo] | undefined
  for (const entry of PREFIX) {
    const [prefix] = entry
    if (path.startsWith(prefix) && (!best || prefix.length > best[0].length)) best = entry
  }
  if (best) return { ...best[1], known: true }
  return { title: '页面不存在', noindex: true, known: false }
}

export function formatTitle(title: string): string {
  return title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`
}
