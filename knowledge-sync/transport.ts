import { validateHead,validateNotes,validatePaths,hashPattern,type SyncHead,type SyncNote,type SyncManifest } from '../server/knowledge/sync-contract'
export type SyncRemote={head():Promise<SyncHead>;manifest(head:SyncHead,cursor:string|null):Promise<SyncManifest & {total:number}>;read(head:SyncHead,path:string):Promise<SyncNote>;publish(expectedHead:SyncHead,notes:SyncNote[],generation:string,vaultId:string):Promise<SyncHead>}
export type Http=(url:string,init:{method:string;headers:Record<string,string>;body?:string;signal:AbortSignal})=>Promise<{status:number;body:unknown}>
export class RemoteError extends Error { constructor(public status:number){super(`云端同步请求失败 (${status})`)} }
export function createRemote(endpoint:string,token:string,http:Http=async(url,init)=>{const r=await fetch(url,{...init,redirect:'error'});return {status:r.status,body:await r.json()}}):SyncRemote {
 const u=new URL(endpoint)
 if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/api/knowledge'||token.length<32)throw new Error('需要 HTTPS /api/knowledge 地址和有效同步凭据')
 const request=async(action:string,params:Record<string,string>={},body?:unknown)=>{
  const url=new URL(u);url.searchParams.set('action',action);for(const [k,v] of Object.entries(params))url.searchParams.set(k,v)
  const r=await http(url.href,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(30000)})
  if(r.status<200||r.status>=300)throw new RemoteError(r.status);return r.body
 }
 return {
  head:async()=>validateHead(await request('sync-head')),
  manifest:async(head,cursor)=>await request('sync-manifest',{generation:head.generation!,...(cursor?{cursor}:{})}) as SyncManifest & {total:number},
  read:async(head,path)=>validateNotes([await request('sync-note',{generation:head.generation!,path})])[0],
  publish:async(expectedHead,notes,generation,vaultId)=>{
   validateNotes(notes);let batch:SyncNote[]=[]
   const send=()=>request('sync-batch',{}, {generation,vaultId,notes:batch})
   for(const note of notes){
    if(batch.length&&(batch.length===100||Buffer.byteLength(JSON.stringify({generation,vaultId,notes:[...batch,note]}))>2_700_000)){await send();batch=[]}
    batch.push(note)
   }
   if(batch.length)await send()
   return validateHead(await request('sync-commit',{}, {generation,vaultId,expectedHead,count:notes.length}))
  }
 }
}
export async function downloadSnapshot(remote:SyncRemote,head:SyncHead):Promise<Map<string,SyncNote>> {
 validateHead(head);if(!head.generation)return new Map()
 const entries:{path:string;version:string}[]=[];let cursor:string|null=null,total:number|undefined;const seen=new Set<string>()
 do{
  const page=await remote.manifest(head,cursor)
  if(JSON.stringify(validateHead(page.head))!==JSON.stringify(head)||!Array.isArray(page.notes)||page.notes.length>200||!Number.isInteger(page.total)||page.total<0||page.total>10000||(total!==undefined&&total!==page.total))throw new Error('快照清单不完整')
  total=page.total
  for(const note of page.notes){if(typeof note.path!=='string'||!hashPattern.test(note.version))throw new Error('清单无效');if(seen.has(note.path))throw new Error('清单重复');seen.add(note.path);entries.push(note)}
  if(entries.length>total)throw new Error('清单数量无效')
  const next=page.nextCursor
  if(next!==null&&(typeof next!=='string'||!page.notes.length||next!==page.notes.at(-1)?.path||next===cursor))throw new Error('分页游标无效')
  cursor=next
 }while(cursor!==null)
 if(entries.length!==total)throw new Error('清单数量不完整');validatePaths(entries.map(n=>n.path))
 const notes=new Map<string,SyncNote>();let index=0
 await Promise.all(Array.from({length:Math.min(4,entries.length)},async()=>{while(index<entries.length){const entry=entries[index++],note=await remote.read(head,entry.path);validateNotes([note]);if(note.path!==entry.path||note.version!==entry.version)throw new Error('笔记与快照版本不一致');notes.set(note.path,note)}}))
 return new Map([...notes].sort(([a],[b])=>a.localeCompare(b)))
}
