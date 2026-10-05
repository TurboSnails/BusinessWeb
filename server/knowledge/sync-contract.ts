import { createHash } from 'node:crypto'
export type SyncHead = { revision: number; generation: string | null; vaultId: string | null }
export type SyncNote = { path: string; content: string; version: string }
export type SyncManifest = { head: SyncHead; notes: { path: string; version: string }[]; nextCursor: string | null }
export const hash = (content: string): string => createHash('sha256').update(content, 'utf8').digest('hex')
export const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
export const hashPattern = /^[a-f0-9]{64}$/
export function validatePaths(paths: string[]): void {
  const files = new Set<string>(), segments = new Map<string,string>()
  for (const path of paths) {
    if (typeof path !== 'string' || path.length > 500 || !path.endsWith('.md') || /[\\\x00-\x1f\x7f]/.test(path)) throw new Error('笔记路径无效')
    const parts = path.split('/'); let full = ''
    for (const part of parts) {
      if (!part || part.startsWith('.') || /[<>:"|?*]/.test(part) || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part)) throw new Error('笔记路径不兼容')
      full = full ? `${full}/${part}` : part
      const canonical = full.normalize('NFC').toUpperCase().toLowerCase().normalize('NFC')
      if (segments.has(canonical) && segments.get(canonical) !== full) throw new Error('路径存在大小写或 Unicode 冲突')
      segments.set(canonical,full)
    }
    if (parts.slice(0,-1).some(p=>p.toLowerCase().endsWith('.md'))) throw new Error('笔记不能作为文件夹')
    if (parts[0].toLowerCase() === 'sync-conflicts') throw new Error('冲突目录不能自动同步')
    const canonical = path.normalize('NFC').toUpperCase().toLowerCase().normalize('NFC')
    if (files.has(canonical)) throw new Error('笔记路径重复')
    files.add(canonical)
  }
  for (const path of paths) {
    const parts = path.split('/'); parts.pop()
    while (parts.length) { if (files.has(parts.join('/').normalize('NFC').toUpperCase().toLowerCase().normalize('NFC'))) throw new Error('笔记与文件夹路径冲突'); parts.pop() }
  }
}
export function validateNotes(notes: unknown, max = 10000): SyncNote[] {
  if (!Array.isArray(notes) || notes.length > max) throw new Error('笔记数量无效')
  for (const note of notes) {
    if (!note || typeof note.path !== 'string' || typeof note.content !== 'string' || typeof note.version !== 'string' || Buffer.byteLength(note.content) > 1024 * 1024 || !hashPattern.test(note.version) || hash(note.content) !== note.version) throw new Error('笔记正文或 SHA-256 校验失败')
  }
  validatePaths(notes.map(n => n.path)); return notes.map(({path,content,version}) => ({path,content,version}))
}
export function validateHead(head: unknown): SyncHead {
  const h = head as SyncHead
  if (!h || !Number.isSafeInteger(h.revision) || h.revision < 0 || (h.generation !== null && (typeof h.generation !== 'string' || !uuidPattern.test(h.generation))) || (h.vaultId !== null && (typeof h.vaultId !== 'string' || !hashPattern.test(h.vaultId))) || (h.generation === null) !== (h.vaultId === null)) throw new Error('云端版本无效')
  return { revision:h.revision,generation:h.generation,vaultId:h.vaultId }
}
