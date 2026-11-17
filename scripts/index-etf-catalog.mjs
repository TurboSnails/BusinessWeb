// 从人工核实的一手公开材料构建小型关系目录；不会访问朋友服务或推断同名产品。
import { readFile, writeFile, rename } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const registry = JSON.parse(await readFile(new URL('../src/features/index-catalog/registry.json', import.meta.url), 'utf8'))
const officialHosts = new Set(['www.sse.com.cn', 'disc.static.szse.cn', 'www.gffunds.com.cn', 'www.99fund.com', 'www.csindex.com.cn', 'oss-ch.csindex.com.cn'])
export function validateCatalog(data) {
  const errors = []
  if (data?.schemaVersion !== 1 || !Array.isArray(data.relations)) return ['目录结构无效']
  const seen = new Set()
  for (const r of data.relations) {
    if (!r || typeof r !== 'object') { errors.push('关系条目无效'); continue }
    const expected = registry[r.indexKey]
    if (!expected || r.indexCode !== expected.code || r.indexProvider !== expected.provider) errors.push('指数注册身份不匹配')
    const key = `${r.indexKey}|${r.exchange}|${r.code}`
    if (seen.has(key)) errors.push(`关系重复：${key}`)
    seen.add(key)
    if (!/^[a-zA-Z][a-zA-Z0-9]*$/.test(r.indexKey ?? '') || !/^\d{6}$/.test(r.code ?? '') || !['SH', 'SZ'].includes(r.exchange) || (r.exchange === 'SH' ? !String(r.code).startsWith('5') : !String(r.code).startsWith('1'))) errors.push(`证券标识无效：${key}`)
    if (!/^\d{6}$/.test(r.indexCode ?? '') || !['CSI', 'SZSE'].includes(r.indexProvider)) errors.push(`指数标识无效：${key}`)
    if (!['tracks', 'related_theme'].includes(r.relationship) || (r.relationship === 'tracks' && r.indexCode !== r.benchmarkCode) || (r.relationship === 'related_theme' && (typeof r.relationNote !== 'string' || !r.relationNote.trim()))) errors.push(`跟踪关系不匹配：${key}`)
    if (!r.name || !r.indexName || !r.benchmarkName || !r.evidenceLabel) errors.push(`缺少证据说明：${key}`)
    try { const u = new URL(r.evidenceUrl); if (u.protocol !== 'https:' || !officialHosts.has(u.hostname)) throw new Error() } catch { errors.push(`非已知官方证据：${key}`) }
    if (![r.verifiedAt, r.disclosureDate].every(d => /^\d{4}-\d{2}-\d{2}$/.test(d ?? '') && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0, 10) === d) || r.disclosureDate > r.verifiedAt) errors.push(`日期无效：${key}`)
  }
  return errors
}
export async function buildCatalog() {
  const src = new URL('../data-raw/index-catalog/etf-evidence.json', import.meta.url)
  const dst = new URL('../public/data/index-etf-catalog.json', import.meta.url)
  const data = JSON.parse(await readFile(src, 'utf8'))
  const errors = validateCatalog(data)
  if (errors.length) throw new Error(errors.join('\n'))
  data.relations.sort((a, b) => a.code.localeCompare(b.code))
  const tmp = `${fileURLToPath(dst)}.tmp`
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`)
  await rename(tmp, dst)
  return data.relations.length
}
if (process.argv[1] === fileURLToPath(import.meta.url)) buildCatalog().then(n => console.log(`已生成 ${n} 条官方材料核验关系（未刷新披露日期）`)).catch(e => { console.error(e.message); process.exitCode = 1 })
