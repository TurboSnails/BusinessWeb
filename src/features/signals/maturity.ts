// 研究结论的成熟度：网站研究只到「事实已复核」，能否据此决策取决于本人估值与决策记录。
import type { Company } from '../../data/companies'

export type ResearchStage = 'screen' | 'draft' | 'verified'
export const RESEARCH_STAGE: Record<ResearchStage, { label: string; desc: string }> = {
  screen: { label: '初筛', desc: '程序化补全或只有结论，没有可用的情景价' },
  draft: { label: '情景草案', desc: '有情景价，但未逐家核读最新公告' },
  verified: { label: '事实已复核', desc: '已核读公司原件；估值仍是未认证的草案' },
}

const hasNumericScenario = (c: Pick<Company, 'scenarios'>): boolean =>
  !!c.scenarios?.some(s => !/MISSING/.test(s.price) && /\d/.test(s.price))

export function researchStage(c: Pick<Company, 'auto' | 'reviewed' | 'researchReport' | 'scenarios'>): ResearchStage {
  if (c.reviewed || c.researchReport) return 'verified'
  if (!c.auto && hasNumericScenario(c)) return 'draft'
  return 'screen'
}

export type OwnStage = 'none' | 'valued' | 'recorded'
export const OWN_STAGE: Record<OwnStage, string> = { none: '未自行估值', valued: '已自行估值', recorded: '已写决策记录' }
/** 本人层：写了决策记录 > 做过本人 DCF 或估值报告 > 都没有 */
export const ownStage = (hasDecision: boolean, hasOwnValuation: boolean): OwnStage => (hasDecision ? 'recorded' : hasOwnValuation ? 'valued' : 'none')
