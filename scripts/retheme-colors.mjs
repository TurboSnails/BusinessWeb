import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const HEX = {
  '#007aff': 'var(--system-blue)',
  '#5856d6': 'var(--system-indigo)',
  '#af52de': 'var(--system-purple)',
  '#ff2d55': 'var(--system-pink)',
  '#ff3b30': 'var(--system-red)',
  '#ff9500': 'var(--system-orange)',
  '#ffcc00': 'var(--system-yellow)',
  '#34c759': 'var(--system-green)',
  '#5ac8fa': 'var(--system-teal)',
  '#32ade6': 'var(--system-cyan)',
  '#8e8e93': 'var(--system-gray)',
  '#aeaeb2': 'var(--system-gray2)',
  '#c7c7cc': 'var(--system-gray3)',
  '#d1d1d6': 'var(--system-gray4)',
  '#e5e5ea': 'var(--system-gray5)',
  '#f2f2f7': 'var(--system-gray6)',
  '#1d1d1f': 'var(--text-primary)',
  '#86868b': 'var(--text-secondary)',
  '#6e6e73': 'var(--text-secondary)',
  '#f5f5f7': 'var(--bg-primary)',
}

const RGB = {
  '0,122,255': '--system-blue',
  '88,86,214': '--system-indigo',
  '175,82,222': '--system-purple',
  '255,45,85': '--system-pink',
  '255,59,48': '--system-red',
  '255,149,0': '--system-orange',
  '255,204,0': '--system-yellow',
  '52,199,89': '--system-green',
  '90,200,250': '--system-teal',
}

const SKIP_LINE = /getContext|fillStyle|strokeStyle|ctx\./

export function retheme(source) {
  let count = 0
  const output = source
    .split('\n')
    .map(line => {
      if (SKIP_LINE.test(line)) return line
      let out = line.replace(/#[0-9a-fA-F]{6}\b/g, m => {
        const v = HEX[m.toLowerCase()]
        if (!v) return m
        count += 1
        return v
      })
      out = out.replace(/1px solid rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0?\.[5-9]\d*\s*\)/g, () => {
        count += 1
        return '1px solid var(--border-subtle)'
      })
      out = out.replace(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([0-9.]+)\s*\)/g, (m, r, g, b, a) => {
        const name = RGB[`${r},${g},${b}`]
        if (!name) return m
        count += 1
        const pct = Math.round(parseFloat(a) * 100)
        return `color-mix(in srgb, var(${name}) ${pct}%, transparent)`
      })
      return out
    })
    .join('\n')
  return { output, count }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const file of process.argv.slice(2)) {
    const src = readFileSync(file, 'utf8')
    const { output, count } = retheme(src)
    if (count > 0) writeFileSync(file, output)
    console.log(`${String(count).padStart(4)}  ${file}`)
  }
}
