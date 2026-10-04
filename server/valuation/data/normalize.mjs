export function normalizeAmount(value){if(value===null||value===undefined||value===''||value==='--')return null;if(typeof value==='number')return Number.isFinite(value)?value:null;const m=String(value).replaceAll(',','').match(/^(-?\d+(?:\.\d+)?)(亿|万)?(?:元)?$/);return m?Number(m[1])*(m[2]==='亿'?1e8:m[2]==='万'?1e4:1):null}
export function ttmValue(annual,current,previous){return [annual,current,previous].every(v=>Number.isFinite(v))?annual+current-previous:null}
export function annualFact(fact,asOf,{instant=false}={}){
 if(!fact?.units)return null
 const entries=Object.entries(fact.units).flatMap(([unit,rows])=>rows.filter(r=>r.filed<=asOf&&r.end<=asOf&&Number.isFinite(r.val)&&(instant?!r.start:r.start&&(Date.parse(r.end)-Date.parse(r.start))/86400000>=330&&(Date.parse(r.end)-Date.parse(r.start))/86400000<=380)).map(r=>({...r,unit})))
 entries.sort((a,b)=>b.end.localeCompare(a.end)||b.filed.localeCompare(a.filed));const r=entries[0];return r?{value:r.val,unit:r.unit,currency:/^[A-Z]{3}$/.test(r.unit)?r.unit:r.unit==='USD/shares'?'USD':'',periodStart:r.start||r.end,periodEnd:r.end,basis:instant?'spot':'annual',sourceId:'sec',retrievedAt:new Date().toISOString(),status:'available'}:null
}
export function fact(value,{currency='CNY',unit='currency',date,sourceId,basis='annual',start}={}){const amount=normalizeAmount(value);return {value:amount,unit,currency,periodStart:start||date,periodEnd:date,basis,sourceId,retrievedAt:new Date().toISOString(),status:amount===null?'missing':'available'}}
