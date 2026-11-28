// lowvol-core-cn 立项取数：中证官网 index-perf（日线）+ index-basic-info（基日 / 发布日）。
// 候选指数只取「首段」（基日起约 1 年）和「末段」（2026-11），用于确认覆盖起止，不取中间段，避免看到候选的表现；
// 宽基取全史（用于数 ≥20% 回撤段，允许）。原始响应逐个写入 OUT，另写 manifest.json（URL、时间、行数、起止、SHA-256）。
import fs from 'node:fs'
import crypto from 'node:crypto'
const OUT = process.argv[2]
fs.mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const CSI = 'https://www.csindex.com.cn/csindex-home'
const manifest = []
async function get(url, file) {
  for (let a = 0; a < 3; a++) {
    try {
      const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(30000) })
      const buf = Buffer.from(await res.arrayBuffer())
      fs.writeFileSync(`${OUT}/${file}`, buf)
      const sha = crypto.createHash('sha256').update(buf).digest('hex')
      let rows = null, start = null, end = null
      try {
        const j = JSON.parse(buf.toString('utf8'))
        if (Array.isArray(j.data)) {
          const d = j.data.filter((r) => r.close > 0).map((r) => r.tradeDate).sort()
          rows = d.length; start = d[0] ?? null; end = d.at(-1) ?? null
        }
      } catch {}
      manifest.push({ file, url, fetchedAt: new Date().toISOString(), http: res.status, bytes: buf.length, rows, start, end, sha256: sha })
      await sleep(1500)
      return
    } catch (e) { if (a === 2) { manifest.push({ file, url, error: e.message }); return } await sleep(5000) }
  }
}
const candidates = ['H30269', 'H20269', '930955', 'H20955', '930740', 'H20740', '930782', 'H20782', '930846', 'H20846', '000803', 'H00803', '000804', 'H00804', '000922', 'H00922', '000015', 'H00015', '932833', '932834', '932835', '931446']
const broad = ['000300', 'H00300', '000906', 'H00906', '000985', 'H00985']
for (const c of [...candidates, ...broad]) await get(`${CSI}/indexInfo/index-basic-info/${c}`, `info-${c}.json`)
for (const c of candidates) {
  const [s, e] = c.startsWith('9328') ? ['20121201', '20131231'] : c === '931446' ? ['20091201', '20101231'] : ['20041201', '20061231']
  await get(`${CSI}/perf/index-perf?indexCode=${c}&startDate=${s}&endDate=${e}`, `perf-${c}-head-${s.slice(0, 4)}-${e.slice(0, 4)}.json`)
  await get(`${CSI}/perf/index-perf?indexCode=${c}&startDate=20261101&endDate=20261128`, `perf-${c}-tail-2026-11.json`)
}
for (const c of broad) for (let y = 2004; y <= 2026; y += 4) await get(`${CSI}/perf/index-perf?indexCode=${c}&startDate=${y}0101&endDate=${Math.min(y + 3, 2026)}1231`, `perf-${c}-full-${y}.json`)
fs.writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 1))
console.log(manifest.map((m) => `${m.file} ${m.http ?? m.error} rows=${m.rows} ${m.start}→${m.end}`).join('\n'))
