import {randomUUID} from 'node:crypto'
import {collectSnapshot} from './data/index.mjs'
import {analyzeSnapshot} from './analysis/index.mjs'
import {calculateReport,validateSnapshot} from '../../src/features/valuation/index.ts'
async function execute(input,{signal,emit}){
 emit('collecting',{message:'正在采集行情与财报'})
 const snapshot=input.snapshot||await collectSnapshot(input.security,{signal})
 const validation=validateSnapshot(snapshot);if(!validation.ok)throw new Error(validation.errors.join('；'))
 if(snapshot.security.code!==input.security.code||snapshot.security.market!==input.security.market)throw new Error('补充财报的证券身份不匹配')
 emit('snapshot',{snapshot});if(!Object.values(snapshot.facts).some(f=>f.value!=null&&f.basis!=='spot'))throw new Error('没有可用财报。请检查数据源或补充带来源的财务快照。')
 emit('analyzing',{message:'本地CLI正在生成三情景假设'})
 const {assumptions,execution}=await analyzeSnapshot(snapshot,{backend:input.backend,modelId:input.modelId,signal,onEvent:e=>emit('activity',e)})
 emit('calculating',{message:'正在复算估值与敏感性'})
 return calculateReport(snapshot,assumptions,{backend:input.backend,requestedModelId:execution.requestedModelId,resolvedModelId:execution.resolvedModelId,cliVersion:execution.cliVersion})
}
export function createJobStore({execute:runner=execute,timeout=600000}={}){
 const jobs=new Map();let active=null
 const terminal=new Set(['completed','failed','cancelled'])
 function emit(job,type,payload={}){if(terminal.has(job.state))return; if(['collecting','analyzing','calculating'].includes(type))job.state=type;const event={id:job.log.length+1,jobId:job.id,type,stage:job.state,payload,at:new Date().toISOString()};job.log.push(event);if(job.log.length>2000){job.log.splice(1,1)};for(const cb of job.listeners)cb(event)}
 function finish(job,state,payload){if(terminal.has(job.state))return;emit(job,state,payload);job.state=state;clearTimeout(job.timer);if(active===job.id)active=null;job.controller.abort()}
 return {
 start(input){if(active)throw new Error('服务忙碌，请等待当前任务或取消');if(jobs.size>=20){const old=[...jobs.values()].find(j=>terminal.has(j.state));if(old)jobs.delete(old.id)}const job={id:randomUUID(),state:'queued',report:null,error:null,log:[],listeners:new Set(),controller:new AbortController()};jobs.set(job.id,job);active=job.id;emit(job,'queued');job.timer=setTimeout(()=>{job.error='任务总时限10分钟已到';finish(job,'failed',{error:job.error})},timeout);queueMicrotask(async()=>{try{const report=await runner(input,{signal:job.controller.signal,emit:(type,payload)=>emit(job,type,payload)});if(!terminal.has(job.state)){job.report=report;finish(job,'completed',{report})}}catch(error){if(!terminal.has(job.state)){job.error=error.message;finish(job,'failed',{error:job.error})}}});return {id:job.id,state:job.state}},
 get(id){const j=jobs.get(id);if(!j)throw new Error('任务不存在');return {id:j.id,state:j.state,report:j.report,error:j.error}},
 cancel(id){const j=jobs.get(id);if(!j)throw new Error('任务不存在');finish(j,'cancelled',{message:'任务已取消'})},
 events(id,after=0){const j=jobs.get(id);if(!j)throw new Error('任务不存在');return j.log.filter(e=>e.id>after)},
 subscribe(id,fn){const j=jobs.get(id);if(!j)throw new Error('任务不存在');j.listeners.add(fn);return ()=>j.listeners.delete(fn)},
 close(){for(const j of jobs.values())finish(j,'cancelled',{message:'服务关闭'})}
 }
}
