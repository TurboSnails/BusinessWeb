// Same denominator as mainland financing: both exchanges' A shares and all listed funds.
// Never substitute index constituent turnover, trading volume, calendar days, or an assumed 252 sessions.
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cnTurnoverUrls, parseSseTurnover, parseSzseTurnover } from './market-cycle-cn-funding.mjs'
export const CN_CALENDAR_URLS = {
  sh000300: 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh000300,day,,,400,qfq',
  sz399001: 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sz399001,day,,,400,qfq',
}
const DEFAULT_CACHE = fileURLToPath(new URL('../.cache/market-cycle-cn-turnover', import.meta.url))
const dateOK = d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0,10) === d
const add = (d,n) => new Date(Date.parse(d)+n*864e5).toISOString().slice(0,10)
const monday = d => add(d,-((new Date(d).getUTCDay()+6)%7))
export function cnTurnoverWindow(today) {
  if (!dateOK(today)) throw new Error('观察日无效')
  const weekStart=add(monday(today),-7),weekEnd=add(weekStart,6)
  return {weekStart,weekEnd,baselineStart:add(weekStart,-364),baselineEnd:add(weekStart,-1)}
}
export function parseCnTradingCalendar(body,symbol,today) {
  const data=body?.data?.[symbol]
  if (!Object.hasOwn(CN_CALENDAR_URLS,symbol)||body?.code!==0||data?.qt?.[symbol]?.[2]!==symbol.slice(2)||!Array.isArray(data?.day)||!data.day.length) throw new Error('沪深参考指数身份/日历无效')
  const dates=[];let previous=''
  for(const row of data.day){const date=row?.[0];if(!dateOK(date)||date<=previous||![1,2,3,4,5].includes(new Date(date).getUTCDay()))throw new Error('交易日历顺序/日期无效');previous=date;if(date<=today)dates.push(date)}
  return dates
}
export function computeCnWeeklyTurnoverRatio(rows,calendarDates,today) {
  const w=cnTurnoverWindow(today)
  if(!Array.isArray(rows)||!rows.length||!Array.isArray(calendarDates)||!calendarDates.length)throw new Error('历史日历或成交额为空')
  if(rows.some(r=>!dateOK(r.date)||r.date>today))throw new Error('成交额日期无效或未来')
  if(calendarDates.some(d=>!dateOK(d)||d>today)||new Set(calendarDates).size!==calendarDates.length)throw new Error('交易日历重复/未来/无效')
  if(calendarDates[0]>w.baselineStart)throw new Error('参考日历历史跨度不足')
  // The target week is already over in wall-clock time; Sunday itself is not a trading date.
  if(today<=w.weekEnd||calendarDates.at(-1)<w.weekStart||(Date.parse(today)-Date.parse(calendarDates.at(-1)))/864e5>7)throw new Error('参考日历过期或完整周未确认')
  const expected=calendarDates.filter(d=>d>=w.baselineStart&&d<=w.weekEnd)
  const points=rows.filter(r=>r.date>=w.baselineStart&&r.date<=w.weekEnd),lookup=new Map(points.map(r=>[r.date,r.amount]))
  if(lookup.size!==points.length||expected.some(d=>!lookup.has(d))||points.some(r=>!expected.includes(r.date)))throw new Error('两所成交额与真实交易日不一致/缺失')
  if(points.some(r=>typeof r.amount!=='number'||!Number.isFinite(r.amount)||r.amount<=0))throw new Error('成交额必须为正数')
  const baseline=points.filter(r=>r.date<w.weekStart),week=points.filter(r=>r.date>=w.weekStart)
  if(baseline.length<200||!week.length)throw new Error('历史不足52周或目标周无交易')
  const mean=rs=>rs.reduce((s,r)=>s+r.amount,0)/rs.length
  return {...w,value:mean(week)/mean(baseline),days:week.length,baselineDays:baseline.length,observationDate:week.at(-1).date,weekDailyAverage:mean(week),baselineDailyAverage:mean(baseline)}
}
async function readJson(file){try{return JSON.parse(await readFile(file,'utf8'))}catch{return null}}
async function atomic(file,value){await mkdir(path.dirname(file),{recursive:true});const tmp=`${file}.${process.pid}.tmp`;await writeFile(tmp,JSON.stringify(value));await rename(tmp,file)}
/** Bounded 500 requests including two independent mainland calendars, concurrency <=2, six-minute incremental fill.
 * Missing dates stay missing. Cache entries retain the raw official response, exact dated URL and original fetch time.
 */
