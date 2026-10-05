import { randomUUID } from 'node:crypto'
import { hash, validateNotes, validateHead, type SyncHead, type SyncNote } from '../server/knowledge/sync-contract'
import { mergeNotes, type Conflict } from './merge'
import { downloadSnapshot, type SyncRemote } from './transport'
export type Pending={kind:'apply'|'publish';generation:string|null;vaultId:string;expectedHead:SyncHead;targetHead:SyncHead|null;notes:SyncNote[];before:SyncNote[];baseline:SyncNote[]}
export type SyncState={head:SyncHead;vaultId:string;baseline:SyncNote[];pending:Pending|null;conflicts:Conflict[]}
export type VaultAdapter={list():Promise<Map<string,SyncNote>>;loadState():Promise<SyncState|null>;saveState(state:SyncState):Promise<void>;apply(before:Map<string,SyncNote>,target:Map<string,SyncNote>):Promise<void>;preserveConflicts(conflicts:Conflict[]):Promise<void>}
export type SyncResult={status:'synced'|'conflict';conflicts:string[];head:SyncHead|null}

const map=(notes:SyncNote[])=>new Map(validateNotes(notes).map(n=>[n.path,n]))
const equal=(a:Map<string,SyncNote>,b:Map<string,SyncNote>)=>a.size===b.size&&[...a].every(([p,n])=>b.get(p)?.version===n.version)
const status=(state:SyncState):SyncResult=>({status:state.conflicts.length?'conflict':'synced',conflicts:state.conflicts.map(c=>c.path),head:state.head})
async function applyPending(vault:VaultAdapter,state:SyncState):Promise<SyncState>{
 const p=state.pending!;const before=map(p.before),target=map(p.notes),current=await vault.list();validateNotes([...current.values()])
 const safe=new Map(current);const conflicts=[...state.conflicts]
 for(const path of new Set([...before.keys(),...target.keys(),...current.keys()])){
  const b=before.get(path),t=target.get(path),c=current.get(path)
  if(c?.version===b?.version||c?.version===t?.version){if(t)safe.set(path,t);else safe.delete(path)}
  else if(t?.version!==b?.version)conflicts.push({path,local:c??null,remote:t??null})
 }
 await vault.preserveConflicts(conflicts)
 await vault.apply(current,safe)
 const next={...state,head:p.targetHead??p.expectedHead,baseline:p.baseline,pending:null,conflicts}
 await vault.saveState(next);return next
}
export async function syncOnce(remote:SyncRemote,vault:VaultAdapter):Promise<SyncResult>{
 let state=await vault.loadState()
 if(state){validateHead(state.head);map(state.baseline);if(state.pending){map(state.pending.notes);map(state.pending.before);map(state.pending.baseline)}}
 if(state?.pending){
  const p=state.pending
  if(p.kind==='publish'){
   const acceptedHead:SyncHead={revision:p.expectedHead.revision+1,generation:p.generation,vaultId:p.vaultId}
   let accepted=false
   try{const saved=await downloadSnapshot(remote,acceptedHead);if(!equal(saved,map(p.notes)))throw new Error('已发布快照内容不一致');accepted=true}
   catch(e){if((e as {status?:number}).status!==404)throw e}
   if(!accepted){
    const now=await remote.head()
    if(JSON.stringify(now)===JSON.stringify(p.expectedHead))p.targetHead=await remote.publish(p.expectedHead,p.notes,p.generation!,p.vaultId)
    else {state={...state,pending:null};await vault.saveState(state)}
   }else p.targetHead=acceptedHead
  }
  if(state.pending){state=await applyPending(vault,state);return status(state)}
 }
 if(state?.conflicts.length)return status(state)
 for(let attempt=0;attempt<3;attempt++){
  const head=validateHead(await remote.head())
  if(state?.head.vaultId&&state.head.vaultId!==head.vaultId)throw new Error('服务端资料库身份改变，请连接独立仓库')
  const remoteNotes=await downloadSnapshot(remote,head),local=await vault.list();validateNotes([...local.values()])
  const plan=mergeNotes(state?map(state.baseline):new Map(),local,remoteNotes)
  if(plan.conflicts.length){
   await vault.preserveConflicts(plan.conflicts)
   state={head:state?.head??head,vaultId:state?.vaultId??head.vaultId??hash(randomUUID()),baseline:state?.baseline??[],pending:null,conflicts:plan.conflicts}
   await vault.saveState(state);return status(state)
  }
  const first=state===null;const vaultId=state?.vaultId??head.vaultId??hash(randomUUID())
  const publish=!first&&!equal(plan.merged,remoteNotes)
  const pending:Pending={kind:publish?'publish':'apply',generation:publish?randomUUID():head.generation,vaultId,expectedHead:head,targetHead:publish?null:head,notes:[...plan.merged.values()],before:[...local.values()],baseline:[...(publish?plan.merged:remoteNotes).values()]}
  state={head:state?.head??head,vaultId,baseline:state?.baseline??[],pending,conflicts:[]};await vault.saveState(state)
  if(publish){
   try{pending.targetHead=await remote.publish(head,pending.notes,pending.generation!,vaultId)}
   catch(e){if((e as {status?:number}).status===409){state={...state,pending:null};await vault.saveState(state);continue}throw e}
  }
  state=await applyPending(vault,state);return status(state)
 }
 throw new Error('其他设备持续修改，请稍后再同步')
}
