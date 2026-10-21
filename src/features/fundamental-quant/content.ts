/** 方法库，不依赖行情或候选池。所有策略参数均为待验证的研究假设。 */
export const UPDATED_AT = '2026-10-21'
export const RESEARCH_STATUS = '研究草案 · A 股未验证'
export type Provenance = 'guide' | 'bibliography' | 'adaptation' | 'hypothesis'
export const PROVENANCE_LABELS: Record<Provenance, string> = {
  guide: '方法导读', bibliography: '仅书目', adaptation: '项目改编', hypothesis: '待验证假设',
}

export const SOURCES = {
  wwows: {
    short: 'McGraw Hill · 主书',
    title: 'McGraw Hill · What Works on Wall Street, Fourth Edition',
    url: 'https://www.mheducation.com/highered/mhp/product/what-works-wall-street-guide-best-performing-investment-strategies-all-time.html',
    scope: '已核书目与公开简介；正文未逐章核对。',
  },
  qv: {
    short: 'Wiley · QV',
    title: 'Wiley · Quantitative Value',
    url: 'https://onlinelibrary.wiley.com/doi/book/10.1002/9781119205456',
    scope: '已核书目、简介与公开目录；具体算法与参数待正文核对。',
  },
  er: {
    short: 'Wiley · ER',
    title: 'Wiley · Expected Returns',
    url: 'https://www.wiley.com/en-in/expected-returns-an-investor%27s-guide-to-harvesting-market-rewards-p-9781119990727',
    scope: '仅核实公开书目；正文未取得，详细内容待补。',
  },
  osamValue: {
    short: 'OSAM · 2015',
    title: 'OSAM · A Logical Antidote to Indexing（2015）',
    url: 'https://canvas.osam.com/Commentary/BlogPost?Permalink=a-logical-antidote-to-indexing',
    scope: '已核公开研究：质量、估值、股东回报与稀释；海外研究不能代替 A 股验证。',
  },
  osamMomentum: {
    short: 'OSAM · 2014',
    title: 'OSAM · Value & Momentum（2014）',
    url: 'https://canvas.osam.com/Commentary/BlogPost?Permalink=value-momentum-building-a-unique-canadian-equity-portfolio',
    scope: '已核加拿大市场公开研究；用于价值与动量对照方向，非本项目回测。',
  },
  project: {
    short: '项目定义',
    title: '项目研究定义与验证纪律',
    url: '',
    scope: '本页公式、A 股适配及参数为自编研究定义，验证结果尚未建立。',
  },
  chineseEdition: {
    short: '中文版书目', title: '当当 · 投资策略实战分析（原书第4版·典藏版）',
    url: 'https://product.dangdang.com/28524544.html',
    scope: '核实中文标题、作者与机械工业出版社信息；仅用于中英文书目对应，不作策略证据。',
  },
} as const
export type SourceId = keyof typeof SOURCES
interface Evidence { provenance: Provenance; sources: SourceId[] }

export interface BookGuide extends Evidence {
  id: string; title: string; original: string; author: string; role: string
  idea: string; adoption: string; limit: string
}
export const BOOKS: BookGuide[] = [
  {
    id: 'wwows', title: '《投资策略实战分析》', original: 'What Works on Wall Street · 第四版',
    author: 'James P. O’Shaughnessy / 詹姆斯·奥肖内西', role: '首本指导书', provenance: 'guide', sources: ['wwows', 'chineseEdition'],
    idea: '从长期历史样本比较投资策略，关注规则能否持续执行。',
    adoption: '把学习内容转成“因子定义 → 规则规格 → 对照实验 → 验证记录”，用同口径数据比较方法。',
    limit: '当前为公开资料支持的方法导读；尚未完成全书核心内容逐章整理或策略精确复现，不引用原书参数与收益。',
  },
  {
    id: 'qv', title: '《Quantitative Value》', original: 'A Practitioner’s Guide to Automating Intelligent Investment and Eliminating Behavioral Errors',
    author: 'Wesley R. Gray / Tobias E. Carlisle', role: '质量与价值补充', provenance: 'guide', sources: ['qv'],
    idea: '把基本面价值研究与系统化方法连接起来，关注财务操纵、财务困境、企业质量与估值。',
    adoption: '为质量价值卡加入盈利质量检查，比较加入质量过滤前后的差别。',
    limit: '依据公开简介与目录定位；首版过滤器由项目自编，不宣称复现书中模型。',
  },
  {
    id: 'er', title: '《Expected Returns》', original: 'An Investor’s Guide to Harvesting Market Rewards',
    author: 'Antti Ilmanen', role: '进阶阅读 · 待补内容', provenance: 'bibliography', sources: ['er'],
    idea: '暂无内容导读，当前仅保留书目入口。',
    adoption: '后续核对正文后，补充因子组合、风险暴露及预期收益的研究方法。',
    limit: '目前只收录已核书目，不从书名推导选股公式，也不把未核内容写成作者结论。',
  },
]

