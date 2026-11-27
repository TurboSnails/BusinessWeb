import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm, chmod, access } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile, execFileSync } from 'node:child_process'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'git-push-retry.sh')
const ENV_FAST = {
  ...process.env,
  GIT_PUSH_RETRY_DELAYS: '0 0 0 0',
  GIT_PUSH_RETRY_MAX: '5',
  GIT_AUTHOR_NAME: 'retry-test',
  GIT_AUTHOR_EMAIL: 'retry-test@example.com',
  GIT_COMMITTER_NAME: 'retry-test',
  GIT_COMMITTER_EMAIL: 'retry-test@example.com',
}

function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', env: ENV_FAST })
}

async function runScript(cwd, env = {}) {
  return new Promise(resolve => {
    execFile(
      'bash',
      [SCRIPT],
      { cwd, env: { ...ENV_FAST, ...env }, encoding: 'utf8' },
      (error, stdout, stderr) => {
        resolve({
          code: error && typeof error.code === 'number' ? error.code : 0,
          stdout: stdout || '',
          stderr: stderr || '',
        })
      },
    )
  })
}

async function setupBareWithClones() {
  const root = await mkdtemp(join(tmpdir(), 'git-push-retry-'))
  const bare = join(root, 'bare.git')
  const a = join(root, 'clone-a')
  const b = join(root, 'clone-b')
  git(root, 'init', '--bare', '-b', 'main', bare)
  git(root, 'clone', bare, a)
  await writeFile(join(a, 'seed.txt'), 'seed\n')
  git(a, 'add', 'seed.txt')
  git(a, 'commit', '-m', 'seed')
  git(a, 'push', '-u', 'origin', 'main')
  git(root, 'clone', bare, b)
  // 确保两个克隆都在跟踪 origin/main
  git(b, 'checkout', 'main')
  return { root, bare, a, b }
}

test('对方先推后本脚本 rebase 重试成功', async () => {
  const { root, a, b } = await setupBareWithClones()
  try {
    await writeFile(join(a, 'a.txt'), 'from-a\n')
    git(a, 'add', 'a.txt')
    git(a, 'commit', '-m', 'a first')

    await writeFile(join(b, 'b.txt'), 'from-b\n')
    git(b, 'add', 'b.txt')
    git(b, 'commit', '-m', 'b concurrent')

    git(a, 'push', 'origin', 'main')
    const result = await runScript(b)
    assert.equal(result.code, 0, result.stderr)
    assert.match(result.stderr, /push succeeded/)
    const names = git(b, 'ls-tree', '-r', '--name-only', 'HEAD')
    assert.match(names, /a\.txt/)
    assert.match(names, /b\.txt/)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('同文件冲突时 abort 并以非零退出', async () => {
  const { root, a, b } = await setupBareWithClones()
  try {
    await writeFile(join(a, 'shared.txt'), 'aaa\n')
    git(a, 'add', 'shared.txt')
    git(a, 'commit', '-m', 'a shared')

    await writeFile(join(b, 'shared.txt'), 'bbb\n')
    git(b, 'add', 'shared.txt')
    git(b, 'commit', '-m', 'b shared')

    git(a, 'push', 'origin', 'main')
    const result = await runScript(b)
    assert.notEqual(result.code, 0)
    assert.match(result.stderr, /rebase failed|conflict/i)
    await assert.rejects(() => access(join(b, '.git', 'rebase-merge')), { code: 'ENOENT' })
    await assert.rejects(() => access(join(b, '.git', 'rebase-apply')), { code: 'ENOENT' })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('STRATEGY=theirs 同文件冲突时保留本地新数据并推送成功', async () => {
  const { root, a, b } = await setupBareWithClones()
  try {
    await writeFile(join(a, 'shared.txt'), 'from-remote\n')
    git(a, 'add', 'shared.txt')
    git(a, 'commit', '-m', 'a shared')

    await writeFile(join(b, 'shared.txt'), 'from-local-new\n')
    git(b, 'add', 'shared.txt')
    git(b, 'commit', '-m', 'b shared')

    git(a, 'push', 'origin', 'main')
    const result = await runScript(b, { GIT_PUSH_RETRY_STRATEGY: 'theirs' })
    assert.equal(result.code, 0, result.stderr)
    assert.match(result.stderr, /push succeeded/)
    assert.equal(git(b, 'show', 'HEAD:shared.txt'), 'from-local-new\n')
    // bare 上也应是本地新内容
    const remote = join(root, 'verify')
    git(root, 'clone', join(root, 'bare.git'), remote)
    assert.equal(git(remote, 'show', 'HEAD:shared.txt'), 'from-local-new\n')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('一直失败时 5 次后退出', async () => {
  const { root, bare, a } = await setupBareWithClones()
  try {
    const hook = join(bare, 'hooks', 'pre-receive')
    await writeFile(hook, '#!/bin/sh\necho "reject all" >&2\nexit 1\n')
    await chmod(hook, 0o755)

    await writeFile(join(a, 'more.txt'), 'more\n')
    git(a, 'add', 'more.txt')
    git(a, 'commit', '-m', 'will be rejected')

    const result = await runScript(a, { GIT_PUSH_RETRY_MAX: '5', GIT_PUSH_RETRY_DELAYS: '0 0 0 0' })
    assert.notEqual(result.code, 0)
    assert.match(result.stderr, /failed after 5 attempts/)
    const attempts = (result.stderr.match(/attempt \d+\/5/g) || []).length
    assert.equal(attempts, 5)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
