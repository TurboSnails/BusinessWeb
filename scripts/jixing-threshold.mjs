// 今天几星 · 阀值表：读 public/data/jixing-table.json，写出 jixing-threshold.json（无额外网络）。
// 可从估值表完全派生，不写 data-raw/jixing-threshold。
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildThresholdData } from './jixing-threshold-lib.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TABLE = join(ROOT, 'public/data/jixing-table.json')
const OUT = join(ROOT, 'public/data/jixing-threshold.json')

function readJson(path, fallback = null) {
  try { return JSON.parse(fs.readFileSync(path, 'utf8')) } catch { return fallback }
}

function main() {
  const table = readJson(TABLE)
  if (!table?.asOf) {
    console.log('阀值表：缺少 jixing-table.json，跳过')
    return
  }
  const prev = readJson(OUT)
  if (prev?.asOf && prev.asOf > table.asOf) {
    console.log(`阀值表：已有更新文件 ${prev.asOf}，不覆盖为 ${table.asOf}`)
    return
  }
  const data = buildThresholdData(table)
  if (!data) {
    console.log('阀值表：估值表无法生成阀值行，跳过')
    return
  }
  fs.writeFileSync(`${OUT}.tmp`, JSON.stringify(data) + '\n')
  fs.renameSync(`${OUT}.tmp`, OUT)
  const size = fs.statSync(OUT).size
  const thin = data.rows.filter(r => r.lowLine === null).length
  console.log(`阀值表：已发布 ${data.asOf}，${data.rows.length} 行（样本不足 ${thin}），${size} 字节`)
}

main()