export interface Method extends Evidence { title: string; idea: string; action: string }
export const METHODS: Method[] = [
  { title: '先比较一类公司', idea: '从单个成功案例转向可重复的样本与规则。', action: '预先固定股票池与基准，同时保留退市、失败和不利时期。', provenance: 'adaptation', sources: ['wwows', 'project'] },
  { title: '用多个估值角度交叉看', idea: '一个便宜指标可能被会计口径或行业特征左右。', action: '综合价值卡比较 EP、BP、EBIT/EV，记录每项缺失与行业偏向。', provenance: 'adaptation', sources: ['osamMomentum', 'project'] },
  { title: '把质量和股东回报拆开检验', idea: '低估值、财务质量和返还股东资本是不同问题。', action: '分别建立质量过滤对照和股东回报实验，核实增发、回购与稀释。', provenance: 'adaptation', sources: ['osamValue', 'qv', 'project'] },
  { title: '给价格辅助信号留一个对照', idea: '价值与动量可以组合研究，具体效果依赖市场、样本与成本。', action: '先验证价值基线，再增加 12−1 动量对照；不把辅助信号直接并入首版规则。', provenance: 'hypothesis', sources: ['osamMomentum', 'project'] },
  { title: '先写规则，再看结果', idea: '方法需要在不利环境下也能被清楚执行和检验。', action: '冻结版本、调仓、费用与证伪条件，报告样本外和失败结果；修改规则须另开版本。', provenance: 'adaptation', sources: ['project'] },
]

