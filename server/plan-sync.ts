// 站长计划云同步：鉴权 / 校验 / ETag CAS。可注入 env/fetch；禁止日志输出 body/金额/token。
import { timingSafeEqual } from 'node:crypto'
import { parsePlanDocument } from '../src/features/investment-plan/validation.js'
import { MAX_PLAN_BYTES, type PlanDocument } from '../src/features/investment-plan/types.js'

type HeaderValue = string | string[] | undefined
type Request = {
  method?: string
  headers: Record<string, HeaderValue>
  body?: unknown
}
type Response = {
  setHeader(name: string, value: string): unknown
  status(code: number): Response
  json(body: unknown): unknown
}

export type PlanSyncEnv = Record<string, string | undefined>
export type PlanSyncFetch = typeof fetch

export interface PlanSyncDeps {
  env: PlanSyncEnv
  fetch: PlanSyncFetch
  now?: () => Date
}

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const DEFAULT_ORIGIN = 'https://business-web-black.vercel.app'
/** HTTP 包装上限：document 262144 + 少量包装字段 */
const MAX_WRAPPER_BYTES = 263168

function header(req: Request, name: string): string {
  const v = req.headers[name] ?? req.headers[name.toLowerCase()]
  return typeof v === 'string' ? v : Array.isArray(v) ? (v[0] ?? '') : ''
}

function secureEqualBearer(received: string, token: string): boolean {
  const expected = `Bearer ${token}`
  const a = Buffer.from(received)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function parseTrustedHttpsRoot(raw: string | undefined): string | null {
  try {
    const url = new URL(raw ?? '')
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash ||
      url.port
    ) {
      return null
    }
    return url.origin
  } catch {
    return null
  }
}

function parseSupabaseOrigin(raw: string | undefined): string | null {
  const origin = parseTrustedHttpsRoot(raw)
  if (!origin) return null
  try {
    const host = new URL(origin).hostname
    if (!host.endsWith('.supabase.co')) return null
    return origin
  } catch {
    return null
  }
}

function supabaseHeaders(key: string): Record<string, string> {
  const headers: Record<string, string> = { apikey: key, 'content-type': 'application/json' }
  if (!key.startsWith('sb_secret_')) headers.authorization = `Bearer ${key}`
  return headers
}

function noStore(res: Response): void {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
}

function setRevisionHeaders(res: Response, revision: number): void {
  res.setHeader('ETag', `"${revision}"`)
  res.setHeader('X-Revision', String(revision))
}

function isSafeNonNegInt(n: number): boolean {
  return Number.isSafeInteger(n) && n >= 0
}

function parseIfMatch(raw: string): number | null {
  const m = /^"(\d+)"$/.exec(raw.trim())
  if (!m) return null
  const n = Number(m[1])
  return isSafeNonNegInt(n) ? n : null
}

function documentBytes(doc: unknown): number {
  return Buffer.byteLength(JSON.stringify(doc), 'utf8')
}

function validateCloudDocument(payload: unknown): PlanDocument | null {
  if (payload === null) return null
  const parsed = parsePlanDocument(payload)
  return parsed.ok ? parsed.value : null
}

