import { copyFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const output = resolve('dist')
// GitHub Pages does not rewrite SPA routes. Keep stable entries and a fallback.
// 主导航的页面都预建入口，直接访问或分享链接时状态码是 200；其余深层路径走 404.html 兜底。
const ROUTES = ['monitor', 'invest', 'invest/ai-tools', 'ai/ai-skills', 'ai', 'life', 'about', 'knowledge', 'grid-trading', 'money-freedom', 'grid-trading/records', 'first-book', 'daily-analysis', 'daily-analysis/legacy', 'lab/etf-flow', 'lab/etf-uptrend', 'lab/etf-watch-pool', 'lab/etf-macd-good', 'lab/etf-hs300-timing', 'lab/etf-signal-plans', 'lab/etf-timing', 'lab/portfolio-rebalance', 'invest/macro-posture', 'invest/market-radar', 'invest/strategy', 'invest/strategy/spec', 'invest/strategy-lab', 'invest/index-valuation', 'invest/macro-masters', 'invest/top-masters', ...['druckenmiller', 'dalio', 'marks', 'tudor-jones', 'zweig', 'grantham', 'soros', 'templeton', 'kostolany'].map(slug => `invest/macro-masters/${slug}`)]
for (const route of ROUTES) {
  const directory = resolve(output, route)
  await mkdir(directory, { recursive: true })
  await copyFile(resolve(output, 'index.html'), resolve(directory, 'index.html'))
}
await copyFile(resolve(output, 'index.html'), resolve(output, '404.html'))
