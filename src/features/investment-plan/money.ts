// 人民币「元」十进制定点：内部一律用 bigint 分，禁止浮点乘除。
// 万元→元、年→月等换算都走字符串→分的整数算法，超分精度 half-up 并显式提示。

export type Yuan = string // /^(0|[1-9]\d{0,11})\.\d{2}$/
export type Money = { currency: 'CNY'; amount: Yuan }

export const YUAN_RE = /^(0|[1-9]\d{0,11})\.\d{2}$/
export const MAX_YUAN_FEN = 999_999_999_999_99n // 999999999999.99 元

const DIGITS = /^[0-9]+$/

/** 规范化两位小数元串；非法返回 null。空串→null；明确 0→'0.00'。 */
export function normalizeYuanInput(raw: string): Yuan | null {
  const s = raw.trim()
  if (s === '') return null
  if (/[eE,]/.test(s) || s.includes('Infinity') || s === 'NaN') return null
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null
  if (s.startsWith('-')) return null
  const [intPart, frac = ''] = s.split('.')
  if (!DIGITS.test(intPart) || (frac !== '' && !DIGITS.test(frac))) return null
  if (frac.length > 2) return null // UI 最多两位；多余精度拒绝而非截断
  const fen = yuanPartsToFen(intPart, frac.padEnd(2, '0'))
  if (fen === null || fen > MAX_YUAN_FEN) return null
  return fenToYuan(fen)
}

export function isYuan(v: unknown): v is Yuan {
  if (typeof v !== 'string' || !YUAN_RE.test(v)) return false
  const fen = yuanToFen(v)
  return fen !== null && fen >= 0n && fen <= MAX_YUAN_FEN
}

export function yuanToFen(amount: string): bigint | null {
  if (!YUAN_RE.test(amount)) return null
  const [intPart, frac] = amount.split('.')
  return yuanPartsToFen(intPart, frac)
}

function yuanPartsToFen(intPart: string, frac2: string): bigint | null {
  if (!DIGITS.test(intPart) || !/^\d{2}$/.test(frac2)) return null
  try {
    return BigInt(intPart) * 100n + BigInt(frac2)
  } catch {
    return null
  }
}

export function fenToYuan(fen: bigint): Yuan {
  if (fen < 0n) throw new RangeError('negative fen')
  const sign = fen
  const yuan = sign / 100n
  const rem = sign % 100n
  return `${yuan.toString()}.${rem.toString().padStart(2, '0')}`
}

export function moneyCny(amount: Yuan): Money {
  return { currency: 'CNY', amount }
}

/** 万元字符串 → 元（×10000）。超出分精度 half-up；返回舍入提示。 */
export function wanToYuan(wanRaw: string): { ok: true; yuan: Yuan; rounded: boolean } | { ok: false; reason: 'invalid' | 'negative' | 'overflow' } {
  const parsed = parseDecimalString(wanRaw.trim())
  if (!parsed.ok) return { ok: false, reason: parsed.reason }
  // 万元×10000 = 元；元×100 = 分 → 万元×1_000_000 = 分
  const scaled = scaleDecimalToFen(parsed, 1_000_000n)
  if (!scaled.ok) return { ok: false, reason: scaled.reason }
  if (scaled.fen > MAX_YUAN_FEN) return { ok: false, reason: 'overflow' }
  return { ok: true, yuan: fenToYuan(scaled.fen), rounded: scaled.rounded }
}

/** 年万元 → 月必要支出（元）：先×10000 得年元，再 ÷12 half-up 到分。 */
export function annualWanToMonthlyYuan(wanRaw: string): { ok: true; yuan: Yuan; annualYuan: Yuan; rounded: boolean } | { ok: false; reason: 'invalid' | 'negative' | 'overflow' } {
  const annual = wanToYuan(wanRaw)
  if (!annual.ok) return annual
  const annualFen = yuanToFen(annual.yuan)!
  // ÷12 half-up： (fen*2 + 12) / 24 等价于 (fen + 6) / 12 对正数
  const monthlyFen = (annualFen + 6n) / 12n
  const exact = annualFen % 12n === 0n
  if (monthlyFen > MAX_YUAN_FEN) return { ok: false, reason: 'overflow' }
  return {
    ok: true,
    yuan: fenToYuan(monthlyFen),
    annualYuan: annual.yuan,
    rounded: annual.rounded || !exact,
  }
}

