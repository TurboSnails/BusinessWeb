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

// Tailwind 色板：按语义归到纸书色板，而不是逐色对应
const TAILWIND = {
  // 深色文字
  '#0f172a': 'var(--text-primary)', '#1e293b': 'var(--text-primary)', '#334155': 'var(--text-primary)',
  '#1f2937': 'var(--text-primary)', '#374151': 'var(--text-primary)', '#3a3a5c': 'var(--text-primary)',
  '#3a3a3c': 'var(--text-primary)',
  // 次要文字
  '#475569': 'var(--text-secondary)', '#4b5563': 'var(--text-secondary)', '#64748b': 'var(--text-secondary)',
  '#6b7280': 'var(--text-secondary)',
  '#9ca3af': 'var(--text-tertiary)', '#94a3b8': 'var(--text-tertiary)',
  // 边框与中性底
  '#e2e8f0': 'var(--border-subtle)', '#e5e7eb': 'var(--border-subtle)',
  '#d1d5db': 'var(--system-gray3)', '#cbd5e1': 'var(--system-gray3)',
  '#f8fafc': 'var(--bg-secondary)', '#f9fafb': 'var(--bg-secondary)', '#f1f5f9': 'var(--bg-secondary)',
  '#f3f4f6': 'var(--bg-secondary)', '#f0f0f3': 'var(--bg-secondary)', '#faf5ff': 'var(--bg-secondary)',
  // 蓝 → 主色（暗绿）
  '#eff6ff': 'var(--accent-soft)', '#dbeafe': 'var(--accent-soft)', '#bfdbfe': 'var(--accent-soft)',
  '#f0f9ff': 'var(--accent-soft)', '#f0f4ff': 'var(--accent-soft)',
  '#3b82f6': 'var(--accent)', '#2563eb': 'var(--accent)', '#60a5fa': 'var(--accent)', '#93c5fd': 'var(--accent)',
  '#0ea5e9': 'var(--accent)', '#6366f1': 'var(--accent)',
  '#1e40af': 'var(--accent-ink)', '#1e3a8a': 'var(--accent-ink)',
  // 绿 → 跌/正面
  '#f0fdf4': 'var(--system-green-light)', '#dcfce7': 'var(--system-green-light)', '#bbf7d0': 'var(--system-green-light)',
  '#16a34a': 'var(--down)', '#22c55e': 'var(--down)', '#10b981': 'var(--down)', '#34d399': 'var(--down)',
  '#15803d': 'var(--down)',
  '#166534': 'var(--down-ink)', '#065f46': 'var(--down-ink)',
  // 红 → 涨/风险
  '#fef2f2': 'var(--system-red-light)', '#fee2e2': 'var(--system-red-light)', '#fecaca': 'var(--system-red-light)',
  '#fff7f7': 'var(--system-red-light)',
  '#dc2626': 'var(--up)', '#ef4444': 'var(--up)', '#f87171': 'var(--up)', '#b91c1c': 'var(--up)',
  '#991b1b': 'var(--up-ink)', '#7f1d1d': 'var(--up-ink)',
  // 琥珀 → 陶土
  '#fef3c7': 'var(--accent-warm-soft)', '#fde68a': 'var(--accent-warm-soft)', '#fffbeb': 'var(--accent-warm-soft)',
  '#f59e0b': 'var(--accent-warm)', '#fbbf24': 'var(--accent-warm)', '#f97316': 'var(--accent-warm)',
  '#92400e': 'var(--warm-ink)', '#78350f': 'var(--warm-ink)', '#b26a00': 'var(--warm-ink)',
  // 紫
  '#c084fc': 'var(--system-purple)', '#8b5cf6': 'var(--system-purple)',
}
Object.assign(HEX, TAILWIND)

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
      out = out.replace(
        /linear-gradient\(\s*\d+deg\s*,\s*(var\(--[a-z0-9-]+\))\s+0%\s*,\s*(?:var\(--[a-z0-9-]+\)\s+\d+%\s*,\s*)?var\(--[a-z0-9-]+\)\s+100%\s*\)/g,
        (m, first) => {
          count += 1
          return first
        }
      )
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
