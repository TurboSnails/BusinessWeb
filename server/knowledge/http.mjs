import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { knowledgeGraph } from './graph.mjs';

const statuses = { INVALID: 400, INVALID_PATH: 403, NOT_FOUND: 404, CONFLICT: 409, TOO_LARGE: 413, BUSY: 423 };
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
}
export function createKnowledgeServer({ vault, token, allowedOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'] }) {
  if (typeof token !== 'string' || token.length < 32) throw new Error('KNOWLEDGE_TOKEN 至少需要 32 个字符');
  return createServer(async (req, res) => {
    const supplied = Buffer.from(req.headers.authorization || '');
    const expected = Buffer.from(`Bearer ${token}`);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return json(res, 401, { error: '知识服务凭据无效' });
    if (req.headers.origin && !allowedOrigins.includes(req.headers.origin)) return json(res, 403, { error: '访问来源不允许' });
    try {
      const url = new URL(req.url, 'http://localhost');
      const path = url.searchParams.get('path');
      const route = url.pathname.replace('/api/knowledge/', '');
      if (!url.pathname.startsWith('/api/knowledge/')) return json(res, 404, { error: '接口不存在' });
      let result;
      // 网页端只读：笔记只在 Obsidian 中修改，避免两处编辑产生冲突。
      if (req.method !== 'GET') return json(res, 405, { error: '网页端只读，请在 Obsidian 中修改' });
      if (route === 'status') result = { ...await vault.status(), readOnly: true };
      else if (route === 'notes') result = await vault.list();
      else if (route === 'note') result = await vault.read(path);
      else if (route === 'search') result = await vault.search(url.searchParams.get('q') ?? '');
      else if (route === 'related') result = await vault.related(path);
      else if (route === 'graph') result = await knowledgeGraph(vault);
      else return json(res, 404, { error: '接口不存在' });
      json(res, 200, result);
    } catch (error) {
      if (!statuses[error.code]) console.error('Knowledge service:', error.code || error.name);
      json(res, statuses[error.code] || 500, { error: statuses[error.code] ? error.message : '知识服务暂时不可用，请检查本地服务', code: error.code || 'INTERNAL' });
    }
  });
}