export const CATEGORIES = ['全部', '估值', '质量', '成长', '股东回报', '价格辅助'] as const
export type Category = typeof CATEGORIES[number]
export interface Factor extends Evidence {
  id: string; name: string; alias: string; category: Exclude<Category, '全部'>
  meaning: string; formula: string; fields: string; direction: string; timing: string; scope: string; pitfall: string
}
export const FACTORS: Factor[] = [
  {
    id: 'ep', name: '盈利收益率', alias: 'EP / Earnings yield', category: '估值',
    meaning: '用同一价格衡量已披露盈利，作为估值观察而非盈利预测。',
    formula: 'EP = TTM 归母净利润 ÷ 信号日总市值；扣非版本单独标 EP_adj。',
    fields: '归母净利润、扣非归母净利润、单季报告、信号日总股本与价格。', direction: '可比池内较高值优先研究；负值单列，不解释为便宜。',
    timing: 'TTM 由信号日已经公告的最近四个单季构成，保留更正版本。',
    scope: '持续盈利、口径可比的公司；金融股另核行业利润口径。',
    pitfall: '周期高点、资产处置、补贴与亏损都会使 PE/EP 失真；EP 与 EP_adj 不能混排。', provenance: 'adaptation', sources: ['project'],
  },
  {
    id: 'bp', name: '账面权益收益率', alias: 'BP / Book-to-price', category: '估值',
    meaning: '比较账面归母权益与市场定价，需要同时判断资产质量。',
    formula: 'BP = 最新已披露期末归母净资产 ÷ 信号日总市值。',
    fields: '归母权益、商誉及资产减值、信号日市值。', direction: '可比行业内较高值优先观察，负净资产单列。',
    timing: '使用公告日已可得的资产负债表，标明距信号日的间隔。',
    scope: '资产可核实的企业；银行须另查普通股权益与信用成本。',
    pitfall: '账面资产不等于可变现价值；商誉、坏账、存货和无形资产会影响可比性。', provenance: 'adaptation', sources: ['project'],
  },
  {
    id: 'ebit-ev', name: '经营盈利相对企业价值', alias: 'EBIT / EV', category: '估值',
    meaning: '从企业整体价值比较税前经营盈利，减少融资结构造成的部分差异。',
    formula: 'EBIT/EV = TTM EBIT ÷ EV；EV = 总市值 + 有息负债 + 优先权益 + 少数股东权益 − 可扣除现金。',
    fields: '经桥接的 EBIT、有息负债、权益结构、非受限现金、经营必需现金和总市值。', direction: 'EBIT 与 EV 均为正时，较高值优先研究。',
    timing: 'EBIT 与资产负债数据均须在信号日已披露，现金与债务采用同一期。',
    scope: '非金融企业；若 EBIT 包含合并子公司利润，EV 也含少数权益。',
    pitfall: '先桥接利息、税及非经营损益；现金扣除政策要固定，受限或经营必需现金不可全扣；EV≤0 单列。', provenance: 'adaptation', sources: ['project'],
  },
  {
    id: 'roe', name: '净资产回报率', alias: 'ROE / Return on equity', category: '质量',
    meaning: '观察股东资本的赚钱能力，并检查其来源。',
    formula: 'ROE = TTM 归母净利润 ÷ 期初期末平均归母净资产。',
    fields: '归母净利润、对应四季起点与终点的归母权益、杠杆和一次性损益。', direction: '结合持续性、杠杆和行业比较；不能只取最高值。',
    timing: '分子分母均使用当时已公告的相同期间数据。', scope: '正净资产公司；与 ROIC、现金流、资本需求共同判断。',
    pitfall: '高负债、回购缩小净资产会推高 ROE；负值或接近零的权益使比率无解释力。', provenance: 'adaptation', sources: ['project'],
  },
  {
    id: 'roic', name: '投入资本回报率', alias: 'ROIC / NOPAT', category: '质量',
    meaning: '观察经营盈利与投入资本的关系，辅助检查高 ROE 是否来自杠杆。',
    formula: '研究代理 ROIC = NOPAT 代理 ÷ 平均投入资本；NOPAT 代理 = 经营 EBIT ×（1−25%）；投入资本 = 合并权益 + 有息负债 − 可扣除现金。',
    fields: '已桥接经营 EBIT、两期投入资本；25% 是统一研究税率假设，非实际税负，须另做适用税率敏感性。', direction: '比较跨周期水平、波动与资本成本，不设统一收益门槛。',
    timing: '采用同期间的经营利润与资本；调整项在信号日须有证据。', scope: '非金融；研发、租赁、商誉及现金政策须一致。无法从披露桥接经营 EBIT 时列缺失，不主观补值。',
    pitfall: '有效税率异常、投入资本很低或为负时不排名；不能用收入增长代替资本回报。', provenance: 'adaptation', sources: ['project'],
  },
  {
    id: 'cash-conversion', name: '利润现金转换', alias: 'CFO / Net income', category: '质量',
    meaning: '检查利润是否伴随经营现金，结合多年累计观察。',
    formula: '现金转换 = 同期间合并经营现金流净额 ÷ 合并净利润；优先另看三年累计值。',
    fields: '经营现金流、合并净利润、应收款与存货变动。', direction: '解释差异和稳定性，不机械认为越高越好。',
    timing: '同期间、同合并范围；不能把合并现金流除以归母利润。', scope: '净利润为正且不接近零的非金融企业。',
    pitfall: '预收款、延迟付款、营运资本释放可暂时推高现金；经营现金流不等于自由现金流。', provenance: 'adaptation', sources: ['project'],
  },
  {
    id: 'accruals', name: '现金流口径应计比率', alias: 'Accruals', category: '质量',
    meaning: '识别利润与现金的背离，作为财务复核线索。',
    formula: '应计比率 =（合并净利润 − 合并经营现金流净额）÷ 同期间平均总资产。',
    fields: '合并净利润、经营现金流、期初与期末总资产。', direction: '异常高值触发财务复核；负值不自动证明高质量。',
    timing: '使用同期间财务数据；TTM 平均资产取四季起点与终点。', scope: '非金融；不能直接当作舞弊判定。',
    pitfall: '并购、处置、业务扩张与会计变更会造成背离，必须解释而非自动删除。', provenance: 'adaptation', sources: ['project'],
  },
  {
    id: 'revenue-growth', name: '三年营收复合增长', alias: 'Revenue CAGR', category: '成长',
    meaning: '观察业务扩张的持续性，并拆分量、价、结构与并购贡献。',
    formula: '三年 CAGR =（最近已披露完整年度营收 ÷ 三年前年度营收）^(1/3) − 1。',
    fields: '间隔三个年度的营收、合并范围变动与分部信息。', direction: '作辅助解释，不单独选择最高增长。',
    timing: '仅用信号日已公开的完整年度；不能把年度和前三季混用。', scope: '两端收入为正且可比的公司。',
    pitfall: '低基数和并购可能制造增长；高增长不等于高回报，还要看利润率和再投资。', provenance: 'adaptation', sources: ['project'],
  },
  {
    id: 'earnings-growth', name: '三年扣非利润复合增长', alias: 'Adjusted earnings CAGR', category: '成长',
    meaning: '观察盈利变化，并核实扣非项目是否具有经济上的可比性。',
    formula: '三年 CAGR =（最新完整年度扣非归母净利润 ÷ 三年前同口径值）^(1/3) − 1。',
    fields: '两端扣非归母净利润、逐年利润桥、股本变化。', direction: '和营收、现金、每股盈利共同解释。',
    timing: '采用当时已披露、口径一致的完整年度序列。', scope: '两端利润均为正；中间年份也须检查。',
    pitfall: '亏损转盈不能套 CAGR；扣非并非完美正常化，增发会使总利润与每股增速分离。', provenance: 'adaptation', sources: ['project'],
  },
  {
    id: 'shareholder-yield', name: '现金口径净股东回报', alias: 'Net shareholder yield', category: '股东回报',
    meaning: '同时观察返还股东的现金与新股融资，另核非现金稀释。',
    formula: '项目现金代理 =（TTM 已支付普通股现金分红 + 已实施且归属注销的回购支出 − 普通股发行融资净额）÷ 信号日总市值。',
    fields: '分红实施、回购实施及注销、发行融资、股权激励和可转债转股记录。', direction: '较高值仅供观察，先检查现金覆盖和稀释。',
    timing: '按实施或支付时间统计，不能用预案与公告金额代替实际发生。', scope: '回购、发行及股本变动可核实的非金融公司。',
    pitfall: '现金代理不能覆盖全部非现金稀释；送转不算回购，激励库存股不当作注销。转股另做股数桥，不能无凭据折成现金扣减。', provenance: 'adaptation', sources: ['osamValue', 'project'],
  },
  {
    id: 'momentum', name: '跳过最近一月的价格动量', alias: 'MOM 12−1 / Momentum', category: '价格辅助',
    meaning: '衡量过去价格表现，只作为价值规则的对照实验。',
    formula: '研究版本：MOM_12_1 = 总回报指数 TR(t−21) ÷ TR(t−252) − 1；6−1 变体以 t−126 为起点。',
    fields: '含现金分红、公司行动一致处理的历史总回报指数与交易日序列。', direction: '较强历史表现不等于未来上涨，不直接进入首版策略。',
    timing: '21/252 个交易日是月份近似的项目假设；样本不足不计算。', scope: '价格辅助信号，属于市场数据而非财报因子。',
    pitfall: '反转、急跌、跳空和交易限制可能使信号无法兑现；需检验换手、费用和参数敏感性。', provenance: 'hypothesis', sources: ['osamMomentum', 'project'],
  },
]

