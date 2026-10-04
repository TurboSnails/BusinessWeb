import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {executablePath,discoverBackends} from './registry.mjs'
import {runProcess} from './process.mjs'
import {markModel} from '../models/index.mjs'
export function buildArgs(backend,modelId,schemaPath,schema={}){
 const model=modelId&&modelId!=='default'?['--model',modelId]:[]
 if(backend==='codex')return ['exec','--json','--ephemeral','--skip-git-repo-check','--sandbox','read-only',...model,...(schemaPath?['--output-schema',schemaPath]:[]),'-']
 if(backend==='claude')return ['--print','--verbose','--output-format','stream-json','--tools','','--strict-mcp-config','--mcp-config','{"mcpServers":{}}','--no-session-persistence',...model,...(schema?['--json-schema',JSON.stringify(schema)]:[])]
 if(backend==='opencode')return ['run','--pure','--format','json',...model]
 if(backend==='pi')return ['--mode','rpc','--no-session','--no-tools','--no-extensions','--no-skills','--no-prompt-templates','--no-context-files',...model]
 throw new Error('不支持的CLI')
}
export function extractOutput(backend,records){
 let text='',resolvedModelId=null
 for(const r of records){
  if(r.type==='error'||r.type==='turn.failed'||r.type==='result'&&r.is_error)throw new Error('模型调用失败，请检查CLI登录、额度及模型权限')
  if(backend==='codex'&&r.type==='item.completed'&&r.item?.type==='agent_message')text=r.item.text
  if(backend==='claude'&&r.type==='result')text=r.structured_output?JSON.stringify(r.structured_output):r.result
  if(backend==='claude'&&r.type==='system'&&r.model)resolvedModelId=r.model
  if(backend==='opencode'&&r.type==='text')text+=r.part?.text||''
  if(backend==='pi'&&r.type==='message_end'&&r.message?.role==='assistant'){if(r.message.stopReason==='error')throw new Error('Pi模型调用失败');text=(r.message.content||[]).filter(c=>c.type==='text').map(c=>c.text).join('');resolvedModelId=r.message.model||null}
 }
 if(!text)throw new Error('CLI未返回可解析的最终文本')
 return {text,resolvedModelId}
}
export async function runAnalysis({backend,modelId='default',prompt,schema,signal,onEvent}){
 const executable=await executablePath(backend);if(!executable)throw new Error('CLI未安装')
 if(typeof modelId!=='string'||modelId.length>200||!modelId.trim()||/[\x00-\x1f]/.test(modelId))throw new Error('模型ID无效')
 const cwd=await mkdtemp(join(tmpdir(),'businessweb-valuation-')),schemaPath=join(cwd,'schema.json'),records=[]
 try{
  await writeFile(schemaPath,JSON.stringify(schema))
  const input=backend==='pi'?JSON.stringify({id:'valuation',type:'prompt',message:prompt})+'\n':prompt
  await runProcess(executable,buildArgs(backend,modelId,schemaPath,schema),{input,cwd,signal,timeout:600000,keepOpen:backend==='pi',env:{...process.env,OPENCODE_CONFIG_CONTENT:JSON.stringify({permission:{'*':'deny'}})},onLine:(line,child)=>{
   if(!line.trim())return;let r;try{r=JSON.parse(line)}catch{return}records.push(r)
   if(r.type==='response'&&r.success===false)throw new Error('Pi拒绝分析请求')
   if(r.type==='agent_settled'&&backend==='pi')child.stdin.end()
   if(['message_update','text','item.completed'].includes(r.type))onEvent?.({type:'activity',message:'模型正在分析财务资料'})
  }})
  const output=extractOutput(backend,records);markModel(backend,modelId,'verified')
  const info=(await discoverBackends()).find(b=>b.id===backend)
  return {output:output.text,requestedModelId:modelId,resolvedModelId:output.resolvedModelId,cliVersion:info?.cliVersion||''}
 }catch(error){markModel(backend,modelId,'unavailable');throw error}finally{await rm(cwd,{recursive:true,force:true})}
}
