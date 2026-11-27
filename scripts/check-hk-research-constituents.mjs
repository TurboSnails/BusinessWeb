// 港股研究池 vs 恒生官方恒指/恒科成分：只告警缺漏，不改名单、不让工作流失败。
// 侵入点：market-cycle-update 在宽度采集之后调用（此时 market-cycle-universes.json 刚被官方接口刷新）。
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseHkUniverse, HK_INDEX_CODES } from './market-cycle-hk-universe.mjs'

export const UNIVERSE_FILE = fileURLToPath(new URL('../public/data/market-cycle-universes.json', import.meta.url))
export const HK_JSON = fileURLToPath(new URL('../public/data/hk.json', import.meta.url))

const pad = code => String(code).replace(/\D/g, '').padStart(5, '0')

/** 从官方接口解析结果或已落盘的 universes 快照取出恒指∪恒科代码（去重）。 */
export function officialHkConstituentCodes({ hsi, hstech } = {}) {
  const codes = new Set()
  for (const u of [hsi, hstech]) {
    if (!u || u.status === 'missing' || !Array.isArray(u.codes)) continue
    for (const c of u.codes) codes.add(pad(c))
  }
  return [...codes].sort()
}

/** 研究池代码：public/data/hk.json 的 code 字段（与 resolveMarket 合并后的港股池同口径）。 */
export function researchHkCodes(companies) {
  if (!Array.isArray(companies)) throw new Error('港股研究池须为数组')
  return [...new Set(companies.map(c => pad(c.code)).filter(c => c !== '00000'))].sort()
}

/**
 * @returns {{ ok: boolean, missing: string[], officialCount: number, researchCount: number, dates: { hsi?: string, hstech?: string } }}
 */
export function diffHkResearchVsOfficial({ officialCodes, researchCodes, dates = {} }) {
  const pool = new Set(researchCodes)
  const missing = officialCodes.filter(c => !pool.has(c))
  return {
    ok: missing.length === 0,
    missing,
    officialCount: officialCodes.length,
    researchCount: researchCodes.length,
    dates,
  }
}

/** 用固定官方响应样例（不联网）算出 diff；供测试与本地复现。 */
export function diffFromOfficialBodies({ hsiBody, hstechBody, researchCompanies, today }) {
  const hsi = parseHkUniverse(hsiBody, 'hsi', today)
  const hstech = parseHkUniverse(hstechBody, 'hstech', today)
  return diffHkResearchVsOfficial({
    officialCodes: officialHkConstituentCodes({ hsi, hstech }),
    researchCodes: researchHkCodes(researchCompanies),
    dates: { hsi: hsi.date, hstech: hstech.date },
  })
}

/** 读落盘 universes + hk.json；名单不全或文件缺失时返回 warn 结构，永不抛出让工作流失败。 */
export function checkHkResearchConstituents({ universeFile = UNIVERSE_FILE, hkJson = HK_JSON, log = console } = {}) {
  try {
    const universes = JSON.parse(readFileSync(universeFile, 'utf8')).universes ?? {}
    const research = JSON.parse(readFileSync(hkJson, 'utf8'))
    const hsi = universes.hsi?.status === 'ok' ? universes.hsi : null
    const hstech = universes.hstech?.status === 'ok' ? universes.hstech : null
    if (!hsi && !hstech) {
      const msg = '[hk-research-constituents] 跳过：官方恒指/恒科名单尚未落盘或状态非 ok'
      log.warn?.(msg) ?? log.log(msg)
      return { ok: true, skipped: true, missing: [], officialCount: 0, researchCount: researchHkCodes(research).length, dates: {} }
    }
    const result = diffHkResearchVsOfficial({
      officialCodes: officialHkConstituentCodes({ hsi, hstech }),
      researchCodes: researchHkCodes(research),
      dates: { hsi: hsi?.date, hstech: hstech?.date },
    })
    if (result.missing.length) {
      const msg = `[hk-research-constituents] 研究池缺少 ${result.missing.length} 只当期成分（官方 ${result.dates.hsi ?? '?'} / ${result.dates.hstech ?? '?'}，官方∪ ${result.officialCount}，池内 ${result.researchCount}）：${result.missing.join(', ')}`
      log.warn?.(msg) ?? log.log(msg)
    } else {
      const msg = `[hk-research-constituents] 研究池已覆盖官方恒指∪恒科 ${result.officialCount} 只（池内 ${result.researchCount}）`
      log.log(msg)
    }
    return { ...result, skipped: false }
  } catch (error) {
    const msg = `[hk-research-constituents] 检查失败（仅告警）：${error instanceof Error ? error.message : String(error)}`
    log.warn?.(msg) ?? log.log(msg)
    return { ok: false, skipped: true, missing: [], officialCount: 0, researchCount: 0, dates: {}, error: String(error) }
  }
}

export { HK_INDEX_CODES }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = checkHkResearchConstituents()
  // 退出码恒 0：只告警
  process.exitCode = 0
  if (!r.ok && !r.skipped) process.stdout.write(JSON.stringify({ missing: r.missing }, null, 2) + '\n')
}
