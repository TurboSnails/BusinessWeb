import { validatePaths, type SyncNote } from '../server/knowledge/sync-contract'
export type Conflict = {path:string;local:SyncNote|null;remote:SyncNote|null}
export type MergePlan = { merged: Map<string,SyncNote>; conflicts: Conflict[] }
export function mergeNotes(base:Map<string,SyncNote>,local:Map<string,SyncNote>,remote:Map<string,SyncNote>):MergePlan {
 const paths=[...new Set([...base.keys(),...local.keys(),...remote.keys()])].sort();validatePaths(paths)
 const merged=new Map<string,SyncNote>(),conflicts:Conflict[]=[]
 const same=(a:SyncNote|undefined,b:SyncNote|undefined)=>a?.version===b?.version
 for(const path of paths){
  const b=base.get(path),l=local.get(path),r=remote.get(path);let next:SyncNote|undefined
  if(same(l,r)) next=l
  else if(same(l,b)) next=r
  else if(same(r,b)) next=l
  else {conflicts.push({path,local:l??null,remote:r??null});next=l}
  if(next) merged.set(path,next)
 }
 return {merged,conflicts}
}
