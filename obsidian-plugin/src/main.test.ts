import {expect,it,vi} from 'vitest'
import {EventEmitter} from 'node:events'
const captured=vi.hoisted(()=>({signal:null as AbortSignal|null}))
vi.mock('obsidian',()=>({Plugin:class {},PluginSettingTab:class {},Notice:class {},FileSystemAdapter:class {},TFile:class {},Setting:class {}}))
vi.mock('node:https',()=>({request:(_url:string,options:{signal:AbortSignal})=>{captured.signal=options.signal;const req=new EventEmitter() as EventEmitter & {end():void;write():void};req.end=()=>{};req.write=()=>{};options.signal.addEventListener('abort',()=>req.emit('error',new Error('aborted')));return req}}))
import KnowledgeSyncPlugin from './main'
it('plugin unload aborts an in-flight settings connection test',async()=>{const plugin=new KnowledgeSyncPlugin();plugin.settings.syncToken='s'.repeat(40);const test=plugin.testConnection();const rejection=expect(test).rejects.toThrow();expect(captured.signal?.aborted).toBe(false);plugin.onunload();await rejection;expect(captured.signal?.aborted).toBe(true)})