/** 百分数字符串 ×100 → bps 整数；必须整除（无小数精度丢失）。 */
export function percentToBps(pctRaw: string): { ok: true; bps: number } | { ok: false; reason: 'invalid' | 'precision' } {
  const s = pctRaw.trim()
  if (!/^-?\d+(\.\d+)?$/.test(s) || s.startsWith('-') || /[eE]/.test(s)) return { ok: false, reason: 'invalid' }
  const [intPart, frac = ''] = s.split('.')
  if (!DIGITS.test(intPart) || (frac !== '' && !DIGITS.test(frac))) return { ok: false, reason: 'invalid' }
  // bps = pct * 100；最多两位小数的百分数才是整数 bps
  if (frac.length > 2) return { ok: false, reason: 'precision' }
  const padded = frac.padEnd(2, '0')
  const bps = Number(intPart) * 100 + Number(padded)
  if (!Number.isSafeInteger(bps) || bps < 0 || bps > 10000) return { ok: false, reason: 'invalid' }
  return { ok: true, bps }
}

/** bps → 百分数字符串（可去尾零）；仅展示用。 */
export function bpsToPercent(bps: number): string {
  const whole = Math.trunc(bps / 100)
  const frac = bps % 100
  if (frac === 0) return String(whole)
  const s = `${whole}.${String(frac).padStart(2, '0')}`
  return s.replace(/0+$/, '').replace(/\.$/, '')
}

export function addFen(a: bigint, b: bigint): bigint {
  return a + b
}

export function sumYuan(amounts: Yuan[]): Yuan | null {
  let total = 0n
  for (const a of amounts) {
    const f = yuanToFen(a)
    if (f === null) return null
    total += f
    if (total > MAX_YUAN_FEN) return null
  }
  return fenToYuan(total)
}

export function maxFen(a: bigint, b: bigint): bigint {
  return a > b ? a : b
}

type ParsedDecimal =
  | { ok: true; negative: false; intDigits: string; fracDigits: string }
  | { ok: false; reason: 'invalid' | 'negative' }

function parseDecimalString(s: string): ParsedDecimal {
  if (s === '' || /[eE,]/.test(s) || s === 'NaN' || s.includes('Infinity')) return { ok: false, reason: 'invalid' }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return { ok: false, reason: 'invalid' }
  if (s.startsWith('-')) return { ok: false, reason: 'negative' }
  const [intDigits, fracDigits = ''] = s.split('.')
  if (!DIGITS.test(intDigits) || (fracDigits !== '' && !DIGITS.test(fracDigits))) return { ok: false, reason: 'invalid' }
  return { ok: true, negative: false, intDigits, fracDigits }
}

/** 把十进制数 × scaleFactor 后 round half-up 到整数分。scaleFactor 已含「到分」的倍率。 */
function scaleDecimalToFen(
  parsed: Extract<ParsedDecimal, { ok: true }>,
  scaleFactor: bigint,
): { ok: true; fen: bigint; rounded: boolean } | { ok: false; reason: 'invalid' | 'overflow' } {
  // value = int.frac；fen = round(value * scaleFactor)
  // = round( (intDigits * 10^f + fracDigits) * scaleFactor / 10^f )
  const f = parsed.fracDigits.length
  const numer = BigInt(parsed.intDigits + parsed.fracDigits) // int*10^f + frac
  const denom = 10n ** BigInt(f)
  try {
    const product = numer * scaleFactor
    const q = product / denom
    const r = product % denom
    const rounded = r * 2n >= denom
    const fen = rounded ? q + 1n : q
    if (fen < 0n) return { ok: false, reason: 'invalid' }
    return { ok: true, fen, rounded: r !== 0n }
  } catch {
    return { ok: false, reason: 'overflow' }
  }
}

/**
 * 相对偏离是否严格越过带宽（书 8.3）。
 * 越界：abs(amount*10000 − targetBps*S)*10000 > relativeBandBps*targetBps*S
 * 等于边界不算越界。金额/S/目标均为分与 bps 整数。
 */
export function isRelativeBandBreached(params: {
  amountFen: bigint
  totalFen: bigint
  targetBps: number
  relativeBandBps: number
}): boolean {
  const { amountFen, totalFen, targetBps, relativeBandBps } = params
  if (totalFen <= 0n || targetBps <= 0 || relativeBandBps <= 0) return false
  const t = BigInt(targetBps)
  const b = BigInt(relativeBandBps)
  const S = totalFen
  const left = abs(amountFen * 10000n - t * S) * 10000n
  const right = b * t * S
  return left > right
}

/** 当前权重 bps = amount/S × 10000（整数除法截断仅用于展示；触发用 isRelativeBandBreached） */
export function weightBps(amountFen: bigint, totalFen: bigint): number | null {
  if (totalFen <= 0n) return null
  return Number((amountFen * 10000n) / totalFen)
}

/** gap = targetBps*S/10000 − amount，到分（可负） */
export function theoreticalGapFen(amountFen: bigint, totalFen: bigint, targetBps: number): bigint {
  return (BigInt(targetBps) * totalFen) / 10000n - amountFen
}

function abs(n: bigint): bigint {
  return n < 0n ? -n : n
}
