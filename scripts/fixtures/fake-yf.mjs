// Offline three-symbol collector fixture. No network access.
let input = ''
for await (const chunk of process.stdin) input += chunk
const symbols = JSON.parse(input).symbols.filter(s => ['AVGO', 'META', 'MSFT'].includes(s))
const out = {}
for (const symbol of symbols) {
  out[symbol] = {
    rows: [['2024-01-02', 100, 100], ['2024-01-03', 101, 101], ['2024-01-04', 102, 102]],
    dividends: [], splits: [], error: null,
  }
}
process.stdout.write(JSON.stringify(out))
