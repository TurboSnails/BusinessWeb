/** 说明书里的一段内容 */
export type SpecBlock =
  | { type: 'p'; text: string }
  | { type: 'list'; items: string[]; ordered?: boolean }
  | { type: 'table'; head: string[]; rows: string[][]; caption?: string }
  | { type: 'note'; text: string }

/** 一章。id 在各版本之间保持不变，用来逐章对比 */
export type SpecSection = {
  id: string
  title: string
  blocks: SpecBlock[]
}

export type StrategySpec = {
  /** 语义化版本号：主版本 = 仓位规则变化；次版本 = 做法、指标展示或执行细节变化；修订号 = 文字与数据更正 */
  version: string
  /** 成文日期 YYYY-MM-DD */
  date: string
  status: 'current' | 'archived'
  title: string
  /** 一句话概括这一版 */
  summary: string
  /** 组成部件的规则版本，和数据文件里的 ruleVersion 对应 */
  components: { label: string; version: string }[]
  /** 相对上一版改了什么；首版写成文说明 */
  changes: string[]
  /** 回测与统计的数据截止月份 */
  dataThrough: string
  sections: SpecSection[]
}
