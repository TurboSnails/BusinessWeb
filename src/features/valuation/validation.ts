import type { FinancialSnapshot,ValidationResult } from './types.ts'
export function validateSnapshot(value:unknown):ValidationResult<FinancialSnapshot> {
  const v=value as FinancialSnapshot
  if(!v||v.schemaVersion!==1||!v.security||!['cn','hk','us'].includes(v.security.market)||!v.security.code||!v.security.quoteCurrency||!v.asOf||!v.facts||!Array.isArray(v.sources)||!Array.isArray(v.peers)||!Array.isArray(v.missing))return {ok:false,errors:['财务快照结构无效']}
  const ids=new Set(v.sources.map(s=>s.id))
  const errors=Object.entries(v.facts).flatMap(([key,f])=>!f||f.value!==null&&!Number.isFinite(f.value)||!ids.has(f.sourceId)||!f.unit||!f.basis||!f.periodEnd||!f.retrievedAt ? [`${key}: 指标或来源无效`]:[])
  return errors.length?{ok:false,errors}:{ok:true,value:v}
}