export function createPlanSyncHandler(deps: PlanSyncDeps) {
  return async function handler(req: Request, res: Response): Promise<unknown> {
    noStore(res)
    const method = (req.method ?? 'GET').toUpperCase()
    if (method !== 'GET' && method !== 'PUT') {
      res.setHeader('Allow', 'GET, PUT')
      return res.status(405).json({ error: '只支持 GET 和 PUT 请求' })
    }

    const { SUPABASE_URL: base, SUPABASE_SECRET_KEY: key, PLAN_SYNC_TOKEN: token } = deps.env
    const supabaseOrigin = parseSupabaseOrigin(base)
    if (!supabaseOrigin || !key || !token || token.length < 32) {
      return res.status(503).json({ error: '计划同步服务尚未配置' })
    }

    const received = header(req, 'authorization')
    if (!secureEqualBearer(received, token)) {
      return res.status(401).json({ error: '同步 token 无效' })
    }

    const trustedOrigin =
      parseTrustedHttpsRoot(deps.env.PLAN_SYNC_ORIGIN) ?? DEFAULT_ORIGIN
    const originHeader = header(req, 'origin')
    if (originHeader) {
      let requestOrigin = ''
      try {
        const u = new URL(originHeader)
        if (
          u.protocol !== 'https:' ||
          u.username ||
          u.password ||
          u.search ||
          u.hash ||
          u.port
        ) {
          return res.status(403).json({ error: '不允许的来源' })
        }
        requestOrigin = u.origin
      } catch {
        return res.status(403).json({ error: '不允许的来源' })
      }
      if (requestOrigin !== trustedOrigin) {
        return res.status(403).json({ error: '不允许的来源' })
      }
    }

    let expectedRevision = 0
    let nextDocument: PlanDocument | null = null

    if (method === 'PUT') {
      const contentType = header(req, 'content-type')
      if (!contentType.toLowerCase().includes('application/json')) {
        return res.status(415).json({ error: '请使用 application/json' })
      }
      const matchRaw = header(req, 'if-match')
      if (!matchRaw) return res.status(428).json({ error: '请先读取云端版本后再同步' })
      if (matchRaw.includes(',') || matchRaw.trim() === '*') {
        return res.status(428).json({ error: '请先读取云端版本后再同步' })
      }
      const matched = parseIfMatch(matchRaw)
      if (matched === null) return res.status(428).json({ error: '请先读取云端版本后再同步' })
      expectedRevision = matched

      let payload: unknown = req.body
      let serialized: string
      try {
        serialized = typeof payload === 'string' ? payload : JSON.stringify(payload)
        if (!serialized) return res.status(400).json({ error: '同步数据必须为有效 JSON' })
        if (Buffer.byteLength(serialized, 'utf8') > MAX_WRAPPER_BYTES) {
          return res.status(413).json({ error: '同步数据过大' })
        }
        if (typeof payload === 'string') payload = JSON.parse(payload)
      } catch {
        return res.status(400).json({ error: '同步数据必须为有效 JSON' })
      }
      if (!object(payload) || payload.schemaVersion !== 1 || !('document' in payload)) {
        return res.status(400).json({ error: '计划包装无效' })
      }
      if (payload.document === null) {
        return res.status(400).json({ error: '计划文档无效' })
      }
      if (documentBytes(payload.document) > MAX_PLAN_BYTES) {
        return res.status(413).json({ error: '同步数据过大' })
      }
      const parsed = parsePlanDocument(payload.document)
      if (!parsed.ok) return res.status(400).json({ error: '计划文档无效' })
      nextDocument = parsed.value
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 6_000)
    try {
      const headers = supabaseHeaders(key)
      if (method === 'GET') {
        const upstream = await deps.fetch(
          `${supabaseOrigin}/rest/v1/businessweb_plan_snapshot?id=eq.1&select=revision,payload`,
          { method: 'GET', headers, signal: controller.signal, redirect: 'error' },
        )
        if (!upstream.ok) return res.status(502).json({ error: '数据库暂时不可用，请检查服务配置' })
        const data: unknown = await upstream.json()
        const row = Array.isArray(data) && data.length === 1 ? data[0] : null
        if (!object(row) || !isSafeNonNegInt(Number(row.revision))) {
          return res.status(502).json({ error: '云端数据结构无效，请检查数据库迁移' })
        }
        const revision = Number(row.revision)
        if (row.payload === null || row.payload === undefined) {
          setRevisionHeaders(res, revision)
          return res.status(200).json({ schemaVersion: 1, document: null })
        }
        const doc = validateCloudDocument(row.payload)
        if (!doc) return res.status(502).json({ error: '云端数据结构无效，请检查数据库迁移' })
        setRevisionHeaders(res, revision)
        return res.status(200).json({ schemaVersion: 1, document: doc })
      }

      // PUT
      const upstream = await deps.fetch(`${supabaseOrigin}/rest/v1/rpc/businessweb_put_plan_snapshot`, {
        method: 'POST',
        headers,
        signal: controller.signal,
        redirect: 'error',
        body: JSON.stringify({ expected_revision: expectedRevision, next_payload: nextDocument }),
      })
      if (!upstream.ok) return res.status(502).json({ error: '数据库暂时不可用，请检查服务配置' })
      const data: unknown = await upstream.json()
      if (data === null) {
        // CAS 冲突：再读当前 revision，不回显金额
        let latestRevision = expectedRevision
        try {
          const read = await deps.fetch(
            `${supabaseOrigin}/rest/v1/businessweb_plan_snapshot?id=eq.1&select=revision`,
            { method: 'GET', headers, signal: controller.signal, redirect: 'error' },
          )
          if (read.ok) {
            const rows: unknown = await read.json()
            const row = Array.isArray(rows) && rows[0] && object(rows[0]) ? rows[0] : null
            if (row && isSafeNonNegInt(Number(row.revision))) latestRevision = Number(row.revision)
          }
        } catch {
          /* 固定错误即可 */
        }
        return res.status(409).json({ error: '云端版本已变化，请重新读取后比较', latestRevision })
      }
      if (!isSafeNonNegInt(Number(data))) {
        return res.status(502).json({ error: '云端写入响应无效' })
      }
      const newRevision = Number(data)
      setRevisionHeaders(res, newRevision)
      return res.status(200).json({ ok: true, revision: newRevision })
    } catch {
      return res.status(controller.signal.aborted ? 504 : 502).json({
        error: controller.signal.aborted ? '数据库请求超时' : '数据库请求失败，请稍后重试',
      })
    } finally {
      clearTimeout(timer)
    }
  }
}

const production = createPlanSyncHandler({
  env: process.env as PlanSyncEnv,
  fetch: globalThis.fetch.bind(globalThis),
})

export default production
