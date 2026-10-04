import test from 'node:test'
import assert from 'node:assert/strict'
import {createJobStore} from './jobs.mjs'
test('rejects concurrent work and ignores late completion after cancellation',async()=>{
 let release;const store=createJobStore({execute:()=>new Promise(resolve=>{release=resolve})})
 const job=store.start({backend:'codex',modelId:'default',security:{market:'us',code:'AAPL'}})
 assert.throws(()=>store.start({}),/忙碌/)
 await new Promise(resolve=>setTimeout(resolve,0));store.cancel(job.id);store.cancel(job.id);release({fake:true});await new Promise(resolve=>setTimeout(resolve,0))
 assert.equal(store.get(job.id).state,'cancelled');assert.equal(store.get(job.id).report,null)
 const events=store.events(job.id,1);assert.ok(events.every(e=>e.id>1));assert.equal(events.at(-1).type,'cancelled');store.close()
})
test('completed tasks retain exactly one terminal event',async()=>{
 const store=createJobStore({execute:async()=>({schemaVersion:1})});const job=store.start({});await new Promise(resolve=>setTimeout(resolve,0));store.cancel(job.id)
 assert.equal(store.get(job.id).state,'completed');assert.equal(store.events(job.id,0).filter(e=>e.type==='completed').length,1);store.close()
})
