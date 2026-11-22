#!/usr/bin/env node
// 生成 server/heatmapCnHk.mjs：估值热力图里「沪深 300」「恒生指数」两张图要用的中文名与行业。
// 来源是 public/data/dcf-prefill.json（东方财富 F10 行业，npm 的 dcf 预填任务维护）：A 股用其行业名，港股用恒生行业组再归并成大类。
// 成分或行业变动后重跑：node scripts/refresh-heatmap-cn-hk.mjs
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC = `${ROOT}public/data/dcf-prefill.json`
const OUT = `${ROOT}server/heatmapCnHk.mjs`

/** 港股行业组 → 大类（参照 GICS / 恒生行业分类的一级口径归并，便于和美股图对照） */
export const HK_SECTOR = {
  银行: '金融', 保险: '金融', 金融服务: '金融',
  房地产管理和开发: '地产',
  '制药、生物科技和生命科学': '医疗保健', 医疗保健设备与服务: '医疗保健',
  公用事业: '公用事业',
  资本品: '工业', 运输: '工业', 商业和专业服务: '工业',
  原材料: '原材料', 能源: '能源',
  '食品、饮料与烟草': '必需消费', 日常消费品经销与零售: '必需消费', 家庭与个人用品: '必需消费',
  消费者服务: '可选消费', 耐用消费品与服装: '可选消费', 非必需消费品经销与零售业: '可选消费', 汽车与汽车零部件: '可选消费',
  媒体与娱乐: '通信与互联网', 电信业务: '通信与互联网',
  技术硬件与设备: '信息技术', 半导体产品与设备: '信息技术', 软件与服务: '信息技术',
}

export function buildTables(items) {
  const cn = {}
  const hk = {}
  for (const r of items) {
    if (r.m === 'cn' && r.g?.includes('沪深300') && r.ind) cn[r.c] = [r.n, r.ind]
    if (r.m === 'hk' && r.g?.includes('恒生指数') && r.ind) hk[r.c] = [r.n.replace(/[（(]五百[)）]$/, ''), HK_SECTOR[r.ind] ?? '其他']
  }
  return { cn, hk }
}

async function main() {
  const doc = JSON.parse(await readFile(SRC, 'utf8'))
  const { cn, hk } = buildTables(doc.items ?? [])
  const unmapped = [...new Set((doc.items ?? []).filter(r => r.m === 'hk' && r.g?.includes('恒生指数') && r.ind && !HK_SECTOR[r.ind]).map(r => r.ind))]
  if (unmapped.length) console.warn(`⚠ 未归并的港股行业组（记为「其他」）：${unmapped.join('、')}`)
  await writeFile(OUT, `// 由 scripts/refresh-heatmap-cn-hk.mjs 生成；勿手改。来源 public/data/dcf-prefill.json（generatedAt=${doc.generatedAt}）
/** 沪深 300：代码 → [中文名, 行业] */
export const CSI300_INFO = ${JSON.stringify(cn)}
/** 恒生指数：代码 → [中文名, 大类] */
export const HSI_INFO = ${JSON.stringify(hk)}
`)
  console.log(`沪深 300 ${Object.keys(cn).length} 只，恒生指数 ${Object.keys(hk).length} 只 → ${OUT}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exitCode = 1 })
