import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { computeCnWeeklyTurnoverRatio, parseCnTradingCalendar, collectCnTurnover } from './market-cycle-cn-turnover.mjs'
const add=(s,n)=>new Date(Date.parse(s)+n*864e5).toISOString().slice(0,10)
const dates=Array.from({length:400},(_,i)=>add('2025-09-15',i)).filter(d=>[1,2,3,4,5].includes(new Date(d).getUTCDay())).filter(d=>!(d>='2026-10-01'&&d<='2026-10-07')).filter(d=>!(d>='2026-02-16'&&d<='2026-02-27')).filter(d=>d!=='2026-01-01'&&d!=='2026-01-02')
const amounts=dates.map(date=>({date,amount:date>='2026-10-12'?200:100}))
test('precise 52 calendar weeks use actual sessions and accept a real zero-session holiday week',()=>{
 const r=computeCnWeeklyTurnoverRatio(amounts,dates,'2026-10-19')
 assert.equal(r.value,2);assert.equal(r.days,5);assert.equal(r.weekStart,'2026-10-12');assert.equal(r.baselineStart,'2025-10-13');assert.equal(r.baselineEnd,'2026-10-11')
 assert.equal(r.baselineDays,dates.filter(d=>d>='2025-10-13'&&d<'2026-10-12').length)
})
test('missing session, wrong date, future, insufficient span and incomplete calendar fail closed',()=>{
 assert.throws(()=>computeCnWeeklyTurnoverRatio(amounts.filter(r=>r.date!=='2026-10-14'),dates,'2026-10-19'),/交易日/)
 assert.throws(()=>computeCnWeeklyTurnoverRatio([...amounts,{date:'2026-10-11',amount:100}],dates,'2026-10-19'),/交易日/)
 assert.throws(()=>computeCnWeeklyTurnoverRatio([...amounts,{date:'2027-01-01',amount:100}],dates,'2026-10-19'),/未来/)
 assert.throws(()=>computeCnWeeklyTurnoverRatio(amounts.slice(60),dates.slice(60),'2026-10-19'),/历史/)
 assert.throws(()=>computeCnWeeklyTurnoverRatio(amounts,dates.filter(d=>d<'2026-10-12'),'2026-10-19'),/日历/)
})
const calendarBody=(symbol,calendar=dates)=>({code:0,data:{[symbol]:{qt:{[symbol]:['','',symbol.slice(2)]},day:calendar.map(d=>[d,'1','1','1','1','100'])}}})
test('calendar validates index identity, order, duplicates and weekdays',()=>{
 assert.deepEqual(parseCnTradingCalendar(calendarBody('sh000300'),'sh000300','2026-10-19'),dates)
 assert.throws(()=>parseCnTradingCalendar(calendarBody('sz399001'),'sh000300','2026-10-19'),/身份/)
 assert.throws(()=>parseCnTradingCalendar(calendarBody('sh000300',[dates[0],dates[0]]),'sh000300','2026-10-19'),/顺序/)
})
const sse=(date)=>({sqlId:'COMMON_SSE_SJ_SCGM_C',result:['主板A','科创板','基金'].map(PRODUCT_NAME=>({PRODUCT_NAME,TRADE_DATE:date.replaceAll('-',''),TOTAL_TRADE_AMT:date>='2026-10-12'?'20':'10'}))})
const szse=(date)=>[{metadata:{catalogid:'1803_sczm',tabkey:'tab1',subname:date,cols:{cjje:'成交金额(亿元)'}},data:['主板A股','创业板A股','基金'].map(lbmc=>({lbmc,cjje:date>='2026-10-12'?'20':'10'}))}]
async function fixture(failDate){const dir=await mkdtemp(path.join(os.tmpdir(),'cn-turnover-'));const issues=[];let calls=0;const ctx={now:'2026-10-19T10:00:00Z',issue:s=>issues.push(s),get:async url=>{calls++;const u=new URL(url);if(u.hostname.includes('gtimg'))return calendarBody(u.searchParams.get('param').split(',')[0]);const date=u.searchParams.get('TRADE_DATE')??u.searchParams.get('txtQueryDate');if(date===failDate)throw new Error('HTTP 503');return u.hostname.includes('sse.com')?sse(date):szse(date)}};return{ctx,dir,issues,calls:()=>calls}}
test('collector requires every official day and emits a real partial-failure issue, no ratio',async()=>{
 const f=await fixture('2026-10-14');const r=await collectCnTurnover(f.ctx,{cacheDir:f.dir});assert.deepEqual(r,[]);assert.ok(f.issues.some(s=>s.includes('2026-10-14')))
})
test('collector caches verified raw official responses and preserves the exact denominator scope',async()=>{
 const f=await fixture();const r=await collectCnTurnover(f.ctx,{cacheDir:f.dir});assert.ok(r[0],f.issues.join(';'));assert.equal(r[0].value,2);assert.equal(r[0].market,'csi300');assert.match(r[0].description,/A股与全部上市基金/)
 const before=f.calls();await collectCnTurnover(f.ctx,{cacheDir:f.dir});assert.equal(f.calls()-before,2)
})

test('last Friday is sufficient on Monday before the next session; weekend runs never require a Sunday bar',()=>{
 const fridayCalendar=dates.filter(d=>d<='2026-10-16')
 assert.equal(computeCnWeeklyTurnoverRatio(amounts,fridayCalendar,'2026-10-19').value,2)
 for(const today of ['2026-10-17','2026-10-18']){const r=computeCnWeeklyTurnoverRatio(amounts.filter(r=>r.date<=today),fridayCalendar,today);assert.equal(r.weekStart,'2026-10-05');assert.equal(r.days,2)}
})

test('collector refuses conflicting calendars and enforces the network cap on partial progress',async()=>{
 const f=await fixture();const original=f.ctx.get
 f.ctx.get=async url=>url.includes('sz399001')?calendarBody('sz399001',dates.filter(d=>d!=='2026-10-14')):original(url)
 assert.deepEqual(await collectCnTurnover(f.ctx,{cacheDir:f.dir}),[])
 assert.ok(f.issues.some(s=>s.includes('日历不一致')))
 const capped=await fixture();assert.deepEqual(await collectCnTurnover(capped.ctx,{cacheDir:capped.dir,maxRequests:8}),[])
 assert.equal(capped.calls(),8);assert.match(capped.issues[0],/缺.*日/)
})
