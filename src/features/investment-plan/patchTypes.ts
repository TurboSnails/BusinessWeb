import type { PlanDocument } from './types'

/** 用户编辑默认传 doc.localRevision；向导链式第二步可省略以用仓库最新。 */
export type PlanPatchFn = (
  change: (latest: PlanDocument) => PlanDocument,
  expectedLocalRevision?: number,
) => Promise<{ ok: boolean; reason?: string; document?: PlanDocument }>
