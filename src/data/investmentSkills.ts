export const INVESTMENT_SKILL_TAG = '投资分析 Skill'

export const INVESTMENT_SKILLS = [
  {
    id: 'stock-analysis',
    name: '股票分析',
    alias: '统一 Skill · 研究方法 + 股票研究专家 + 腾讯自选股投研专家团',
    focus: '五步研究 · 深度估值 · 六专家视角 · 条件化结论',
    description: '汇总「研究方法 · 适用于所有公司」、股票研究专家与腾讯自选股投研专家团。以立论、取数、估值、对抗、收口为统一流程，结合财报、增长与护城河、三情景估值和六位专家的共识与分歧，适用于美股、港股和 A 股。',
    outputs: '综合结论卡、关键指标、三情景估值与盈亏比、专家观点与多空交锋、条件化研究区间、证伪条件和验证日历。',
    example: '用股票分析研究腾讯（0700.HK），核实最新财报与行情，给出三情景估值、盈亏比、专家共识与分歧，以及需要等待的证据。',
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
