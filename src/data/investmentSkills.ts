export const INVESTMENT_SKILL_TAG = '投资分析 Skill'

export const INVESTMENT_SKILLS = [
  {
    id: 'stock-analysis',
    name: '股票分析',
    alias: '融合 Skill · 研究方法 + 股票研究专家 + 腾讯六专家 + Public Markets Investing',
    focus: '商业模式解码 · 核心假设 · 深度估值 · 六专家视角',
    description: '融合项目研究方法、股票研究专家、腾讯自选股投研专家团与 Public Markets Investing。沿用立论、取数、估值、对抗、收口五步流程，从商业模式与单位经济出发，连接核心假设、盈利预测、行业周期和三情景估值，以六专家共识与分歧形成可追溯的条件化结论。适用于美股、港股和 A 股，按需开展回测与组合风险分析。',
    outputs: '综合结论卡、商业模式驱动树、核心假设与敏感性、盈利预测与三情景估值、盈亏比、专家分歧与验证变量、条件化研究区间、证据索引和验证日历。',
    example: '用股票分析研究腾讯（0700.HK），核实最新财报与行情，拆解赚钱机制和核心假设，给出三情景估值、盈亏比、六专家共识与分歧，以及能验证结论的指标和日期。',
  },
  {
    id: 'comprehensive-equity-valuation',
    name: '综合股票估值',
    alias: 'PE / PEG / PB · 现金流与行业锚 · 批量公司研究',
    focus: '目标价推导 · 时点与币种 · 现价对比 · 可追溯批量交付',
    description: '按资产质量、价格、预期差与压力风险四个问题组织估值。分别判断 PE、PEG、PB 和现金流/行业方法的适用性，记录财务分母、目标倍数、主辅锚和方法分歧；区分今日价值与未来情景价，支持多人按统一数据契约批量分析。',
    outputs: '精简公司估值卡、价格日期与币种、三情景和主方法推导、相对现价、证据缺项、可校验 JSON 与批量覆盖统计。',
    example: '用 comprehensive-equity-valuation 对公司清单做估值，记录 PE/PEG/PB 的适用性和依据，选择主锚对比现价；缺少关键证据则明确标记等待证据。',
  },
  {
    id: 'trading-analysis-team',
    name: '交易分析团队',
    alias: '何执舟 · 13 角色 / 5 阶段',
    focus: '多空辩论 · 风险评估',
    description: '并行研究技术、基本面、新闻和情绪，再通过多空辩论、交易提案和三方风险裁决形成分析。支持完整、快速、辩论和风险诊断四种模式。',
    outputs: '多空交锋摘要、交易情景、风险评估，以及 Markdown 摘要与 HTML 报告。',
    example: '用交易分析团队对 NVDA 做风险诊断，说明主要风险和失效条件。',
  },
] as const

export function investmentSkillDownloadUrl(filename: string): string {
  return `${import.meta.env.BASE_URL}investment-skills/${filename}`
}
