// 只声明前端测试（src/features/strategy-spec/specs.test.ts）用到的导出，用来核对说明书与规则代码一致。
export const RULE_VERSION: string
export const TIERS: { id: string; label: string; equityShare: number; min?: number; max?: number; meaning: string }[]
export const PILLARS: { id: string; title: string; weight: number }[]
export const COMPONENTS: { id: string; pillar: string; label: string }[]
export const BREAKERS: { id: string; label: string; cap: string }[]
