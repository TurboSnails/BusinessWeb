// 把 Python 合并单测挂进 npm run test:scripts（与 sp500-allocation-backtest 调 python 同模式）
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import assert from 'node:assert/strict'

const root = fileURLToPath(new URL('..', import.meta.url))
const script = fileURLToPath(new URL('./normalize-market-refresh-macro_test.py', import.meta.url))

test('normalize-market-refresh macro merge (python unittest)', () => {
  const r = spawnSync('python3', ['-I', script, '-v'], {
    cwd: root,
    encoding: 'utf8',
  })
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.match(r.stderr + r.stdout, /OK/)
})
