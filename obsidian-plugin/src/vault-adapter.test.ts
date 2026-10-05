import {expect,it} from 'vitest'
import {mkdtemp,readFile,rm,mkdir,writeFile,symlink} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {hash,type SyncNote} from '../../server/knowledge/sync-contract'
import {ObsidianVaultAdapter} from './vault-adapter'
const n=(p:string,c:string):SyncNote=>({path:p,content:c,version:hash(c)})
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'sync-adapter-'));const files=new Map<string,{path:string;extension:string}>();const get=(path:string)=>files.get(path)??null
 const vault={getMarkdownFiles:()=>[...files.values()],getAbstractFileByPath:get,read:async(f:{path:string})=>readFile(join(root,f.path),'utf8'),process:async(f:{path:string},fn:(s:string)=>string)=>{await writeFile(join(root,f.path),fn(await readFile(join(root,f.path),'utf8')))},create:async(p:string,c:string)=>{await writeFile(join(root,p),c,{flag:'wx'});const f={path:p,extension:'md'};files.set(p,f);return f},createFolder:async(p:string)=>mkdir(join(root,p),{recursive:true}),rename:async(f:{path:string},p:string)=>{await mkdir(join(root,p.split('/').slice(0,-1).join('/')),{recursive:true});await import('node:fs/promises').then(fs=>fs.rename(join(root,f.path),join(root,p)));files.delete(f.path);f.path=p},trash:async(f:{path:string})=>{await mkdir(join(root,'.trash'),{recursive:true});await writeFile(join(root,'.trash',f.path.replaceAll('/','_')),await readFile(join(root,f.path)));await rm(join(root,f.path));files.delete(f.path)}}
 const adapter=new ObsidianVaultAdapter(vault,root,join(root,'.obsidian/plugins/businessweb-knowledge-sync'))
 return {root,vault,adapter,cleanup:()=>rm(root,{recursive:true,force:true})}
}
it('applies files and preserves deleted originals in trash',async()=>{const f=await fixture();try{await f.adapter.apply(new Map(),new Map([['A.md',n('A.md','old')]]));await f.adapter.apply(new Map([['A.md',n('A.md','old')]]),new Map());expect((await import('node:fs/promises').then(fs=>fs.readdir(join(f.root,'.trash')))).length).toBeGreaterThan(0)}finally{await f.cleanup()}})
it('rejects files edited since the snapshot',async()=>{const f=await fixture();try{await f.vault.create('A.md','mine');await expect(f.adapter.apply(new Map([['A.md',n('A.md','old')]]),new Map([['A.md',n('A.md','remote')]]))).rejects.toThrow();expect(await readFile(join(f.root,'A.md'),'utf8')).toBe('mine')}finally{await f.cleanup()}})
it('does not follow a symlink outside the vault',async()=>{const f=await fixture();try{await symlink(tmpdir(),join(f.root,'outside'));await expect(f.adapter.apply(new Map(),new Map([['outside/A.md',n('outside/A.md','remote')]]))).rejects.toThrow()}finally{await f.cleanup()}})
it('conflict exports retain both contents and are excluded from list',async()=>{const f=await fixture();try{await f.vault.create('A.md','mine');await f.adapter.preserveConflicts([{path:'A.md',local:n('A.md','mine'),remote:n('A.md','theirs')}]);expect((await f.adapter.list()).size).toBe(1);expect(f.vault.getMarkdownFiles().filter(n=>n.path.startsWith('Sync-Conflicts/'))).toHaveLength(2)}finally{await f.cleanup()}})
it('restores an edit made immediately before deletion moves the file',async()=>{
 const f=await fixture();try{await f.vault.create('A.md','old');const move=f.vault.rename;f.vault.rename=async(file,path)=>{await writeFile(join(f.root,file.path),'fresh');return move(file,path)}
 await expect(f.adapter.apply(new Map([['A.md',n('A.md','old')]]),new Map())).rejects.toThrow();expect(await readFile(join(f.root,'A.md'),'utf8')).toBe('fresh')
 }finally{await f.cleanup()}
})
