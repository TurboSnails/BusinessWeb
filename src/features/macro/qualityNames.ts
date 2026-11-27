import { ASSET_INDICATORS, INDICATORS } from './indicators'
import { CN_INDICATORS } from './china'

// 只给网站展示用：quality.ts 会被 scripts/data-freshness-check.mjs 用 Node 直接加载，必须保持只有类型导入，
// 所以「数据键名 → 指标中文名」放在这个只被前端引用的小模块里。
const ITEM_NAMES: Record<'美国' | '中国', Record<string, string>> = {
  美国: Object.fromEntries([...INDICATORS, ...ASSET_INDICATORS].map(i => [i.key, i.name])),
  中国: Object.fromEntries(CN_INDICATORS.map(i => [i.key, i.name])),
}

/** 体检清单里给读者看的指标中文名；找不到时才退回数据键名 */
export function qualityItemName(country: '美国' | '中国', key: string): string {
  return ITEM_NAMES[country][key] ?? key
}