export interface Strategy extends Evidence {
  id: string; name: string; kind: string; question: string; signal: string
  portfolio: string; rebalance: string; exit: string; control: string; failure: string
  status: typeof RESEARCH_STATUS; ledger: 'rule-only'; backtest: null
}
export const STRATEGIES: Strategy[] = [
  {
    id: 'value', name: '综合价值', kind: '策略研究卡', question: '多个估值角度合在一起，能否改善单一估值的脆弱性？',
    signal: '仅在 EP、BP、EBIT/EV 均有效且为正的可比非金融池内，分别按从低到高的平均名次计算分位（并列取平均名次，再除以样本数），三项分位等权平均。缺失不补零，合格覆盖率单独报告。',
    portfolio: '研究起点：取全合格池内综合分位的平均名次/N ≥ 0.8 的组，等权；阈值处并列全部纳入，报告实际数量。必须另做行业与市值匹配对照。',
    rebalance: '每年 6 月首个交易日前一交易日收盘生成信号；在随后交易日可成交时执行。半年调仓作为独立扰动版本。',
    exit: '下次调仓不再命中则按规则退出；退市与不可成交持仓保留损益，不从历史删除。',
    control: '同一合格池等权、EP 单因子、行业/市值匹配组；同时检查被过滤公司的差异。',
    failure: '周期峰值盈利、账面资产减值和行业结构可能造成假便宜；窄池覆盖不足会改变结论。',
    provenance: 'hypothesis', sources: ['osamMomentum', 'project'], status: RESEARCH_STATUS, ledger: 'rule-only', backtest: null,
  },
  {
    id: 'quality-value', name: '质量价值', kind: '策略研究卡', question: '在相同价值基线上，增加质量过滤是否带来增量？',
    signal: '沿用综合价值全池阈值（综合分位平均名次/N ≥ 0.8），再叠加正经营现金流、正 NOPAT 代理、有效正投入资本；剔除原合格池内应计比率平均名次/N ≥ 0.9 的样本。ROIC 代理须高于同业中位数，不在过滤后重算价值阈值。',
    portfolio: '研究约定：同业采用信号日有效的申万一级分类，同业合格样本少于 20 家则单列；ROIC 使用手册的统一税率代理。过滤后重新等权，报告过滤前后数量、行业与价值暴露。参数均待验证。',
    rebalance: '与综合价值卡采用相同信号和成交时间，确保比较仅改变质量条件。',
    exit: '例行调仓按质量与价值规则重评；风险事件只按预先冻结的共同事件规则处理。',
    control: '综合价值卡、仅质量组、相同价值与市值暴露的匹配组；逐一移除过滤器检验贡献。',
    failure: '过滤可能错过困境反转型和再投资阶段的公司；质量溢价过高或财报可比性不足会失效。',
    provenance: 'hypothesis', sources: ['qv', 'project'], status: RESEARCH_STATUS, ledger: 'rule-only', backtest: null,
  },
  {
    id: 'shareholder', name: '股东回报', kind: '单因子实验卡', question: '在价值、行业与市值相近时，净股东回报是否提供额外信息？',
    signal: '在综合价值合格池中，仅保留分红、注销回购、融资和稀释记录可核的样本。按现金代理从低到高排序，负值和零值正常参与五分组，不另增负值组；并列不得拆开。',
    portfolio: '五组按平均名次/N 的 0.2、0.4、0.6、0.8 切分，边界值归入较高组。每组再按有/无已确认非现金稀释分层、分别等权报告；不足 20 家的子组只作覆盖说明。不得把未扣非现金稀释的现金代理解释成完整净回报。',
    rebalance: '与综合价值卡使用相同调仓时间；回购与分红只在实施信息已经公开后入库。',
    exit: '到下次调仓按同一口径重新分组；未实施的承诺不产生信号。',
    control: '综合价值卡、同一有完整记录样本池等权、仅现金股息组；行业/市值/估值匹配。',
    failure: '高分红可能来自不可持续派息；现金代理会漏掉非现金稀释，回购不注销会夸大回报。',
    provenance: 'hypothesis', sources: ['osamValue', 'project'], status: RESEARCH_STATUS, ledger: 'rule-only', backtest: null,
  },
]

