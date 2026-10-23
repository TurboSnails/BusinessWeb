import { createCipheriv, pbkdf2Sync, webcrypto } from 'node:crypto'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { unlockReport } from './privateReport'

const salt = Buffer.from('0123456789abcdef')
const iv = Buffer.from('0123456789ab')
const key = pbkdf2Sync('test-access', salt, 600000, 32, 'sha256')
const cipher = createCipheriv('aes-256-gcm', key, iv)
const ciphertext = Buffer.concat([cipher.update('A private report', 'utf8'), cipher.final(), cipher.getAuthTag()])
const fixture = { version: 1, salt: salt.toString('base64'), iv: iv.toString('base64'), ciphertext: ciphertext.toString('base64') }
beforeEach(() => vi.stubGlobal('crypto', webcrypto))
afterEach(() => vi.unstubAllGlobals())
it('正确密码能解密由独立 Node 实现生成的正文', async () => {
  await expect(unlockReport('test-access', fixture)).resolves.toBe('A private report')
})
it('错误密码无法读取正文', async () => {
  await expect(unlockReport('wrong-access', fixture)).rejects.toThrow()
})
it('密文被修改时不能产生可阅读正文', async () => {
  const damaged = Buffer.from(ciphertext)
  damaged[0] ^= 1
  await expect(unlockReport('test-access', { ...fixture, ciphertext: damaged.toString('base64') })).rejects.toThrow()
})
