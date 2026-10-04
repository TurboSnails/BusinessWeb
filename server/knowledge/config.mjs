import { fileURLToPath } from 'node:url';
import { resolve, isAbsolute } from 'node:path';
import { createVault } from './vault.mjs';
import { validateVaultLocation } from './private-files.mjs';
export const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
export function configuredVault() {
  const path = process.env.KNOWLEDGE_VAULT || resolve(projectRoot, '.local/SecondBrain');
  if (!isAbsolute(path)) throw new Error('KNOWLEDGE_VAULT 必须为绝对路径');
  validateVaultLocation(path);
  return createVault(path);
}
export function port(value, fallback) {
  const n = Number(value || fallback);
  if (!Number.isInteger(n) || n < 1024 || n > 65535) throw new Error('端口必须是 1024–65535 的整数');
  return n;
}
