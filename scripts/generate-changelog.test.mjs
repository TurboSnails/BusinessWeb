import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'cl-test-'))
  const run = (cmd, args, opts = {}) => spawnSync(cmd, args, { cwd: dir, encoding: 'utf8', ...opts })
  run('git', ['init', '-q', '--initial-branch=main'])
  run('git', ['config', 'user.email', 'test@example.com'])
  run('git', ['config', 'user.name', 'Tester'])
  run('git', ['config', 'commit.gpgsign', 'false'])
  return { dir, run }
}

test('无 tag 时生成 unreleased 桶', () => {
  const { dir, run } = makeRepo()
  try {
    run('bash', ['-c', 'echo a > a.txt && git add a.txt && git commit -q -m "feat: first"'])
    run('bash', ['-c', 'echo b > b.txt && git add b.txt && git commit -q -m "fix: second"'])
    const r = run('node', [join(process.cwd(), 'scripts/generate-changelog.mjs'), '--cwd', dir])
    assert.equal(r.status, 0, r.stderr)
    const out = join(dir, 'public', 'changelog.json')
    assert.ok(existsSync(out), '应生成 public/changelog.json')
    const json = JSON.parse(readFileSync(out, 'utf8'))
    assert.equal(json.versions.length, 1)
    assert.equal(json.versions[0].tag, 'unreleased')
    assert.equal(json.versions[0].commits.length, 2)
    assert.match(json.versions[0].commits[0].subject, /fix: second/)
    assert.match(json.versions[0].commits[1].subject, /feat: first/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('有 tag 时按版本分桶', () => {
  const { dir, run } = makeRepo()
  try {
    run('bash', ['-c', 'echo a > a.txt && git add a.txt && git commit -q -m "feat: first"'])
    run('git', ['tag', 'v1.0.0'])
    run('bash', ['-c', 'echo b > b.txt && git add b.txt && git commit -q -m "fix: second"'])
    run('git', ['tag', 'v1.1.0'])
    run('bash', ['-c', 'echo c > c.txt && git add c.txt && git commit -q -m "chore: third"'])
    const r = run('node', [join(process.cwd(), 'scripts/generate-changelog.mjs'), '--cwd', dir])
    assert.equal(r.status, 0, r.stderr)
    const json = JSON.parse(readFileSync(join(dir, 'public', 'changelog.json'), 'utf8'))
    assert.equal(json.versions.length, 2)
    assert.equal(json.versions[0].tag, 'v1.1.0')
    assert.equal(json.versions[0].commits.length, 3)
    assert.equal(json.versions[1].tag, 'v1.0.0')
    assert.equal(json.versions[1].commits.length, 0)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})