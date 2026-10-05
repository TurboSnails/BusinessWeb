import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { configuredVault, projectRoot } from '../server/knowledge/config.mjs'
import { resolveLinks } from '../server/knowledge/links.mjs'
const directory = resolve(projectRoot, '.local/knowledge-cloud')
await mkdir(directory, { recursive: true, mode: 0o700 })
const vault = configuredVault(), status = await vault.status(), infos = await vault.list()
const notes = [], links = new Map(), backlinks = new Map(), edges = new Map()
let unresolved = 0
for (const info of infos) {
  const note = await vault.read(info.path)
  const outgoing = resolveLinks(note.content, note.path, infos)
  links.set(note.path, outgoing)
  for (const link of outgoing) {
    if (['missing', 'ambiguous'].includes(link.status)) unresolved++
    if (link.path && link.path !== note.path) {
      edges.set(JSON.stringify([note.path, link.path]), { source: note.path, target: link.path })
      if (!backlinks.has(link.path)) backlinks.set(link.path, new Map())
      backlinks.get(link.path).set(note.path, info)
    }
  }
  notes.push({ note })
}
for (const item of notes) item.relations = { outgoing: links.get(item.note.path), backlinks: [...(backlinks.get(item.note.path)?.values() || [])] }
const graph = { vaultId: status.vaultId, nodes: infos.map(({ path, title }) => ({ path, title })), edges: [...edges.values()], unresolved }
const generation = randomUUID(), batches = []
let batch = []
for (const item of notes) {
  if (batch.length && (batch.length === 100 || Buffer.byteLength(JSON.stringify({ generation, notes: [...batch, item] })) > 2_800_000)) { batches.push(batch); batch = [] }
  batch.push(item)
  if (Buffer.byteLength(JSON.stringify({ generation, notes: batch })) > 2_800_000) throw new Error('单篇笔记及关联超过云端批次限制')
}
if (batch.length) batches.push(batch)
const summary = { generatedAt: new Date().toISOString(), notes: notes.length, edges: graph.edges.length, unresolved, batches: batches.length, maxBatchBytes: Math.max(...batches.map(notes => Buffer.byteLength(JSON.stringify({ generation, notes })))), graphBytes: Buffer.byteLength(JSON.stringify(graph)), contentBytes: notes.reduce((n, item) => n + Buffer.byteLength(item.note.content), 0), attachmentsUploaded: 0 }
await writeFile(resolve(directory, 'snapshot.json'), JSON.stringify({ generation, vaultId: status.vaultId, notes, graph }), { mode: 0o600 })
await writeFile(resolve(directory, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', { mode: 0o600 })
console.log(JSON.stringify(summary, null, 2))
if (!process.argv.includes('--upload')) { console.log('已准备本地私有快照，未向云端发送数据。'); process.exit(0) }
const config = JSON.parse(await readFile(resolve(directory, 'config.json'), 'utf8'))
const url = new URL(config.endpoint)
if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/api/knowledge') throw new Error('endpoint 必须是 HTTPS /api/knowledge 地址')
if (typeof config.uploadToken !== 'string' || config.uploadToken.length < 32) throw new Error('需要至少 32 字符的 uploadToken')
async function request(action, body) {
  const res = await fetch(`${url.href}?action=${action}`, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${config.uploadToken}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000), redirect: 'error' })
  const data = await res.json()
  if (!res.ok) throw new Error(`云端 ${action} 失败 (${res.status})：${data.error || '请求失败'}`)
  return data
}
const before = await request('sync-status')
for (let i = 0; i < batches.length; i++) { await request('batch', { generation, notes: batches[i] }); console.log(`上传批次 ${i + 1}/${batches.length}`) }
await request('commit', { generation, vaultId: status.vaultId, expectedRevision: before.revision, graph })
const after = await request('sync-status')
if (after.generation !== generation || after.revision !== before.revision + 1) throw new Error('发布后的版本验证失败')
await writeFile(resolve(directory, 'last-sync.json'), JSON.stringify({ ...summary, revision: after.revision, generation }, null, 2) + '\n', { mode: 0o600 })
console.log(`云端同步并验证成功：${summary.notes} 篇，${summary.edges} 条引用，版本 ${after.revision}。`)
