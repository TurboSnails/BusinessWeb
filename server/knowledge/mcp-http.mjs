import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { posix, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createPersonalMcp } from './mcp.mjs';
import { configuredVault, port } from './config.mjs';
import { knowledgeError } from './vault.mjs';

// Exact directory prefixes; the underlying Vault still validates paths and symlinks.
export function scopedReadVault(vault, prefixes = []) {
  if (prefixes.some(p => !p || p.startsWith('/') || p.includes('\\') || p.split('/').some(part => !part || part.startsWith('.') || part.includes(':')))) throw new Error('资料范围必须为 Vault 内的相对目录');
  const allowed = path => !prefixes.length || prefixes.some(p => path.startsWith(p + '/'));
  const check = path => {
    if (typeof path !== 'string' || posix.normalize(path) !== path || !allowed(path)) throw knowledgeError('INVALID_PATH', '笔记不在此客户端开放的资料范围');
  };
  return {
    status: () => vault.status(),
    list: async () => (await vault.list()).filter(n => allowed(n.path)),
    search: async query => {
      // Apply access scope before the search result limit.
      const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
      if (query.length > 500) throw knowledgeError('INVALID', '搜索词过长');
      const found = [];
      for (const note of (await vault.list()).filter(n => allowed(n.path))) {
        const { content } = await vault.read(note.path);
        if (terms.every(term => `${note.title}\n${note.path}\n${content}`.toLocaleLowerCase().includes(term))) found.push(note);
        if (found.length === 100) break;
      }
      return found;
    },
    read: path => { check(path); return vault.read(path); },
    related: async path => {
      check(path);
      const related = await vault.related(path);
      return { outgoing: related.outgoing.filter(l => l.path && allowed(l.path)).map(l => ({ ...l, candidates: l.candidates.filter(allowed) })), backlinks: related.backlinks.filter(n => allowed(n.path)) };
    },
  };
}

export function createMcpHttpServer({ vault, token, prefixes = [], allowedHosts, allowedOrigins = [] }) {
  if (typeof token !== 'string' || token.length < 32) throw new Error('KNOWLEDGE_MCP_TOKEN 至少需要 32 个字符');
  if (!allowedHosts?.length) throw new Error('必须指定允许的 HTTP Host');
  const scoped = scopedReadVault(vault, prefixes);
  const reject = (res, status, message) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ error: message })); };
  return createServer({ requestTimeout: 30_000 }, async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    const supplied = Buffer.from(req.headers.authorization || ''), expected = Buffer.from(`Bearer ${token}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return reject(res, 401, '资料库凭据无效');
    if (!allowedHosts.includes(req.headers.host) || (req.headers.origin && !allowedOrigins.includes(req.headers.origin))) return reject(res, 403, '访问来源不允许');
    if (req.url !== '/mcp') return reject(res, 404, '接口不存在');
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return reject(res, 405, '无状态 MCP 使用 POST'); }
    let server;
    try {
      if (!req.headers['content-type']?.startsWith('application/json')) return reject(res, 415, '请使用 JSON');
      let bytes = 0;
      const chunks = [];
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 1024 * 1024) return reject(res, 413, '请求超过 1 MiB');
        chunks.push(chunk);
      }
      let body;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
      catch { return reject(res, 400, '无效 JSON'); }
      server = createPersonalMcp(scoped, { readOnly: true });
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on('close', () => { void server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
    } catch {
      if (!res.headersSent) reject(res, 500, '资料库请求失败');
      else res.end();
      await server?.close();
    }
  });
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const vault = configuredVault();
    await vault.init();
    const apiPort = port(process.env.KNOWLEDGE_MCP_PORT, 8790);
    const server = createMcpHttpServer({ vault, token: process.env.KNOWLEDGE_MCP_TOKEN,
      prefixes: (process.env.KNOWLEDGE_MCP_SCOPE || '').split(';').filter(Boolean),
      allowedHosts: [`localhost:${apiPort}`, `127.0.0.1:${apiPort}`, ...(process.env.KNOWLEDGE_MCP_HOSTS || '').split(';').filter(Boolean)],
      allowedOrigins: (process.env.KNOWLEDGE_MCP_ORIGINS || '').split(';').filter(Boolean) });
    server.listen(apiPort, '127.0.0.1', () => console.log(`只读资料库 MCP：http://127.0.0.1:${apiPort}/mcp`));
    server.on('error', e => { console.error(e.message); process.exitCode = 1; });
    for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
  } catch (e) { console.error(e.message); process.exitCode = 1; }
}