export async function collectCnTurnover(ctx,opts={}) {
  const cacheDir=opts.cacheDir??process.env.MARKET_CYCLE_CN_TURNOVER_CACHE_DIR??DEFAULT_CACHE
  const maxRequests=Math.min(500,Math.max(2,Number(opts.maxRequests??500))),deadline=Date.now()+Math.min(360000,Math.max(0,Number(opts.deadlineMs??360000)))
  const today=ctx.now.slice(0,10);let requests=0
  try {
    const calendars=[]
    for(const [symbol,url] of Object.entries(CN_CALENDAR_URLS)){requests++;calendars.push(parseCnTradingCalendar(await ctx.get(url),symbol,today))}
    const w=cnTurnoverWindow(today),calendar=calendars[0]
    const inWindow=ds=>ds.filter(d=>d>=w.baselineStart&&d<=w.weekEnd)
    if(JSON.stringify(inWindow(calendar))!==JSON.stringify(inWindow(calendars[1])))throw new Error('沪深参考交易日历不一致')
    // Fresh responses may end on Friday while the completed calendar week ends on Sunday.
    if(calendars.some(ds=>ds[0]>w.baselineStart||ds.at(-1)<w.weekStart||(Date.parse(today)-Date.parse(ds.at(-1)))/864e5>7))throw new Error('沪深参考日历历史不足/过期或完整周未确认')
    const dates=inWindow(calendar),parts=new Map(),jobs=[],failures=[]
    for(const date of dates){const urls=cnTurnoverUrls(date);for(const exchange of ['sse','szse']){
      const url=urls[exchange],file=path.join(cacheDir,exchange,`${date}.json`),parse=exchange==='sse'?parseSseTurnover:parseSzseTurnover
      const cached=await readJson(file)
      try {if(!cached||cached.url!==url||typeof cached.fetchedAt!=='string'||!Number.isFinite(Date.parse(cached.fetchedAt))||cached.fetchedAt.slice(0,10)>today)throw new Error('uncached');const p=parse(cached.body,date);parts.set(`${exchange}:${date}`,p.amountYi)}catch{jobs.push({date,exchange,url,file,parse})}
    }}
    let next=0
    const worker=async()=>{while(next<jobs.length&&requests<maxRequests&&Date.now()<deadline&&!ctx.signal?.aborted){const j=jobs[next++];requests++;try{
      const body=await ctx.get(j.url,{headers:{Referer:j.exchange==='sse'?'https://www.sse.com.cn/':'https://www.szse.cn/'}})
      const parsed=j.parse(body,j.date);await atomic(j.file,{url:j.url,fetchedAt:ctx.now,body});parts.set(`${j.exchange}:${j.date}`,parsed.amountYi)
    }catch(e){failures.push(`${j.exchange} ${j.date}: ${e instanceof Error?e.message:String(e)}`)}}}
    await Promise.all([worker(),worker()])
    const rows=[],missing=[]
    for(const date of dates){const sh=parts.get(`sse:${date}`),sz=parts.get(`szse:${date}`);if(sh===undefined||sz===undefined)missing.push(date);else rows.push({date,amount:Number((sh+sz).toFixed(2))})}
    if(missing.length)throw new Error(`53周${dates.length}个真实交易日，两所均具备${rows.length}日，缺${missing.length}日（${missing.slice(0,5).join(',')}）；本轮请求${requests}/${maxRequests}，${failures.slice(0,3).join('；')||'预算/时限耗尽'}`)
    const r=computeCnWeeklyTurnoverRatio(rows,calendar,today),sources=cnTurnoverUrls(r.observationDate)
    return [{metricId:'turnover_ratio_52w',market:'csi300',value:Number(r.value.toFixed(6)),observationDate:r.observationDate,source:sources.sse,unit:'倍',kind:'observed',frequency:'weekly',description:`沪深A股与全部上市基金成交额（亿元人民币，与融资比例同分母，非沪深300成分成交额）；完整周${r.weekStart}~${r.weekEnd}，${r.days}个真实交易日，日均${r.weekDailyAverage.toFixed(2)}亿元；此前52个日历周${r.baselineStart}~${r.baselineEnd}，${r.baselineDays}个真实交易日，日均${r.baselineDailyAverage.toFixed(2)}亿元；按真实交易日均值相除，整周休市不补零；沪市主板A+科创板+基金，深市主板A+创业板A+基金；逐日官方历史查询（各日替换日期参数）：${sources.sse}；${sources.szse}；沪深交易日历交叉核验：${Object.values(CN_CALENDAR_URLS).join('；')}`}]
  }catch(e){ctx.issue(`cn-turnover: ${e instanceof Error?e.message:String(e)}`);return []}
}
