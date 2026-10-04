import { constants } from 'node:fs';
import { mkdir, readdir, lstat, realpath, open, rename, unlink } from 'node:fs/promises';
import { resolve, join, relative, sep, posix } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { resolveLinks } from './links.mjs';

export const VAULT_DIRS = ['00-Inbox', '01-Investment/Framework', '01-Investment/Companies', '01-Investment/Industries', '02-AI/RAG', '02-AI/Agent', '03-Development', '04-Projects', '05-Life', 'Attachments', 'Templates'];
export const MAX_NOTE_BYTES = 1024 * 1024;
export function knowledgeError(code, message) { return Object.assign(new Error(message), { code }); }
const fail = (code, message) => { throw knowledgeError(code, message); };
const hash = content => createHash('sha256').update(content).digest('hex');
const summary = (path, content) => ({ path, title: content.match(/^#\s+(.+)$/m)?.[1]?.trim() || posix.basename(path, '.md') });

export function createVault(directory) {
  if (typeof directory !== 'string' || !directory) fail('INVALID', '请配置 Vault 路径');
  const root = resolve(directory);
  let canonical;
  async function checkRoot() {
    const stat = await lstat(root);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('INVALID_PATH', 'Vault 必须是实际目录');
    const current = await realpath(root);
    if (canonical && current !== canonical) fail('INVALID_PATH', 'Vault 路径已改变，请重启服务');
    canonical = current;
  }
  function validate(path, markdown = true) {
    if (typeof path !== 'string' || path.length > 500 || !path || path.includes('\\') || /[\x00-\x1f\x7f]/.test(path)) fail('INVALID_PATH', '笔记路径无效');
    const parts = path.split('/');
    if (parts.some(p => !p || p === '..' || p.startsWith('.') || p.includes(':'))) fail('INVALID_PATH', '不能访问隐藏目录或 Vault 外的文件');
    if (markdown && !path.endsWith('.md')) fail('INVALID_PATH', '只支持 .md 笔记');
    const full = resolve(root, ...parts);
    const rel = relative(root, full);
    if (!rel || rel.startsWith('..' + sep) || rel === '..') fail('INVALID_PATH', '路径必须位于 Vault 内');
    return full;
  }
  async function safePath(path, { createParents = false, markdown = true } = {}) {
    const full = validate(path, markdown);
    await checkRoot();
    const parts = path.split('/');
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      current = join(current, parts[i]);
      const last = i === parts.length - 1;
      let st;
      try { st = await lstat(current); }
      catch (e) {
        if (e.code !== 'ENOENT') throw e;
        if (last) break;
        if (!createParents) fail('NOT_FOUND', '笔记不存在');
        try { await mkdir(current, { mode: 0o700 }); } catch (err) { if (err.code !== 'EEXIST') throw err; }
        st = await lstat(current);
      }
      if (st.isSymbolicLink() || (!last && !st.isDirectory()) || (last && markdown && !st.isFile())) fail('INVALID_PATH', '不支持符号链接或特殊文件');
    }
    return full;
  }
  async function read(path) {
    const file = await safePath(path);
    let handle;
    try {
      handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
      const st = await handle.stat();
      if (!st.isFile()) fail('INVALID_PATH', '不是普通笔记文件');
      if (st.size > MAX_NOTE_BYTES) fail('TOO_LARGE', '单篇笔记不能超过 1 MiB');
      const content = await handle.readFile('utf8');
      if (Buffer.byteLength(content) > MAX_NOTE_BYTES) fail('TOO_LARGE', '单篇笔记不能超过 1 MiB');
      return { ...summary(path, content), vaultId: hash(canonical), content, version: hash(content), updatedAt: st.mtime.toISOString() };
    } catch (e) {
      if (e.code === 'ENOENT') fail('NOT_FOUND', '笔记不存在');
      throw e;
    } finally { await handle?.close(); }
  }
  async function optionalRead(path) {
    try { return await read(path); } catch (e) { if (e.code === 'NOT_FOUND') return null; throw e; }
  }
  async function withLock(operation) {
    await checkRoot();
    const lock = join(root, '.knowledge-write.lock');
    let handle;
    for (let i = 0; i < 150; i++) {
      try { handle = await open(lock, 'wx', 0o600); break; }
      catch (e) { if (e.code !== 'EEXIST') throw e; await new Promise(r => setTimeout(r, 20)); }
    }
    if (!handle) fail('BUSY', '其他写入正在进行；如服务异常退出，请确认无写入后清理 Vault 的 .knowledge-write.lock');
    try { return await operation(); }
    finally { await handle.close(); await unlink(lock); }
  }
  async function update(path, content, expectedVersion, append) {
    validate(path);
    if (typeof content !== 'string') fail('INVALID', '内容必须是文本');
    if (Buffer.byteLength(content) > MAX_NOTE_BYTES) fail('TOO_LARGE', '单篇笔记不能超过 1 MiB');
    if (expectedVersion !== null && (typeof expectedVersion !== 'string' || !/^[a-f0-9]{64}$/.test(expectedVersion))) fail('INVALID', '写入需提供读取时的版本；新建请使用 null');
    return withLock(async () => {
      const current = await optionalRead(path);
      if ((current?.version ?? null) !== expectedVersion) fail('CONFLICT', '笔记已被修改，请先重新读取。当前草稿未覆盖原文。');
      const next = append ? (current?.content ?? '') + content : content;
      if (Buffer.byteLength(next) > MAX_NOTE_BYTES) fail('TOO_LARGE', '单篇笔记不能超过 1 MiB');
      const file = await safePath(path, { createParents: true });
      const temp = join(posix.dirname(file), `.knowledge-${randomUUID()}.tmp`);
      const handle = await open(temp, 'wx', 0o600);
      try {
        await handle.writeFile(next, 'utf8');
        await handle.sync();
        await handle.close();
        // Obsidian 不使用本服务的锁，因此提交前重新检测版本。
        const latest = await optionalRead(path);
        if ((latest?.version ?? null) !== expectedVersion) fail('CONFLICT', '笔记已被外部修改，请重新读取并合并草稿');
        await safePath(path);
        await rename(temp, file);
      } finally {
        await handle.close().catch(() => {});
        await unlink(temp).catch(e => { if (e.code !== 'ENOENT') throw e; });
      }
      return read(path);
    });
  }
  async function list() {
    await checkRoot();
    const notes = [];
    async function walk(folder, prefix) {
      for (const entry of await readdir(folder, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        try { validate(path, false); } catch (e) { if (e.code === 'INVALID_PATH') continue; throw e; }
        if (entry.isDirectory()) {
          await safePath(path, { markdown: false });
          await walk(join(folder, entry.name), path);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          try {
            const note = await read(path);
            const { content, ...info } = note;
            notes.push({ ...info, excerpt: content.replace(/\s+/g, ' ').slice(0, 160) });
          } catch (e) { if (!['NOT_FOUND', 'TOO_LARGE', 'INVALID_PATH'].includes(e.code)) throw e; }
        }
      }
    }
    await walk(root, '');
    return notes.sort((a, b) => a.path.localeCompare(b.path, 'zh-CN'));
  }
  async function search(query) {
    if (typeof query !== 'string' || query.length > 500) fail('INVALID', '搜索词无效或过长');
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const results = [];
    for (const info of await list()) {
      let note;
      try { note = await read(info.path); } catch (e) { if (e.code === 'NOT_FOUND') continue; throw e; }
      const text = `${note.title}\n${note.path}\n${note.content}`.toLocaleLowerCase();
      if (terms.every(term => text.includes(term))) {
        const offset = note.content.toLocaleLowerCase().indexOf(terms[0] || '');
        results.push({ ...info, excerpt: note.content.slice(Math.max(0, offset - 35), Math.max(0, offset - 35) + 160) });
      }
    }
    return results.slice(0, 100);
  }
  async function related(path) {
    const note = await read(path);
    const notes = await list();
    const outgoing = resolveLinks(note.content, path, notes);
    const backlinks = [];
    for (const info of notes) {
      if (info.path === path) continue;
      try {
        const other = await read(info.path);
        if (resolveLinks(other.content, other.path, notes).some(l => l.path === path)) backlinks.push(info);
      } catch (e) { if (e.code !== 'NOT_FOUND') throw e; }
    }
    return { outgoing, backlinks };
  }
  async function init() {
    await mkdir(root, { recursive: true, mode: 0o700 });
    await checkRoot();
    for (const dir of VAULT_DIRS) {
      const file = await safePath(dir + '/placeholder.md', { createParents: true });
      void file;
    }
    return status();
  }
  async function status() { await checkRoot(); return { connected: true, vaultPath: root, vaultId: hash(canonical), directories: VAULT_DIRS }; }
  async function assertIdentity(vaultId) {
    await checkRoot();
    if (typeof vaultId !== 'string' || !/^[a-f0-9]{64}$/.test(vaultId)) fail('INVALID', '写入必须提供 Vault 身份，请先连接或读取');
    if (vaultId !== hash(canonical)) fail('CONFLICT', 'Vault 已更换，草稿仍属于原知识库。请重新连接并核对目录。');
  }
  return { init, status, list, search, read, related, assertIdentity, write: (p, c, v) => update(p, c, v, false), append: (p, c, v) => update(p, c, v, true) };
}
