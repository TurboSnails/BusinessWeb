import {randomUUID} from 'node:crypto'
import {lstat,mkdir,readFile,writeFile,rename} from 'node:fs/promises'
import {join,resolve,relative,sep} from 'node:path'
import {hash,validateNotes,validatePaths,type SyncNote} from '../../server/knowledge/sync-contract'
import type {SyncState,VaultAdapter} from '../../knowledge-sync/engine'
import type {Conflict} from '../../knowledge-sync/merge'
type FileRef={path:string;extension:string}
export type VaultIO={getMarkdownFiles():FileRef[];getAbstractFileByPath(path:string):{path:string;extension?:string}|null;read(file:FileRef):Promise<string>;process(file:FileRef,fn:(content:string)=>string):Promise<unknown>;create(path:string,content:string):Promise<unknown>;createFolder(path:string):Promise<unknown>;trash(file:FileRef,system:boolean):Promise<unknown>;rename(file:FileRef,path:string):Promise<unknown>}
export class ObsidianVaultAdapter implements VaultAdapter {
 constructor(private vault:VaultIO,private root:string,private directory:string,private signal?:AbortSignal){}
 private async guard(full:string):Promise<void>{
  if(this.signal?.aborted)throw new Error('同步已停止')
  const root=resolve(this.root),rel=relative(root,resolve(full))
  if(rel.startsWith(`..${sep}`)||rel==='..'||resolve(full)===root)throw new Error('不能操作仓库外文件')
  let current=root
  for(const segment of ['',...rel.split(sep)]){
   if(segment)current=join(current,segment)
   try{const s=await lstat(current);if(s.isSymbolicLink())throw new Error('不支持符号链接')}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e}
  }
 }
 async list():Promise<Map<string,SyncNote>>{
  await this.recoverDeletion()
  const notes:SyncNote[]=[]
  for(const file of this.vault.getMarkdownFiles()){
   if(file.path.split('/')[0].toLowerCase()==='sync-conflicts')continue
   await this.guard(join(this.root,file.path));const content=await this.vault.read(file);notes.push({path:file.path,content,version:hash(content)})
  }
  return new Map(validateNotes(notes).map(n=>[n.path,n]))
 }
 async loadState():Promise<SyncState|null>{
  const file=join(this.directory,'sync-state.json');await this.guard(file)
  try{return JSON.parse(await readFile(file,'utf8'))}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw new Error('同步状态无法读取，已停止同步以保护笔记')}
 }
 async saveState(state:SyncState):Promise<void>{
  const file=join(this.directory,'sync-state.json');await this.guard(file);await mkdir(this.directory,{recursive:true,mode:0o700})
  const temp=file+'.tmp';await this.guard(temp);await writeFile(temp,JSON.stringify(state),{mode:0o600});await rename(temp,file)
 }
 private async folders(path:string):Promise<void>{
  const segments=path.split('/');segments.pop();let dir=''
  for(const segment of segments){dir=dir?`${dir}/${segment}`:segment;await this.guard(join(this.root,dir));if(!this.vault.getAbstractFileByPath(dir)){try{await this.vault.createFolder(dir)}catch(e){if(!this.vault.getAbstractFileByPath(dir))throw e}}}
 }
 async apply(before:Map<string,SyncNote>,target:Map<string,SyncNote>):Promise<void>{
  validateNotes([...before.values()]);validateNotes([...target.values()]);validatePaths([...new Set([...before.keys(),...target.keys()])])
  const changes=[...new Set([...before.keys(),...target.keys()])].filter(p=>before.get(p)?.version!==target.get(p)?.version)
  for(const path of changes){
   await this.guard(join(this.root,path));const file=this.vault.getAbstractFileByPath(path)
   const current=file&&file.extension==='md'?hash(await this.vault.read(file as FileRef)):undefined
   if(current!==before.get(path)?.version||file&&!file.extension)throw new Error(`笔记已变更，请重新同步：${path}`)
  }
  for(const path of changes){
   await this.guard(join(this.root,path));const file=this.vault.getAbstractFileByPath(path),note=target.get(path),expected=before.get(path)?.version
   if(file){
    if(file.extension!=='md')throw new Error('路径被文件夹占用')
    await this.vault.process(file as FileRef,content=>{if(hash(content)!==expected)throw new Error(`笔记已变更：${path}`);return note?.content??content})
    if(!note)await this.safeDelete(file as FileRef,expected!)
   }else if(note){if(expected!==undefined)throw new Error(`笔记已删除：${path}`);await this.folders(path);await this.vault.create(path,note.content)}
  }
 }
 private async writeDeletion(value:{path:string;backup:string;version:string}|null):Promise<void>{
  const file=join(this.directory,'delete-journal.json');await this.guard(file);await mkdir(this.directory,{recursive:true,mode:0o700});const temp=file+'.tmp';await this.guard(temp);await writeFile(temp,JSON.stringify(value),{mode:0o600});await rename(temp,file)
 }
 private async recoverDeletion():Promise<void>{
  const journal=join(this.directory,'delete-journal.json');await this.guard(journal);let entry:{path:string;backup:string;version:string}|null
  try{entry=JSON.parse(await readFile(journal,'utf8'))}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return;throw e}
  if(!entry)return
  validatePaths([entry.path]);if(!/^\.trash\/businessweb-sync-[a-f0-9-]+\.md$/.test(entry.backup))throw new Error('删除恢复日志无效')
  const full=join(this.root,entry.backup);await this.guard(full);let content:string
  try{content=await readFile(full,'utf8')}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT'){await this.writeDeletion(null);return}throw e}
  if(hash(content)!==entry.version){
   await this.guard(join(this.root,entry.path));const existing=this.vault.getAbstractFileByPath(entry.path)
   if(!existing){await this.folders(entry.path);await this.vault.create(entry.path,content)}
   else if(existing.extension==='md')await this.preserveConflicts([{path:entry.path,local:{path:entry.path,content,version:hash(content)},remote:{path:entry.path,content:await this.vault.read(existing as FileRef),version:hash(await this.vault.read(existing as FileRef))}}])
   else throw new Error('编辑内容保存在回收站，原路径已被占用')
   await this.writeDeletion(null);throw new Error(`删除期间笔记被编辑，已保留新内容：${entry.path}`)
  }
  await this.writeDeletion(null)
 }
 private async safeDelete(file:FileRef,version:string):Promise<void>{
  const original=file.path,backup=`.trash/businessweb-sync-${randomUUID()}.md`
  await this.guard(join(this.root,backup));await mkdir(join(this.root,'.trash'),{recursive:true,mode:0o700})
  await this.writeDeletion({path:original,backup,version});await this.vault.rename(file,backup);await this.recoverDeletion()
 }
 async preserveConflicts(conflicts:Conflict[]):Promise<void>{
  for(const conflict of conflicts){
   const stem=conflict.path.split('/').pop()!.slice(0,50).replace(/[^\p{L}\p{N}._-]/gu,'_'),id=hash(conflict.path).slice(0,12)
   for(const side of ['local','remote'] as const){
    const note=conflict[side],content=note?.content??`# 同步冲突：此版本已删除\n\n原路径：${conflict.path}\n`
    const path=`Sync-Conflicts/${stem}-${id}-${hash(content).slice(0,12)}-${side}.md`
    await this.guard(join(this.root,path));await this.folders(path)
    const existing=this.vault.getAbstractFileByPath(path)
    if(existing){if(existing.extension!=='md'||hash(await this.vault.read(existing as FileRef))!==hash(content))throw new Error('冲突副本路径被占用');continue}
    await this.vault.create(path,content)
   }
  }
 }
 async resolveConflict(path:string,choice:'local'|'remote'):Promise<void>{
  const state=await this.loadState();if(!state||state.pending)throw new Error('存在待恢复同步事务')
  const conflict=state.conflicts.find(c=>c.path===path);if(!conflict)throw new Error('冲突已处理')
  const current=await this.list()
  if(choice==='remote'){
   const target=new Map(current);if(conflict.remote)target.set(path,conflict.remote);else target.delete(path)
   await this.apply(current,target)
  }
  const base=new Map(state.baseline.map(n=>[n.path,n]));if(conflict.remote)base.set(path,conflict.remote);else base.delete(path)
  state.baseline=[...base.values()];state.conflicts=state.conflicts.filter(c=>c.path!==path);await this.saveState(state)
 }
}
