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
  '#7c3aed': 'var(--system-purple)', '#9333ea': 'var(--system-purple)', '#4f46e5': 'var(--accent)',
  '#e9d5ff': 'var(--bg-secondary)', '#f3e8ff': 'var(--bg-secondary)', '#fafafa': 'var(--bg-secondary)',
  // 翠绿与 Bootstrap 提示色
  '#059669': 'var(--down)', '#28a745': 'var(--down)',
  '#86efac': 'var(--system-green-light)', '#d1fae5': 'var(--system-green-light)', '#d4edda': 'var(--system-green-light)',
  '#155724': 'var(--down-ink)',
  // 天蓝
  '#0369a1': 'var(--accent-ink)', '#0c4a6e': 'var(--accent-ink)',
  '#e0f2fe': 'var(--accent-soft)', '#7dd3fc': 'var(--accent)',
  // 橙黄
  '#fff7ed': 'var(--accent-warm-soft)', '#fed7aa': 'var(--accent-warm-soft)', '#fff3cd': 'var(--accent-warm-soft)',
  '#fcd34d': 'var(--accent-warm)', '#ffc107': 'var(--accent-warm)',
  '#d97706': 'var(--warm-ink)', '#856404': 'var(--warm-ink)',
  // 红
  '#dc3545': 'var(--up)', '#f8d7da': 'var(--system-red-light)', '#721c24': 'var(--up-ink)',
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

function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = d / (1 - Math.abs(2 * l - 1))
  let h
  if (max === r) h = ((g - b) / d) % 6
  else if (max === g) h = (b - r) / d + 2
  else h = (r - g) / d + 4
  h = (h * 60 + 360) % 360
  return { h, s, l }
}

function neutralByLightness(l) {
  if (l > 0.93) return 'var(--bg-secondary)'
  if (l > 0.82) return 'var(--border-subtle)'
  if (l > 0.62) return 'var(--system-gray3)'
  if (l > 0.5) return 'var(--text-tertiary)'
  if (l > 0.27) return 'var(--text-secondary)'
  return 'var(--text-primary)'
}

/** 未登记的颜色按色相/饱和度/明度归到纸书语义色；纯白和近白返回 null（保持原样） */
export function classifyHex(hex) {
  const { h, s, l } = hexToHsl(hex)
  if (l > 0.985) return null
  if (s < 0.1) return neutralByLightness(l)
  const soft = l > 0.9
  const dark = l < 0.3
  const veryDark = l < 0.25
  if (h >= 190 && h < 260) {
    if (s < 0.3) return neutralByLightness(l)
    if (soft) return 'var(--accent-soft)'
    if (veryDark) return 'var(--text-primary)'
    if (dark) return 'var(--accent-ink)'
    return 'var(--accent)'
  }
  if (h < 20 || h >= 340) {
    if (soft) return 'var(--system-red-light)'
    return dark ? 'var(--up-ink)' : 'var(--up)'
  }
  if (h < 70) {
    if (soft) return 'var(--accent-warm-soft)'
    return l < 0.4 ? 'var(--warm-ink)' : 'var(--accent-warm)'
  }
  if (h < 170) {
    if (soft) return 'var(--system-green-light)'
    return dark ? 'var(--down-ink)' : 'var(--down)'
  }
  if (h < 190) return soft ? 'var(--accent-soft)' : dark ? 'var(--accent-ink)' : 'var(--accent)'
  return soft ? 'var(--bg-secondary)' : dark ? 'var(--text-primary)' : 'var(--system-purple)'
}

export function retheme(source, options = {}) {
  let count = 0
  const output = source
    .split('\n')
    .map(line => {
      if (SKIP_LINE.test(line)) return line
      let out = line.replace(/#[0-9a-fA-F]{6}\b/g, m => {
        const v = HEX[m.toLowerCase()] ?? (options.generic ? classifyHex(m) : null)
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
  const args = process.argv.slice(2)
  const generic = args.includes('--generic')
  for (const file of args.filter(a => a !== '--generic')) {
    const src = readFileSync(file, 'utf8')
    const { output, count } = retheme(src, { generic })
    if (count > 0) writeFileSync(file, output)
    console.log(`${String(count).padStart(4)}  ${file}`)
  }
}
