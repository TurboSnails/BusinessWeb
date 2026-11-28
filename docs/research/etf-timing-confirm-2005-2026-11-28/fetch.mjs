// L-056 取数：中证指数官网公开接口（无需密钥），2004-11-28（周日，便于识别「查询起始日假行」）至 2010-12-31 日线 + 指数基础资料（基日、发布日）。
// 纪律：本脚本只下载与记录行数 / 日期 / SHA-256，不计算任何收益、回撤。
// 限速：每次请求间隔 ≥ 4.5 秒；遇到 403 / 非 JSON 停 180 秒重试一次，仍失败则停止整批（可重复运行，已有有效文件跳过）。
// 用法：node docs/research/etf-timing-confirm-2005-2026-11-28/fetch.mjs [输出目录，默认 data-raw/etf-timing-confirm/raw]
import fs from 'node:fs'
import crypto from 'node:crypto'

const OUT = process.argv[2] || 'data-raw/etf-timing-confirm/raw'
fs.mkdirSync(OUT, { recursive: true })
const PACE = 4500
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 与 scripts/research/etf-strategy-oos/bt-index.mjs 完全相同的 15 个被交易标的与择时用的两个价格指数
export const TARGETS = ['H00300', 'H00905', 'H00852', 'H00016', 'H00922', 'H00986', 'H00987', 'H00988', 'H00989', 'H00990', 'H00991', 'H00992', 'H00993', 'H00994', 'H00995']
export const TIMING = ['000300', '000922']
const priceOf = (h) => '0' + h.slice(1) // H00905 → 000905
const START = '20041128', END = '20101231'

const perf = (code, s = START, e = END) => ({ file: `perf-${code}-${s}-${e}.json`, url: `https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=${code}&startDate=${s}&endDate=${e}` })
const info = (code) => ({ file: `info-${code}.json`, url: `https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/${code}` })

const JOBS = [
  ...[...TIMING, ...TARGETS].map((c) => perf(c)),
  // 记录 L-004 取数布局的假行：bt-index.mjs 按 4 年一段从 YYYY0101 起取，2008-01-01（节假日）会多出一行
  perf('H00300', '20080101', '20080131'),
  ...TARGETS.map(info),
  ...[...new Set(TARGETS.map(priceOf))].map(info),
  // 第二批：接口的 endDate 实际不含当天（20080131 只返回到 20080130），补 2010-12-31 这一根；
  // 2011-01 的几行在 count.mjs 里截掉（属于 L-004 已用段）。
  ...[...TIMING, ...TARGETS].map((c) => perf(c, '20101225', '20110105')),
  // 探索项：上证红利 000015（影子运行 510880 跟踪的指数，发布日 2005-01-04，几乎无回填）
  perf('000015'), perf('000015', '20101225', '20110105'), info('000015'),
]

const MAN = `${OUT}/manifest.json`
const man = fs.existsSync(MAN) ? JSON.parse(fs.readFileSync(MAN, 'utf8')) : []
const byFile = new Map(man.map((m) => [m.file, m]))
const valid = (p) => { try { const j = JSON.parse(fs.readFileSync(p, 'utf8')); return j && j.data != null } catch { return false } }

function describe(buf) {
  const j = JSON.parse(buf)
  if (!Array.isArray(j.data)) return { rows: null, start: null, end: null }
  const ds = j.data.filter((r) => r.close > 0).map((r) => r.tradeDate).sort()
  return { rows: ds.length, start: ds[0] ?? null, end: ds.at(-1) ?? null }
}

let first = true
for (const job of JOBS) {
  const p = `${OUT}/${job.file}`
  if (byFile.has(job.file) && valid(p)) continue
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!first) await sleep(PACE)
    first = false
    let status = 0, buf = null
    try {
      const res = await fetch(job.url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' }, signal: AbortSignal.timeout(120000) })
      status = res.status
      buf = Buffer.from(await res.arrayBuffer())
    } catch (e) { status = 'ERR ' + e.message.slice(0, 60) }
    let ok = status === 200 && buf
    if (ok) { try { const j = JSON.parse(buf); ok = j && j.data != null } catch { ok = false } }
    if (ok) {
      fs.writeFileSync(p, buf)
      const m = { ...job, http: 200, fetchedAt: new Date().toISOString(), bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex'), ...describe(buf) }
      byFile.set(job.file, m)
      fs.writeFileSync(MAN, JSON.stringify([...byFile.values()], null, 1))
      console.log(job.file, 200, m.rows ?? '—', m.start ?? '', m.end ?? '')
      break
    }
    console.log(job.file, status, attempt === 0 ? '→ 停 180 秒重试' : '→ 停止整批')
    if (attempt === 0) await sleep(180000)
    else { fs.writeFileSync(MAN, JSON.stringify([...byFile.values()], null, 1)); process.exit(2) }
  }
}
console.log('完成', byFile.size, '个文件')
