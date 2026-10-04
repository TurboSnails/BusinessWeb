import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { knowledgeError } from './vault.mjs';
import { knowledgeGraph } from './graph.mjs';

const statuses = { INVALID: 400, INVALID_PATH: 403, NOT_FOUND: 404, CONFLICT: 409, TOO_LARGE: 413, BUSY: 423 };
function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(data));
}
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) throw knowledgeError('INVALID', '请使用 JSON 请求');
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 2 * 1024 * 1024) throw knowledgeError('TOO_LARGE', '请求超过 2 MiB');
    chunks.push(chunk);
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error();
    return data;
  } catch { throw knowledgeError('INVALID', '请求不是有效 JSON 对象'); }
}
export function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
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
      if (req.method === 'GET') {
        if (route === 'status') result = await vault.status();
        else if (route === 'notes') result = await vault.list();
        else if (route === 'note') result = await vault.read(path);
        else if (route === 'search') result = await vault.search(url.searchParams.get('q') ?? '');
        else if (route === 'related') result = await vault.related(path);
        else if (route === 'graph') result = await knowledgeGraph(vault);
        else return json(res, 404, { error: '接口不存在' });
      } else if (req.method === 'PUT' && route === 'note') {
        const data = await body(req);
        await vault.assertIdentity(data.vaultId);
        result = await vault.write(data.path, data.content, data.version);
      } else if (req.method === 'POST' && (route === 'append' || route === 'inbox')) {
        const data = await body(req);
        await vault.assertIdentity(data.vaultId);
        if (route === 'append') result = await vault.append(data.path, data.content, data.version);
        else {
          if (!validDate(data.date) || typeof data.content !== 'string' || !data.content.trim()) throw knowledgeError('INVALID', '日期或 Inbox 内容无效');
          const prefix = data.version === null ? `# ${data.date}\n` : '';
          result = await vault.append(`00-Inbox/${data.date}.md`, `${prefix}\n${data.content.trim()}\n`, data.version);
        }
      } else return json(res, 405, { error: '不支持此请求方法' });
      json(res, 200, result);
    } catch (error) {
      if (!statuses[error.code]) console.error('Knowledge service:', error.code || error.name);
      json(res, statuses[error.code] || 500, { error: statuses[error.code] ? error.message : '知识服务暂时不可用，请检查本地服务', code: error.code || 'INTERNAL' });
    }
  });
}
