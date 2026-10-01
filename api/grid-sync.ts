import { timingSafeEqual } from 'node:crypto'
import { validSavedRecord } from '../src/features/grid-trading/validation'

type Request = { method?: string; headers: Record<string, string | string[] | undefined>; body?: unknown }
type Response = {
  setHeader(name: string, value: string): unknown
  status(code: number): Response
  json(body: unknown): unknown
}
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
function validPayload(value: unknown): boolean {
  if (!object(value) || value.schemaVersion !== 1 || !Array.isArray(value.records) || value.records.length > 500) return false
  const ids = new Set<string>()
  return value.records.every(item => {
    if (!object(item) || typeof item.id !== 'string' || !item.id.trim() || item.id.length > 200 || ids.has(item.id)) return false
    ids.add(item.id)
    if (item.deleted === true) return typeof (item.updatedAt ?? item.savedAt) === 'string' && Number.isFinite(Date.parse(String(item.updatedAt ?? item.savedAt)))
    return validSavedRecord(item)
  })
}

export default async function handler(req: Request, res: Response): Promise<unknown> {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET' && req.method !== 'PUT') {
    res.setHeader('Allow', 'GET, PUT')
    return res.status(405).json({ error: '只支持 GET 和 PUT 请求' })
  }
  const { SUPABASE_URL: base, SUPABASE_SECRET_KEY: key, GRID_SYNC_TOKEN: token } = process.env
  let origin: string
  try {
    const url = new URL(base ?? '')
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co') || url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.port) throw new Error()
    origin = url.origin
  } catch {
    return res.status(503).json({ error: '独立同步服务尚未配置' })
  }
  if (!key || !token || token.length < 32) return res.status(503).json({ error: '独立同步服务尚未配置' })
  const received = typeof req.headers.authorization === 'string' ? req.headers.authorization : ''
  const expected = `Bearer ${token}`
  if (Buffer.byteLength(received) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(received), Buffer.from(expected))) {
    return res.status(401).json({ error: '同步 token 无效' })
  }
  let payload = req.body
  let revision = 0
  if (req.method === 'PUT') {
    const match = typeof req.headers['if-match'] === 'string' && /^"(\d+)"$/.exec(req.headers['if-match'])
    if (!match || !Number.isSafeInteger(Number(match[1]))) return res.status(428).json({ error: '请先读取云端版本后再同步' })
    revision = Number(match[1])
    try {
      const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload)
      if (!serialized || Buffer.byteLength(serialized) > 3_000_000) return res.status(413).json({ error: '同步数据过大，请先导出备份并减少记录' })
      if (typeof payload === 'string') payload = JSON.parse(payload)
    } catch {
      return res.status(400).json({ error: '同步数据必须为有效 JSON' })
    }
    if (!validPayload(payload)) return res.status(400).json({ error: '同步记录结构或版本无效（最多 500 条）' })
  }
  const headers: Record<string, string> = { apikey: key, 'content-type': 'application/json' }
  // New secret keys use apikey; legacy service_role JWTs also need Authorization.
  if (!key.startsWith('sb_secret_')) headers.authorization = `Bearer ${key}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 6_000)
  try {
    const read = req.method === 'GET'
    const upstream = await fetch(read
      ? `${origin}/rest/v1/businessweb_grid_snapshot?id=eq.1&select=revision,payload`
      : `${origin}/rest/v1/rpc/businessweb_put_grid_snapshot`, {
      method: read ? 'GET' : 'POST', headers, signal: controller.signal, redirect: 'error',
      ...(read ? {} : { body: JSON.stringify({ expected_revision: revision, next_payload: payload }) }),
    })
    if (!upstream.ok) return res.status(502).json({ error: '独立数据库暂时不可用，请检查服务配置' })
    const data: unknown = await upstream.json()
    if (read) {
      const snapshot = Array.isArray(data) && data.length === 1 ? data[0] : null
      if (!object(snapshot) || !Number.isSafeInteger(snapshot.revision) || Number(snapshot.revision) < 0 || !validPayload(snapshot.payload)) {
        return res.status(502).json({ error: '云端数据结构无效，请检查数据库迁移' })
      }
      res.setHeader('ETag', `"${snapshot.revision}"`)
      return res.status(200).json(snapshot.payload)
    }
    if (data === false) return res.status(409).json({ error: '其他设备已更新云端记录，请重新同步' })
    if (data !== true) return res.status(502).json({ error: '云端写入响应无效' })
    return res.status(200).json({ ok: true })
  } catch {
    return res.status(controller.signal.aborted ? 504 : 502).json({ error: '独立数据库请求失败，请稍后重试' })
  } finally {
    clearTimeout(timer)
  }
}
