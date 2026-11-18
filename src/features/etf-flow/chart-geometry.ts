export function extent(values: number[]): [number, number] {
  if (!values.length) return [0, 1]
  let mn = values[0]
  let mx = values[0]
  for (const v of values) {
    if (v < mn) mn = v
    if (v > mx) mx = v
  }
  return [mn, mx]
}

export function clampWindow(s: number, e: number, n: number, minSpan = 5): [number, number] {
  const last = Math.max(0, n - 1)
  let a = Math.max(0, Math.min(Math.round(s), last))
  let b = Math.max(0, Math.min(Math.round(e), last))
  if (a > b) [a, b] = [b, a]
  const span = Math.min(minSpan, n) - 1
  if (b - a < span) {
    b = Math.min(last, a + span)
    a = Math.max(0, b - span)
  }
  return [a, b]
}

export function fracToIndex(frac: number, n: number): number {
  if (n <= 1) return 0
  return Math.max(0, Math.min(n - 1, Math.round(frac * (n - 1))))
}

export function pointerToIndex(
  clientX: number,
  rect: { left: number; width: number },
  viewW: number,
  padL: number,
  plotW: number,
  n: number,
): number {
  if (!rect.width) return 0
  const sx = ((clientX - rect.left) / rect.width) * viewW
  return fracToIndex((sx - padL) / plotW, n)
}
