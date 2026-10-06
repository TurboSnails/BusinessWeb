export const INVESTMENT_SKILL_TAG = '投资分析 Skill'

export const INVESTMENT_SKILLS = [
  {
    id: 'stock-research-expert',
    name: '股票研究专家',
    alias: '严估深 / 研股股',
    focus: '深度研究 · 估值建模',
    description: '从公司基本面、财报和护城河出发，结合 DCF、可比估值与牛／基／熊三情景，整理目标价、盈亏比和可证伪条件。适合系统研究一家公司。',
    outputs: '公司速览、深度研究报告、估值模型、财报解读、投资备忘录。',
    example: '用股票研究专家分析 AAPL，给出三情景估值、关键假设与风险。',
  },
  {
    id: 'tencent-stock-research-team',
    name: '腾讯自选股投研专家团',
    alias: '圆汇众 · 1 位主理人 + 6 位专家',
    focus: '多视角 · 圆桌研讨',
    description: '汇集产业、信号、估值、逆向、财报和短线六种研究视角，由主理人整理共识与分歧。适合单股研究、多股对比、持仓诊断和板块讨论。',
    outputs: '结论卡、专家观点、深度思考、后续关注；用偏多／偏空／观望／分歧表达立场。',
    example: '用腾讯自选股投研专家团讨论腾讯，看看不同专家的共识与分歧。',
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
