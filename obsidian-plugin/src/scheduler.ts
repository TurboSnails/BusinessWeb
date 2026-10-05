export class SyncScheduler {
 private timer:ReturnType<typeof setTimeout>|null=null;private running:Promise<void>|null=null;private stopped=false
 constructor(private run:()=>Promise<void>,private delay=2000){}
 changed():void{if(this.stopped||this.running)return;if(this.timer)clearTimeout(this.timer);this.timer=setTimeout(()=>{this.timer=null;void this.now().catch(()=>{})},this.delay)}
 async now():Promise<void>{if(this.stopped)return;if(this.running)return this.running;if(this.timer){clearTimeout(this.timer);this.timer=null}this.running=Promise.resolve().then(()=>this.run());try{await this.running}finally{this.running=null}}
 async exclusive(action:()=>Promise<void>):Promise<void>{
  while(this.running)await this.running.catch(()=>{})
  if(this.stopped)return
  if(this.timer){clearTimeout(this.timer);this.timer=null}
  this.running=Promise.resolve().then(action);try{await this.running}finally{this.running=null}
 }
 stop():void{this.stopped=true;if(this.timer)clearTimeout(this.timer);this.timer=null}
}
