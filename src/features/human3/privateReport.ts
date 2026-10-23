export interface EncryptedReport { version: number; salt: string; iv: string; ciphertext: string }
const decode = (value: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(value), character => character.charCodeAt(0))

export async function unlockReport(password: string, report: EncryptedReport): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('需要 HTTPS 或 localhost 环境才能解锁')
  if (report.version !== 1) throw new Error('不支持此版本的报告')
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: decode(report.salt), iterations: 600000, hash: 'SHA-256' },
    material, { name: 'AES-GCM', length: 256 }, false, ['decrypt'],
  )
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(report.iv) }, key, decode(report.ciphertext))
  return new TextDecoder().decode(plaintext)
}
