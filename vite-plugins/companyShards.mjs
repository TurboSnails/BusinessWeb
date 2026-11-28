/**
 * 按公司切分详情数据：从全市场 JSON 生成 data/company/{market}/{code}.json。
 * build 写入 dist；dev 中间件按需现切。源 public/data 不改动、不提交分片。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const SHARD_MARKETS = Object.freeze(['us', 'cn', 'hk', 'adr', 'ndx'])
export const HAS_GENERATED = Object.freeze({ us: true, cn: true, hk: true, adr: true, ndx: false })

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const defaultPublicDataDir = path.resolve(__dirname, '../public/data')

const isRecord = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/** 从源 JSON 建索引（公司 / 估值文档 / 林奇） */
export function indexCompanySources(dataDir = defaultPublicDataDir) {
  const companies = new Map()
  const valuationDocs = new Map()
  const valuationByCode = new Map()
  const lynch = JSON.parse(fs.readFileSync(path.join(dataDir, 'lynch.json'), 'utf8'))
  if (!isRecord(lynch)) throw new Error('lynch.json 不是对象')

  for (const market of SHARD_MARKETS) {
    if (HAS_GENERATED[market]) {
      const list = JSON.parse(fs.readFileSync(path.join(dataDir, `${market}.json`), 'utf8'))
      if (!Array.isArray(list)) throw new Error(`${market}.json 不是数组`)
      for (const row of list) {
        if (!isRecord(row) || typeof row.code !== 'string') continue
        companies.set(`${market}:${row.code}`, row)
      }
    }
    const valPath = path.join(dataDir, 'company-valuations', `${market}.json`)
    if (!fs.existsSync(valPath)) continue
    const doc = JSON.parse(fs.readFileSync(valPath, 'utf8'))
    if (!isRecord(doc) || !Array.isArray(doc.records)) continue
    valuationDocs.set(market, { schemaVersion: doc.schemaVersion, asOf: doc.asOf })
    for (const rec of doc.records) {
      if (!isRecord(rec) || typeof rec.code !== 'string') continue
      valuationByCode.set(`${market}:${rec.code}`, rec)
    }
  }
  return { companies, valuationDocs, valuationByCode, lynch }
}

/** 收集某市场应生成分片的代码集合 */
export function codesForMarket(index, market) {
  const codes = new Set()
  for (const key of index.companies.keys()) {
    if (key.startsWith(`${market}:`)) codes.add(key.slice(market.length + 1))
  }
  for (const key of index.valuationByCode.keys()) {
    if (key.startsWith(`${market}:`)) codes.add(key.slice(market.length + 1))
  }
  for (const key of Object.keys(index.lynch)) {
    if (key.startsWith(`${market}:`)) codes.add(key.slice(market.length + 1))
  }
  return [...codes].sort()
}

/** 单家分片：字段与源 JSON 对应记录逐字段一致 */
export function buildCompanyShard(index, market, code) {
  const key = `${market}:${code}`
  const company = index.companies.get(key) ?? null
  const record = index.valuationByCode.get(key) ?? null
  const meta = index.valuationDocs.get(market)
  const valuationDoc = record && meta
    ? { schemaVersion: meta.schemaVersion, asOf: meta.asOf, records: [record] }
    : null
  const lynch = Object.prototype.hasOwnProperty.call(index.lynch, key) ? index.lynch[key] : null
  return { market, code, company, valuationDoc, lynch }
}

export function shardRelativePath(market, code) {
  return path.posix.join('data/company', market, `${code}.json`)
}

const SHARD_PATH_RE = /^\/?(?:BusinessWeb\/)?data\/company\/([a-z]+)\/([^/]+)\.json$/i

export function matchShardRequest(urlPath) {
  const clean = (urlPath || '').split('?')[0]
  const m = clean.match(SHARD_PATH_RE)
  if (!m) return null
  const market = m[1].toLowerCase()
  if (!SHARD_MARKETS.includes(market)) return null
  let code
  try {
    code = decodeURIComponent(m[2])
  } catch {
    return null
  }
  return { market, code }
}

function sendJson(res, body) {
  const text = typeof body === 'string' ? body : JSON.stringify(body)
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(text)
}

function sendNotFound(res) {
  res.statusCode = 404
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify({ error: 'company shard not found' }))
}

/** 写入全部市场分片，返回统计 */
export function writeAllCompanyShards(outDir, dataDir = defaultPublicDataDir) {
  const index = indexCompanySources(dataDir)
  let files = 0
  let bytes = 0
  const byMarket = {}
  for (const market of SHARD_MARKETS) {
    const codes = codesForMarket(index, market)
    byMarket[market] = { codes: codes.length, bytes: 0 }
    for (const code of codes) {
      const shard = buildCompanyShard(index, market, code)
      const rel = shardRelativePath(market, code)
      const dest = path.join(outDir, rel)
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      const text = JSON.stringify(shard)
      fs.writeFileSync(dest, text)
      files += 1
      bytes += Buffer.byteLength(text)
      byMarket[market].bytes += Buffer.byteLength(text)
    }
  }
  return { files, bytes, byMarket }
}

export function companyShardsPlugin(options = {}) {
  const dataDir = options.dataDir || defaultPublicDataDir
  let cachedIndex = null
  const getIndex = () => {
    if (!cachedIndex) cachedIndex = indexCompanySources(dataDir)
    return cachedIndex
  }

  return {
    name: 'company-shards',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const matched = matchShardRequest(req.url || '')
        if (!matched) return next()
        try {
          const index = getIndex()
          const key = `${matched.market}:${matched.code}`
          const known = index.companies.has(key)
            || index.valuationByCode.has(key)
            || Object.prototype.hasOwnProperty.call(index.lynch, key)
          if (!known) return sendNotFound(res)
          return sendJson(res, buildCompanyShard(index, matched.market, matched.code))
        } catch (err) {
          server.config.logger.error(`[company-shards] ${err instanceof Error ? err.message : err}`)
          res.statusCode = 500
          res.end('company shard error')
        }
      })
    },
    writeBundle(outputOptions) {
      const outDir = outputOptions.dir
      if (!outDir) return
      cachedIndex = null
      const stats = writeAllCompanyShards(outDir, dataDir)
      this.info(`[company-shards] wrote ${stats.files} files, ${(stats.bytes / 1024 / 1024).toFixed(2)} MB raw`)
    },
  }
}
