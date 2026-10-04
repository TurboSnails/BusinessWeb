import { existsSync, realpathSync } from 'node:fs';
import { dirname, basename, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
const projectRoot = fileURLToPath(new URL('../../', import.meta.url));

export function physicalDirectory(path) {
  let parent = resolve(path);
  const missing = [];
  while (!existsSync(parent)) { missing.unshift(basename(parent)); const next = dirname(parent); if (next === parent) break; parent = next; }
  return resolve(realpathSync(parent), ...missing);
}
export function validateVaultLocation(path) {
  if (!isAbsolute(path)) throw new Error('KNOWLEDGE_VAULT 必须为绝对路径');
  const physical = physicalDirectory(path);
  for (const base of [projectRoot, resolve(projectRoot, 'public'), resolve(projectRoot, 'src')]) {
    const rel = relative(base, physical);
    const inside = rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
    if ((base === projectRoot && rel === '') || (base !== projectRoot && inside)) throw new Error('私人 Vault 不能位于项目根目录、public 或 src 中');
  }
  return physical;
}
export function knowledgePrivateDeny(configuredPath) {
  const patterns = ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/.local/**', '**/.superpowers/**'];
  if (configuredPath) {
    validateVaultLocation(configuredPath);
    patterns.push(resolve(configuredPath).replaceAll('\\', '/') + '/**', physicalDirectory(configuredPath).replaceAll('\\', '/') + '/**');
  }
  return patterns;
}
