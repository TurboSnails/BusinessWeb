import { expect, it } from 'vitest'
import { createRemote, downloadSnapshot } from './transport'
import { hash, type SyncHead } from '../server/knowledge/sync-contract'
const head:SyncHead={revision:1,generation:'11111111-1111-4111-8111-111111111111',vaultId:'a'.repeat(64)}
it('downloads all pages from a fixed generation',async()=>{
 const remote=createRemote('https://example.com/api/knowledge','s'.repeat(40),async(url,init)=>{
  expect(init.headers.Authorization).toBe(`Bearer ${'s'.repeat(40)}`)
  const u=new URL(url);expect(u.searchParams.get('generation')).toBe(head.generation)
  if(u.searchParams.get('action')==='sync-manifest')return {status:200,body:{head,total:2,notes:[{path:u.searchParams.has('cursor')?'B.md':'A.md',version:hash('')}],nextCursor:u.searchParams.has('cursor')?null:'A.md'}}
  return {status:200,body:{path:u.searchParams.get('path'),content:'',version:hash('')}}
 })
 expect((await downloadSnapshot(remote,head)).size).toBe(2)
})
it('refuses corrupted content before any application',async()=>{
 const remote=createRemote('https://example.com/api/knowledge','s'.repeat(40),async url=>({status:200,body:new URL(url).searchParams.get('action')==='sync-manifest'?{head,total:1,notes:[{path:'A.md',version:hash('')}],nextCursor:null}:{path:'A.md',content:'tampered',version:hash('')}}))
 await expect(downloadSnapshot(remote,head)).rejects.toThrow()
})
it('detects truncated lists and repeated cursors',async()=>{
 for(const body of [{head,total:1,notes:[],nextCursor:null},{head,total:2,notes:[{path:'A.md',version:hash('')}],nextCursor:'A.md'}]){
 const remote=createRemote('https://example.com/api/knowledge','s'.repeat(40),async()=>({status:200,body}))
 await expect(downloadSnapshot(remote,head)).rejects.toThrow()
 }
})
it('rejects insecure endpoints and short tokens',()=>{
 expect(()=>createRemote('http://example.com/api/knowledge','s'.repeat(40))).toThrow()
 expect(()=>createRemote('https://example.com/api/knowledge','short')).toThrow()
})
