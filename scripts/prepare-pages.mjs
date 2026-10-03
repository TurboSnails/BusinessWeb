import { copyFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const output = resolve('dist')
// GitHub Pages does not rewrite SPA routes. Keep stable entries and a fallback.
for (const route of ['grid-trading', 'grid-trading/records', 'first-book']) {
  const directory = resolve(output, route)
  await mkdir(directory, { recursive: true })
  await copyFile(resolve(output, 'index.html'), resolve(directory, 'index.html'))
}
await copyFile(resolve(output, 'index.html'), resolve(output, '404.html'))
