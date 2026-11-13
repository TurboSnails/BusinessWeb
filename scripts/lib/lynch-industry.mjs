// 林奇重算的行业上下文：生成器的强周期标记（w/f）缺失时，按公司行业补充识别强周期。
// 只收经典强周期行业（油气上游/炼化、煤炭、钢铁与金属矿业、大宗化工/化肥、半导体设备、存储、航空航运），
// 不按整个一级板块（如「能源」含收费型管道）或含「化学」的宽泛词（会误中化学药）匹配。
import { readFile, writeFile, rm, mkdtemp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

export const CYCLICAL_INDUSTRY_RE = new RegExp([
  // GICS 子行业（us/adr 的 batch）
  'Oil & Gas Exploration', 'Oil & Gas Refining', 'Oil & Gas Drilling', 'Oil & Gas Equipment', 'Integrated Oil',
  'Coal', 'Steel', 'Copper', 'Aluminum', 'Gold', 'Silver', 'Precious Metals', 'Diversified Metals', 'Metals & Mining',
  'Commodity Chemicals', 'Fertilizers', 'Semiconductor Materials & Equipment', 'Passenger Airlines', 'Marine Transportation',
  // 中证 / 恒生 / 站内主题桶
  '油气开采', '石油与天然气', '石油及天然气', '炼化', '石化', '煤炭', '钢铁', '工业金属', '贵金属', '黄金', '稀有金属',
  '有色', '一般金属及矿石', '化学原料', '化学纤维', '农用化工', '化学制品', '化工', '塑料', '橡胶',
  '半导体材料与设备', '半导体设备', '航空运输', '航运',
].map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'))

// 手工研究页的 batch 常是「53 家 AI 情景研究」这类主题，没有子行业；只看简介首句里的存储/设备关键词
export const PROFILE_CYCLICAL_RE = /硬盘|HDD|DRAM|NAND|存储芯片|半导体设备|晶圆制造设备/

// 明确非商品周期的行业：生成器曾把中证「化学药」整组标成「行业属强周期」（「化学」关键词误中），这里反向纠正。
// 只匹配 batch/sector 的行业名，不匹配简介。
export const NON_CYCLICAL_INDUSTRY_RE = /化学药|化学制药|化学制剂/

/** company: { sector, batch } → 是否明确非周期行业（压过生成器的强周期文字标记，但不压过显式 cyclical 字段） */
export function nonCyclicalIndustryOf(company) {
  if (!company) return false
  return NON_CYCLICAL_INDUSTRY_RE.test(`${company.sector || ''}|${company.batch || ''}`)
}

/** 林奇重算的行业上下文 */
export function industryContextOf(company) {
  const nonCyclicalIndustry = nonCyclicalIndustryOf(company)
  return { cyclicalIndustry: !nonCyclicalIndustry && cyclicalIndustryOf(company), nonCyclicalIndustry }
}

/** company: { sector, batch, profile } → 是否强周期行业 */
export function cyclicalIndustryOf(company) {
  if (!company) return false
  const text = `${company.sector || ''}|${company.batch || ''}`
  if (CYCLICAL_INDUSTRY_RE.test(text)) return true
  const head = String(company.profile || '').split('。')[0]
  return PROFILE_CYCLICAL_RE.test(head)
}

/**
 * 还原 UI 实际看到的公司列表（手工研究页 + public/data/{m}.json 程序化补全），返回 Map(market:code → {sector,batch,profile})。
 * 只读。用 esbuild 临时打包 src/data/companyCore.ts。
 */
export async function loadCompanyIndustryIndex(root) {
  const { build } = await import('esbuild')
  const entry = `
    import { resolveMarket } from './companyCore'
    export async function collect(readJson) {
      const out = []
      for (const m of ['us', 'cn', 'hk', 'adr', 'ndx']) {
        const r = await resolveMarket(m)
        for (const c of r.merge(readJson(m))) out.push({ key: c.market + ':' + c.code, sector: c.sector, batch: c.batch, profile: c.profile })
      }
      return out
    }`
  const res = await build({
    stdin: { contents: entry, resolveDir: join(root, 'src/data'), loader: 'ts' },
    bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'silent',
    define: { 'import.meta.env': '{"BASE_URL":"/"}' },
  })
  const dir = await mkdtemp(join(tmpdir(), 'lynch-industry-'))
  const file = join(dir, 'bundle.mjs')
  try {
    await writeFile(file, res.outputFiles[0].text)
    const { collect } = await import(pathToFileURL(file).href)
    const jsonOf = {}
    for (const m of ['us', 'cn', 'hk', 'adr', 'ndx']) {
      try { jsonOf[m] = JSON.parse(await readFile(join(root, 'public/data', `${m}.json`), 'utf8')) } catch { jsonOf[m] = [] }
    }
    const rows = await collect(m => jsonOf[m])
    return new Map(rows.map(r => [r.key, r]))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}
