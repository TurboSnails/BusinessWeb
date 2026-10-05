import {Plugin,Notice,FileSystemAdapter,TFile} from 'obsidian'
import {join} from 'node:path'
import {createRemote} from '../../knowledge-sync/transport'
import {syncOnce} from '../../knowledge-sync/engine'
import {ObsidianVaultAdapter,type VaultIO} from './vault-adapter'
import {SyncScheduler} from './scheduler'
import {nativeHttp} from './native-http'
import {SyncSettingsTab,type SyncSettings,defaults} from './settings'
export default class KnowledgeSyncPlugin extends Plugin {
 settings:SyncSettings={...defaults};adapter!:ObsidianVaultAdapter;scheduler!:SyncScheduler;private abort=new AbortController();private status!:HTMLElement
 async onload():Promise<void>{
  this.settings={...defaults,...await this.loadData()}
  if(!(this.app.vault.adapter instanceof FileSystemAdapter)){new Notice('此同步插件目前支持桌面电脑');return}
  const v=this.app.vault
  const file=(ref:{path:string})=>{const f=v.getAbstractFileByPath(ref.path);if(!(f instanceof TFile))throw new Error('笔记路径已改变');return f}
  const io:VaultIO={getMarkdownFiles:()=>v.getMarkdownFiles(),getAbstractFileByPath:p=>v.getAbstractFileByPath(p),read:r=>v.read(file(r)),process:(r,fn)=>v.process(file(r),fn),create:(p,c)=>v.create(p,c),createFolder:p=>v.createFolder(p),trash:(r,system)=>v.trash(file(r),system),rename:(r,p)=>v.rename(file(r),p)}
  this.adapter=new ObsidianVaultAdapter(io,this.app.vault.adapter.getBasePath(),join(this.app.vault.adapter.getBasePath(),this.manifest.dir!),this.abort.signal)
  this.status=this.addStatusBarItem();this.status.setText('知识同步：等待连接')
  this.scheduler=new SyncScheduler(()=>this.synchronize(),2000)
  this.addSettingTab(new SyncSettingsTab(this.app,this))
  this.addCommand({id:'sync-now',name:'立即同步知识库',callback:()=>{void this.scheduler.now().catch(()=>{})}})
  this.addRibbonIcon('refresh-cw','同步知识库',()=>{void this.scheduler.now().catch(()=>{})})
  for(const event of ['create','modify','delete','rename'] as const)this.registerEvent(v.on(event as 'modify',()=>this.scheduler.changed()))
  this.registerInterval(window.setInterval(()=>{void this.scheduler.now().catch(()=>{})},30000))
  this.app.workspace.onLayoutReady(()=>{if(this.settings.enabled)void this.scheduler.now().catch(()=>{})})
 }
 async testConnection():Promise<number>{return (await createRemote(this.settings.endpoint,this.settings.syncToken,nativeHttp(this.abort.signal)).head()).revision}
 async saveSettings():Promise<void>{await this.saveData(this.settings)}
 async synchronize():Promise<void>{
  if(!this.settings.enabled||!this.settings.syncToken)return
  this.status.setText('知识同步：同步中')
  try{
   const binding=this.settings.endpoint.trim()
   if(this.settings.boundEndpoint&&this.settings.boundEndpoint!==binding)throw new Error('服务器地址已改变，请使用独立仓库连接')
   const remote=createRemote(binding,this.settings.syncToken,nativeHttp(this.abort.signal))
   const result=await syncOnce(remote,this.adapter)
   this.settings.boundEndpoint=binding;await this.saveSettings()
   this.status.setText(result.status==='conflict'?`知识同步：${result.conflicts.length} 处冲突`:`知识同步：已同步 · v${result.head?.revision??0}`)
   if(result.status==='conflict')new Notice('有同步冲突，双方内容已保留。请在知识同步设置中处理。')
  }catch(e){this.status.setText('知识同步：连接或同步失败');new Notice(e instanceof Error?e.message:'同步失败');throw e}
 }
 onunload():void{this.scheduler?.stop();this.abort.abort()}
}
