import type { Rule, RunInput, SwitchRule } from './types'

const KEYS = ['s', 'rule', 'sw', 'from', 'to', 'cost', 'init', 'signal']

export function createDefaultInput(): RunInput {
  return {
    symbols: ['AVGO', 'META', 'CB', 'SOFI', 'RKLB'],
    weights: [0.25, 0.25, 0.25, 0.125, 0.125],
    rule: { kind: 'relative', pct: 0.4 },
    cost: 0.001,
    initial: 1_000_000,
  }
}

const numberText = (value: number): string => String(Number(value.toFixed(8)))
const percentText = (value: number): string => numberText(value * 100)

function encodeRule(rule: Rule): string {
  if (rule.kind === 'buyHold') return 'hold'
  if (rule.kind === 'relative') return `relative:${percentText(rule.pct)}`
  if (rule.kind === 'absolute') return `absolute:${percentText(rule.points)}`
  return `calendar:${rule.every}`
}

function encodeSwitch(rule: SwitchRule): string {
  const parts = [rule.stable, percentText(rule.entry), percentText(rule.gap), percentText(rule.step),
    rule.recover === 'newHigh' ? 'newHigh' : percentText(rule.recover)]
  if (rule.cap !== undefined) parts.push(`cap${percentText(rule.cap)}`)
  if (rule.timeoutMonths !== undefined) parts.push(`t${rule.timeoutMonths}`)
  return parts.join(':')
}

export function encode(input: RunInput): URLSearchParams {
  const params = new URLSearchParams()
  params.set('s', input.symbols.map((symbol, index) => `${symbol}:${percentText(input.weights[index])}`).join(','))
  params.set('rule', encodeRule(input.rule))
  if (input.switch) params.set('sw', encodeSwitch(input.switch))
  if (input.start) params.set('from', input.start)
  if (input.end) params.set('to', input.end)
  params.set('cost', percentText(input.cost))
  params.set('init', numberText(input.initial))
  if (input.signal && input.signal !== 'QQQ') params.set('signal', input.signal)
  return params
}

function numberValue(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

function dateValue(raw: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false
  const date = new Date(`${raw}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === raw
}

function decodeSymbols(raw: string, known: Set<string>): Pick<RunInput, 'symbols' | 'weights'> | null {
  const pairs = raw.split(',').map(part => part.split(':'))
  if (pairs.length < 2 || pairs.length > 10 || pairs.some(pair => pair.length !== 2)) return null
  const symbols = pairs.map(pair => pair[0])
  if (new Set(symbols).size !== symbols.length || symbols.some(symbol => !known.has(symbol))) return null
  const weights = pairs.map(pair => numberValue(pair[1]))
  if (weights.some(value => value === null || value <= 0)) return null
  const normalized = weights.map(value => (value as number) / 100)
  if (Math.abs(normalized.reduce((sum, value) => sum + value, 0) - 1) > 1e-8) return null
  return { symbols, weights: normalized }
}

function decodeRule(raw: string): Rule | null {
  if (raw === 'hold') return { kind: 'buyHold' }
  const [kind, value] = raw.split(':')
  const number = numberValue(value ?? null)
  if (kind === 'relative' && number !== null && number > 0) return { kind, pct: number / 100 }
  if (kind === 'absolute' && number !== null && number > 0) return { kind, points: number / 100 }
  if (kind === 'calendar' && ['month', 'quarter', 'year'].includes(value)) {
    return { kind, every: value as 'month' | 'quarter' | 'year' }
  }
  return null
}

function decodeSwitch(raw: string, symbols: string[]): SwitchRule | null {
  const [stable, entryRaw, gapRaw, stepRaw, recoverRaw, ...options] = raw.split(':')
  const values = [entryRaw, gapRaw, stepRaw].map(value => numberValue(value ?? null))
  const recover = recoverRaw === 'newHigh' ? 'newHigh' as const : numberValue(recoverRaw ?? null)
  if (!stable || !symbols.includes(stable) || values.some(value => value === null || value <= 0 || value > 100)
    || (recover !== 'newHigh' && (recover === null || recover <= 0 || recover > 100))) return null
  const rule: SwitchRule = {
    stable,
    entry: (values[0] as number) / 100,
    gap: (values[1] as number) / 100,
    step: (values[2] as number) / 100,
    recover: recover === 'newHigh' ? recover : (recover as number) / 100,
  }
  for (const option of options) {
    if (option.startsWith('cap') && rule.cap === undefined) {
      const cap = numberValue(option.slice(3))
      if (cap === null || cap <= 0 || cap > 100) return null
      rule.cap = cap / 100
    } else if (/^t\d+$/.test(option) && rule.timeoutMonths === undefined) {
      const timeout = Number(option.slice(1))
      if (!Number.isInteger(timeout) || timeout <= 0) return null
      rule.timeoutMonths = timeout
    } else return null
  }
  return rule
}

export function decode(params: URLSearchParams, known: string[]): { input: RunInput; invalid: boolean } {
  const fallback = createDefaultInput()
  if (!KEYS.some(key => params.has(key))) return { input: fallback, invalid: false }
  try {
    const selection = decodeSymbols(params.get('s') ?? fallback.symbols.map((symbol, index) => `${symbol}:${fallback.weights[index] * 100}`).join(','), new Set(known))
    if (!selection) throw new Error('invalid selection')
    const rule = decodeRule(params.get('rule') ?? 'relative:40')
    if (!rule) throw new Error('invalid rule')
    const costPercent = numberValue(params.get('cost') ?? '0.1')
    const initial = numberValue(params.get('init') ?? '1000000')
    if (costPercent === null || costPercent < 0 || initial === null || initial <= 0) {
      throw new Error('invalid numbers')
    }
    const input: RunInput = {
      ...selection,
      rule,
      cost: costPercent / 100,
      initial,
    }
    const start = params.get('from')
    const end = params.get('to')
    if (start !== null) {
      if (!dateValue(start)) throw new Error('invalid start')
      input.start = start
    }
    if (end !== null) {
      if (!dateValue(end)) throw new Error('invalid end')
      input.end = end
    }
    if (input.start && input.end && input.start > input.end) throw new Error('invalid date range')
    const signal = params.get('signal')
    if (signal !== null) {
      if (!known.includes(signal)) throw new Error('invalid signal')
      input.signal = signal
    }
    const switchRaw = params.get('sw')
    if (switchRaw !== null) {
      const switchRule = decodeSwitch(switchRaw, input.symbols)
      if (!switchRule) throw new Error('invalid switch')
      input.switch = switchRule
    }
    return { input, invalid: false }
  } catch {
    return { input: fallback, invalid: true }
  }
}
