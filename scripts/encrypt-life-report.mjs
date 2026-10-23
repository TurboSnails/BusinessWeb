import { readFile, writeFile } from 'node:fs/promises'
import { createCipheriv, pbkdf2Sync, randomBytes } from 'node:crypto'

const [source, output] = process.argv.slice(2)
const password = process.env.PRIVATE_REPORT_PASSWORD
if (!source || !output || !password) throw new Error('需要源文件、输出路径及 PRIVATE_REPORT_PASSWORD 环境变量；勿把明文或密码提交到仓库')
const salt = randomBytes(16)
const iv = randomBytes(12)
const key = pbkdf2Sync(password, salt, 600000, 32, 'sha256')
const cipher = createCipheriv('aes-256-gcm', key, iv)
const sourceText = await readFile(source)
const ciphertext = Buffer.concat([cipher.update(sourceText), cipher.final(), cipher.getAuthTag()])
await writeFile(output, JSON.stringify({ version: 1, salt: salt.toString('base64'), iv: iv.toString('base64'), ciphertext: ciphertext.toString('base64') }) + '\n')
