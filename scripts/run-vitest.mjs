import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import process from 'node:process'

const nodeMajor = Number(process.versions.node.split('.')[0])
const nodeOptions = [process.env.NODE_OPTIONS, ...(nodeMajor >= 25 ? ['--no-experimental-webstorage'] : [])]
  .filter(Boolean)
  .join(' ')
const child = spawn(process.execPath, [resolve('node_modules/vitest/vitest.mjs'), ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: { ...process.env, NODE_OPTIONS: nodeOptions },
})

child.on('error', error => {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
})
child.on('exit', (code, signal) => {
  process.exitCode = signal ? 1 : (code ?? 1)
})
