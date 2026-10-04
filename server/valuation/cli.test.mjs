import test from 'node:test'
import assert from 'node:assert/strict'
import {buildArgs,extractOutput} from './cli/index.mjs'
import {runProcess} from './cli/process.mjs'
test('passes exact model IDs without a shell or fallback',()=>{
 const args=buildArgs('codex','gpt-6.1-sol','/tmp/schema.json');assert.equal(args[args.indexOf('--model')+1],'gpt-6.1-sol');assert.ok(!args.includes('--dangerously-bypass-approvals-and-sandbox'))
 assert.ok(!buildArgs('claude','sonnet').includes('--fallback-model'))
})
test('extracts agent final text and excludes diagnostic events',()=>{
 assert.equal(extractOutput('codex',[{type:'item.completed',item:{type:'agent_message',text:'{"ok":true}'}},{type:'thread.started',thread_id:'abc'}]).text,'{"ok":true}')
 assert.throws(()=>extractOutput('claude',[{type:'result',is_error:true,result:'failed'}]))
})
test('handles split unicode output and cancels real child processes',async()=>{
 const r=await runProcess(process.execPath,['-e',"process.stdout.write('中文\\n')"]);assert.equal(r.stdout,'中文\n')
 const c=new AbortController();const p=runProcess(process.execPath,['-e','setInterval(()=>{},1000)'],{signal:c.signal});c.abort();await assert.rejects(p,/取消/)
})
