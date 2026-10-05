import { expect, it } from 'vitest'
import { validateNotes, validatePaths } from './sync-contract'
const empty = { path: 'A.md', content: '', version: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' }
it('refuses forged content hashes', () => expect(() => validateNotes([{ ...empty, content: 'changed' }])).toThrow())
it('accepts an empty snapshot and real SHA-256', () => { expect(validateNotes([])).toEqual([]); expect(validateNotes([empty])).toEqual([empty]) })
it.each(['../A.md', '/A.md', 'a\\b.md', '.obsidian/A.md', 'A\u0000.md', 'CON.md', 'a./B.md', 'A.md/inside.md', 'Sync-Conflicts/a.md'])('rejects unsafe path %s', path => expect(() => validateNotes([{ ...empty, path }])).toThrow())
it('rejects duplicates and cross-platform collisions', () => { for (const paths of [['A.md','A.md'], ['A.md','a.md'], ['café.md','café.md'], ['A/B.md','a/C.md']]) expect(() => validatePaths(paths)).toThrow() })
it('detects full Unicode case-fold collisions before writing',()=>{for(const pair of [['Σ.md','ς.md'],['SS.md','ß.md'],['A/Σ.md','A/ς.md']])expect(()=>validatePaths(pair)).toThrow()})
