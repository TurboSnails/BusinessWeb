// 入口页 /invest/start 的数据契约（docs/reviews/2026-11-14-newcomer-entry.md；arch-r2 §3，签字修正已并入）。
// 唯一写入 localStorage['start:v1']；结果不持久化，由答案 + 规则版本重算。

/** YYYY-MM-DD，真实日历日期（本地日历日） */
export type Day = string

export type Answer = 'a' | 'b' | 'c' | 'd'
export type Qid = 'q1' | 'q2' | 'q3' | 'q4' | 'q5' | 'q6' | 'q7' | 'q8' | 'q9'
/** 每题各自允许的选项见 content.QUESTIONS；未答即缺省 */
export type Answers = Partial<Record<Qid, Answer>>

export type Route = 'foundation' | 'simple' | 'combined' | 'research'

// v2（2026-11-14）：Q3 改为「不到 3 年 / 3 年到不足 5 年 / 5 年及以上」（家庭财务底座 底座.5、9.10）；Q5 增加「没经历过，不确定」
export const RULES_VERSION = 2 as const
export const QUESTIONNAIRE_VERSION = 2 as const
export const SCHEMA_VERSION = 1 as const

/** 研究路线本人额度的硬上限：2000bps = 20%（书 9.1/9.4/33.1 作者案例上限） */
export const USER_CAP_MAX_BPS = 2000
/** 结合 / 研究的建议起点上限：500bps = 5%（书 9.9「从小比例起步（如5%）」） */
export const SUGGESTED_CAP_BPS = 500

export interface AssessmentResult {
  rulesVersion: typeof RULES_VERSION
  status: 'incomplete' | 'complete'
  route?: Route
  /** 命中的规则 ID（按判断顺序） */
  ruleIds: string[]
  /** 理由 ID，对应 content.REASONS，每条带书章节链接 */
  reasonIds: string[]
  /** R0：独立红线，不参与路线优先级；已答 Q9=a 即为 true，不等全部答完 */
  safetyWarning: boolean
  /** 配置档位永远待本人确认：不判定保守 / 均衡 / 积极，不预选模板 */
  allocation: 'needs-confirmation'
  /** 只在完成且进入市场的路线给出：省心 0；结合 / 研究 500。先打底与未答完没有此字段 */
  suggestedResearchCapBps?: 0 | 500
  /** 先打底且只因 Q3（这笔钱 1 年内要用）命中：文案改为「这笔钱不进市场，可以按另一笔钱重做」 */
  foundationOnlyHorizon?: boolean
}

export interface StepProgress { checked: boolean; at: string }

export interface ReviewSchedule {
  /** 稳定 ID，用作 .ics UID；不含个人信息 */
  id: string
  /** 首个检查日，日号限定 1–28，避开月末重复歧义 */
  anchor: Day
  intervalMonths: 3 | 6
  /** 已完成的具体计划日期 */
  completedDates: Day[]
  /** 每次改期递增，写入 .ics SEQUENCE */
  calendarSequence: number
}

export interface StartState {
  schemaVersion: typeof SCHEMA_VERSION
  questionnaireVersion: typeof QUESTIONNAIRE_VERSION
  /** 答案是按哪一版规则作答的；与当前版本不同时提示重做（清单进度不受影响） */
  rulesVersion: number
  answers: Answers
  assessedAt?: string
  /** 清单进度按稳定 stepId 存，与 rulesVersion 解耦：改版后已删步骤静默忽略，新增步骤为未勾选 */
  steps: Record<string, StepProgress>
  review?: ReviewSchedule
  /** 本人确认「旧投资计划里这些是我的实际数据」时的指纹；旧数据一变即失效 */
  legacyConfirmation?: { fingerprint: string; confirmedAt: string }
  /** 只存本人选择的 0–2000 整数 bps；从不生成默认值，不反写 plan2026 */
  userResearchCapBps?: number
}

export const emptyState = (): StartState => ({
  schemaVersion: SCHEMA_VERSION,
  questionnaireVersion: QUESTIONNAIRE_VERSION,
  rulesVersion: RULES_VERSION,
  answers: {},
  steps: {},
})