export const LYNCH_FIT = [
  ['缓慢增长型', '股东回报与资产质量可作观察入口，先检查分红现金覆盖。'],
  ['稳定增长型', '价值与质量框架较易衔接，仍须研究增长持续期和竞争位置。'],
  ['快速增长型', '低估值过滤可能系统性漏掉它们；不能据此判定公司差。'],
  ['周期型', '盈利峰值会推高 EP，看似便宜；必须另做中周期盈利研究。'],
  ['困境反转型', '质量过滤可能直接排除它们；反转研究要另建逻辑与风险预算。'],
  ['资产型', 'BP 只提供线索；还要核资产权属、减值、负债和可变现价值。'],
] as const

export const VALIDATION_CHECKS = [
  '规则已冻结：股票池、公式、阈值、调仓、基准与版本日期均已记录。',
  '有时点数据：按实际公告时间入库，保留财报更正，未提前使用未来财报。',
  '有历史股票池：包含退市、停牌、ST 和历史行业/市值信息，避免幸存者偏差。',
  '公司行动一致：分红、送转、配股、发行与稀释均已处理，缺失项未补零。',
  '成交可行：逐市场、板块、历史时期核验交易规则，停牌与无法成交有处理日志。',
  '成本可复现：佣金、税费、冲击与换手已计入，同时报告成本前后结果。',
  '有公平对照：行业、市值、单因子、同合格池等权与数据覆盖差异均已检查。',
  '完成稳健性：子期间、费用、参数扰动、滚动样本外及失败结果均有记录。',
  '组合分别记账：纯规则与人工筛选分开，手工排除不回写原策略绩效。',
  '可复现且可证伪：输入版本、代码、参数、最大回撤与失效条件均可追溯。',
]

export function filterFactors(query: string, category: Category): Factor[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  return FACTORS.filter(factor => {
    const text = [factor.name, factor.alias, factor.category, factor.meaning, factor.formula, factor.fields, factor.scope, factor.pitfall].join(' ').toLocaleLowerCase()
    return (category === '全部' || factor.category === category) && words.every(word => text.includes(word))
  })
}
