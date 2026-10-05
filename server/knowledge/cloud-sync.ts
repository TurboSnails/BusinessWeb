import type { Request, Response } from '../../api/knowledge.js'
import { authenticated, CloudError, object, readHead, type Database } from './cloud.js'
import { hashPattern, uuidPattern, validateNotes, validatePaths, type SyncHead } from './sync-contract.js'
import { resolveLinks } from './links.mjs'
export async function handleSync(req: Request, res: Response, db: Database, tokens: (string | undefined)[]): Promise<unknown> {
  const token = process.env.KNOWLEDGE_SYNC_TOKEN
  if (!token || token.length < 32 || tokens.includes(token)) throw new CloudError(503, '同步凭据尚未配置')
  if (!authenticated(req.headers.authorization,token)) throw new CloudError(401,'同步凭据无效')
  const action = req.query?.action
  if (action === 'sync-head') {
    if (req.method !== 'GET') throw new CloudError(405,'需要 GET 请求')
    const h = await readHead(db); return res.status(200).json({revision:h.revision,generation:h.generation,vaultId:h.vault_id})
  }
  if (action === 'sync-manifest' || action === 'sync-note') {
    if (req.method !== 'GET') throw new CloudError(405,'需要 GET 请求')
    const generation = req.query?.generation
    if (typeof generation !== 'string' || !uuidPattern.test(generation)) throw new CloudError(400,'缺少固定快照版本')
    if (action === 'sync-manifest') {
      const cursor = req.query?.cursor
      if (cursor !== undefined && (typeof cursor !== 'string' || cursor.length > 500)) throw new CloudError(400,'分页游标无效')
      const result = await db('rpc/businessweb_sync_manifest','POST',{ requested_generation:generation, after_path:cursor ?? null })
      if (!object(result)) throw new CloudError(404,'快照不存在或尚未发布')
      return res.status(200).json(result)
    }
    const path = req.query?.path
    if (typeof path !== 'string') throw new CloudError(400,'笔记路径无效')
    try { validatePaths([path]) } catch { throw new CloudError(400,'笔记路径无效') }
    const result = await db('rpc/businessweb_sync_note','POST',{ requested_generation:generation, requested_path:path })
    if (!object(result)) throw new CloudError(404,'笔记或快照不存在')
    return res.status(200).json(result)
  }
  if (req.method !== 'POST') throw new CloudError(405,'需要 POST 请求')
  let body = req.body
  if (Buffer.byteLength(typeof body === 'string' ? body : JSON.stringify(body) || '') > 2_800_000) throw new CloudError(413,'同步请求过大')
  if (typeof body === 'string') { try { body=JSON.parse(body) } catch { throw new CloudError(400,'无效 JSON') } }
  if (!object(body) || typeof body.generation !== 'string' || !uuidPattern.test(body.generation) || typeof body.vaultId !== 'string' || !hashPattern.test(body.vaultId)) throw new CloudError(400,'同步版本无效')
  if (action === 'sync-batch') {
    let notes
    try { notes = validateNotes(body.notes,100) } catch { throw new CloudError(400,'同步笔记校验失败') }
    if (!notes.length) throw new CloudError(400,'上传批次不能为空')
    await db('rpc/businessweb_sync_stage','POST',{next_generation:body.generation,next_vault_id:body.vaultId,notes})
    return res.status(200).json({ok:true})
  }
  if (action !== 'sync-commit') throw new CloudError(404,'同步接口不存在')
  const expected = body.expectedHead as SyncHead
  if (!expected || !Number.isSafeInteger(expected.revision) || expected.revision < 0 || !Number.isInteger(body.count) || Number(body.count) < 0 || Number(body.count) > 10000) throw new CloudError(400,'发布参数无效')
  const head = await readHead(db)
  if (head.generation === body.generation) return res.status(200).json({revision:head.revision,generation:head.generation,vaultId:head.vault_id})
  if (head.revision !== expected.revision || head.generation !== expected.generation || head.vault_id !== expected.vaultId || (head.vault_id && head.vault_id !== body.vaultId)) throw new CloudError(409,'其他设备已发布新版本')
  const rows: { payload: { note: {path:string;content:string;version:string;vaultId:string} } }[]=[]
  for (let offset=0;;offset+=100) {
    const page = await db(`businessweb_knowledge_notes?generation=eq.${body.generation}&select=payload&order=path&limit=100&offset=${offset}`)
    if (!Array.isArray(page)) throw new CloudError(502,'暂存快照无效')
    rows.push(...page); if (rows.length>10000) throw new CloudError(413,'笔记过多'); if(page.length<100) break
  }
  let notes
  try { notes = validateNotes(rows.map(r=>r.payload.note)) } catch { throw new CloudError(400,'快照笔记校验失败') }
  if (notes.length !== body.count || rows.some(r=>r.payload.note.vaultId!==body.vaultId)) throw new CloudError(409,'批次不完整或身份不一致')
  const infos=notes.map(n=>({path:n.path,title:n.content.match(/^#\s+(.+)$/m)?.[1]||n.path.split('/').pop()!.slice(0,-3)}))
  const edges=new Map<string,{source:string;target:string}>(), relations=new Map<string,ReturnType<typeof resolveLinks>>(); let unresolved=0
  for (const note of notes) {
    const outgoing=resolveLinks(note.content,note.path,infos); relations.set(note.path,outgoing)
    for (const link of outgoing) {
      if (link.status==='missing'||link.status==='ambiguous') unresolved++
      if (link.path && link.path!==note.path) edges.set(JSON.stringify([note.path,link.path]),{source:note.path,target:link.path})
    }
  }
  const graph={vaultId:body.vaultId,nodes:infos,edges:[...edges.values()],unresolved}
  const payloads=notes.map((note,i)=>({note:{...note,title:infos[i].title,vaultId:body.vaultId},relations:{outgoing:relations.get(note.path),backlinks:infos.filter(info=>edges.has(JSON.stringify([info.path,note.path])))}}))
  const ok=await db('rpc/businessweb_sync_publish','POST',{expected_revision:expected.revision,next_generation:body.generation,next_vault_id:body.vaultId,next_graph:graph,note_count:notes.length,relations:payloads.map(p=>({path:p.note.path,relations:p.relations}))})
  if (ok!==true) throw new CloudError(409,'发布版本冲突')
  return res.status(200).json({revision:expected.revision+1,generation:body.generation,vaultId:body.vaultId})
}
