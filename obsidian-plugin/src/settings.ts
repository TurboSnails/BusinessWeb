import {App,PluginSettingTab,Setting,Notice} from 'obsidian'
import type KnowledgeSyncPlugin from './main'
export type SyncSettings={endpoint:string;syncToken:string;enabled:boolean;boundEndpoint:string}
export const defaults:SyncSettings={endpoint:'https://business-web-black.vercel.app/api/knowledge',syncToken:'',enabled:false,boundEndpoint:''}
export class SyncSettingsTab extends PluginSettingTab{
 constructor(app:App,private plugin:KnowledgeSyncPlugin){super(app,plugin)}
 display():void{
  const {containerEl}=this;containerEl.empty();containerEl.createEl('h2',{text:'自己的服务器 · 知识同步'})
  containerEl.createEl('p',{text:'仅笔记同步，图片/PDF 尚未同步。新电脑首次连接先下载；完成后自动同步修改。'})
  new Setting(containerEl).setName('服务器地址').addText(t=>t.setValue(this.plugin.settings.endpoint).onChange(async value=>{this.plugin.settings.endpoint=value.trim();await this.plugin.saveSettings()}))
  new Setting(containerEl).setName('同步凭据').setDesc('使用服务器的 KNOWLEDGE_SYNC_TOKEN。凭据保存在本机插件 data.json，请勿分享此文件；它不参与笔记同步。').addText(t=>{t.inputEl.type='password';t.setValue(this.plugin.settings.syncToken).onChange(async value=>{this.plugin.settings.syncToken=value.trim();await this.plugin.saveSettings()})})
  new Setting(containerEl).setName('测试连接').addButton(b=>b.setButtonText('测试').onClick(async()=>{try{const revision=await this.plugin.testConnection();new Notice(`连接成功，服务器版本 ${revision}`)}catch(e){new Notice(e instanceof Error?e.message:'连接失败')}}))
  new Setting(containerEl).setName('自动同步').setDesc('每 30 秒检查服务器，修改笔记后自动同步。').addToggle(t=>t.setValue(this.plugin.settings.enabled).onChange(async value=>{this.plugin.settings.enabled=value;await this.plugin.saveSettings();if(value)void this.plugin.scheduler.now().catch(()=>{})}))
  new Setting(containerEl).setName('立即同步').addButton(b=>b.setButtonText('同步').onClick(async()=>{if(!this.plugin.settings.enabled){new Notice('请先启用自动同步');return}await this.plugin.scheduler.now().catch(()=>{});this.display()}))
  void this.showConflicts(containerEl)
 }
 private async showConflicts(container:HTMLElement):Promise<void>{
  try{const state=await this.plugin.adapter.loadState();for(const c of state?.conflicts??[]){
   new Setting(container).setName(c.path).setDesc('双方内容保存在 Sync-Conflicts；先阅读副本，再选择保留哪一版。')
    .addButton(b=>b.setButtonText('保留本地').onClick(async()=>{try{await this.plugin.scheduler.exclusive(()=>this.plugin.adapter.resolveConflict(c.path,'local'));this.display()}catch(e){new Notice(String(e))}}))
    .addButton(b=>b.setButtonText('采用服务器').onClick(async()=>{try{await this.plugin.scheduler.exclusive(()=>this.plugin.adapter.resolveConflict(c.path,'remote'));this.display()}catch(e){new Notice(String(e))}}))
  }}catch{container.createEl('p',{text:'同步状态不可读，已停止以保护笔记。'})}
 }
}
