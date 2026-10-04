const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
export function isLocalKnowledgeRequest(req) {
  if (!LOOPBACK.has(req.socket?.remoteAddress)) return false;
  try {
    const url = new URL(`http://${req.headers.host}`);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return false;
    if (req.headers.origin && req.headers.origin !== url.origin) return false;
    if (req.headers['sec-fetch-site'] === 'cross-site') return false;
    return true;
  } catch { return false; }
}

export function knowledgeProxyGuard(req, res, next, token) {
  if (!req.url?.startsWith('/api/knowledge/')) return next();
  const code = !isLocalKnowledgeRequest(req) ? 403 : !token ? 503 : 0;
  if (!code) return next();
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ error: code === 403 ? '知识服务仅支持本机同源访问' : '知识服务未连接，请运行 npm run knowledge:app' }));
}
