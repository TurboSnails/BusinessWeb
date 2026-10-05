import { expect, it } from 'vitest'
import { hash, type SyncNote } from '../server/knowledge/sync-contract'
import { mergeNotes } from './merge'
const n=(path:string,content:string):SyncNote=>({path,content,version:hash(content)})
const m=(...notes:SyncNote[])=>new Map(notes.map(n=>[n.path,n]))
it('preserves edits to different notes from two devices',()=>{
 const result=mergeNotes(m(n('A.md','0'),n('B.md','0')),m(n('A.md','1'),n('B.md','0')),m(n('A.md','0'),n('B.md','2')))
 expect([...result.merged.values()].map(n=>n.content)).toEqual(['1','2']);expect(result.conflicts).toEqual([])
})
it('retains both contents when edits diverge',()=>{
 const result=mergeNotes(m(n('A.md','0')),m(n('A.md','1')),m(n('A.md','2')))
 expect(result.conflicts).toEqual([{path:'A.md',local:n('A.md','1'),remote:n('A.md','2')}])
})
it('deletion versus edit is a conflict',()=>expect(mergeNotes(m(n('A.md','0')),m(),m(n('A.md','2'))).conflicts).toHaveLength(1))
it('deletion versus unchanged deletes',()=>expect(mergeNotes(m(n('A.md','0')),m(),m(n('A.md','0'))).merged.size).toBe(0))
it('identical concurrent edits converge',()=>expect(mergeNotes(m(n('A.md','0')),m(n('A.md','1')),m(n('A.md','1'))).conflicts).toEqual([]))
it('a new device retains independent local notes',()=>expect(mergeNotes(m(),m(n('L.md','local')),m(n('R.md','remote'))).merged.size).toBe(2))
it('no baseline never overwrites different existing content',()=>expect(mergeNotes(m(),m(n('A.md','1')),m(n('A.md','2'))).conflicts).toHaveLength(1))
it('rename versus edit retains both pieces',()=>{const r=mergeNotes(m(n('A.md','0')),m(n('Renamed.md','0')),m(n('A.md','1')));expect(r.conflicts).toHaveLength(1);expect(r.merged.has('Renamed.md')).toBe(true)})
it('cross-platform aliases refuse changes',()=>expect(()=>mergeNotes(m(),m(n('A.md','1')),m(n('a.md','2')))).toThrow())
