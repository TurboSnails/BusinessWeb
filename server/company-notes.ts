import { authenticated, cloudDatabase, CloudError, object, uuid } from './knowledge/cloud.js';
import type { Database } from './knowledge/cloud.js';
import type { Request, Response } from '../api/knowledge.js';
import { MAX_NOTE_BYTES, validCompany } from '../src/features/company-notes/types.js';
import type { CompanyNote, CompanyNoteMeta } from '../src/features/company-notes/types.js';
const origins = ['https://business-web-black.vercel.app', 'https://turbosnails.github.io'];
function metadata(value: unknown): CompanyNoteMeta {
    if (!object(value) || typeof value.id !== 'string' || !validCompany(value.market, value.code) || typeof value.title !== 'string' || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1 || typeof value.created_at !== 'string' || typeof value.updated_at !== 'string')
        throw new CloudError(502, '云端笔记格式无效');
    return { id: value.id, market: value.market as string, code: value.code as string, title: value.title, revision: value.revision as number, createdAt: value.created_at, updatedAt: value.updated_at };
}
function note(value: unknown): CompanyNote {
    const meta = metadata(value);
    if (!object(value) || typeof value.content !== 'string' || Buffer.byteLength(value.content) > MAX_NOTE_BYTES)
        throw new CloudError(502, '云端笔记正文无效');
    return { ...meta, content: value.content };
}
function bodyOf(req: Request): Record<string, unknown> {
    const bytes = Buffer.byteLength(typeof req.body === 'string' ? req.body : JSON.stringify(req.body) || '');
    if (bytes > MAX_NOTE_BYTES * 6 + 4096)
        throw new CloudError(413, '请求过大');
    let body = req.body;
    if (typeof body === 'string') {
        try {
            body = JSON.parse(body);
        }
        catch {
            throw new CloudError(400, '无效 JSON');
        }
    }
    if (!object(body))
        throw new CloudError(400, '笔记格式无效');
    if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 200 || typeof body.content !== 'string' || !body.content.trim())
        throw new CloudError(400, '标题和正文不能为空，标题最多 200 字符');
    if (Buffer.byteLength(body.content) > MAX_NOTE_BYTES)
        throw new CloudError(413, '笔记正文超过 1 MiB');
    if (!uuid(body.id))
        throw new CloudError(400, '笔记编号无效');
    return body;
}
export function createCompanyNotesHandler(database: () => Database = cloudDatabase, writeToken: () => string | undefined = () => process.env.COMPANY_NOTES_WRITE_TOKEN) {
    return async (req: Request, res: Response): Promise<unknown> => {
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Vary', 'Origin');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        const origin = req.headers.origin;
        if (typeof origin === 'string' && origins.includes(origin)) {
            res.setHeader('Access-Control-Allow-Origin', origin);
            res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        }
        if (origin && (typeof origin !== 'string' || !origins.includes(origin)))
            return res.status(403).json({ error: '访问来源不允许' });
        if (req.method === 'OPTIONS')
            return res.status(origin ? 200 : 403).json({});
        try {
            const action = req.query?.action;
            if (typeof action !== 'string' || !['list', 'note', 'unlock', 'create', 'update'].includes(action))
                throw new CloudError(404, '笔记接口不存在');
            const writing = ['unlock', 'create', 'update'].includes(action);
            if (req.method !== (writing ? 'POST' : 'GET'))
                throw new CloudError(405, writing ? '编辑使用 POST 请求' : '阅读使用 GET 请求');
            if (writing) {
                const token = writeToken();
                if (!token || token.length < 32)
                    throw new CloudError(503, '公司笔记编辑 token 尚未配置');
                if (!authenticated(req.headers.authorization, token))
                    throw new CloudError(401, '请输入有效的编辑 token');
            }
            if (action === 'unlock')
                return res.status(200).json({ ok: true });
            if (action === 'list') {
                const { market, code } = req.query || {};
                const raw = req.query?.offset ?? '0';
                if (!validCompany(market, code) || typeof raw !== 'string' || !/^\d{1,8}$/.test(raw))
                    throw new CloudError(400, '公司或分页参数无效');
                const result = await database()(`businessweb_company_research_notes?market=eq.${encodeURIComponent(String(market))}&code=eq.${encodeURIComponent(String(code))}&select=id,market,code,title,revision,created_at,updated_at&order=updated_at.desc,id.asc&limit=51&offset=${Number(raw)}`);
                if (!Array.isArray(result))
                    throw new CloudError(502, '笔记列表无效');
                return res.status(200).json({ items: result.slice(0, 50).map(metadata), hasMore: result.length > 50 });
            }
            if (action === 'note') {
                const id = req.query?.id;
                if (!uuid(id))
                    throw new CloudError(400, '笔记编号无效');
                const rows = await database()(`businessweb_company_research_notes?id=eq.${id}&select=id,market,code,title,content,revision,created_at,updated_at`);
                if (!Array.isArray(rows))
                    throw new CloudError(502, '笔记读取失败');
                if (!rows.length)
                    throw new CloudError(404, '笔记不存在');
                return res.status(200).json(note(rows[0]));
            }
            const body = bodyOf(req);
            if (action === 'create' && !validCompany(body.market, body.code))
                throw new CloudError(400, '公司参数无效');
            if (action === 'update' && (!Number.isSafeInteger(body.expectedRevision) || Number(body.expectedRevision) < 1))
                throw new CloudError(400, '笔记版本无效');
            const args = action === 'create' ? { note_id: body.id, note_market: body.market, note_code: body.code, note_title: String(body.title).trim(), note_content: body.content } : { note_id: body.id, expected_revision: body.expectedRevision, note_title: String(body.title).trim(), note_content: body.content };
            const result = await database()(`rpc/businessweb_${action}_company_note`, 'POST', args);
            if (!object(result))
                throw new CloudError(502, '笔记保存响应无效');
            if (result.status === 'conflict')
                throw new CloudError(409, '笔记已由其他设备更新，请先下载草稿，再重新加载云端版本');
            if (result.status === 'missing')
                throw new CloudError(404, '笔记不存在');
            if (result.status !== 'ok')
                throw new CloudError(502, '笔记保存失败');
            return res.status(200).json(note(result.note));
        }
        catch (e) {
            return res.status(e instanceof CloudError ? e.status : 500).json({ error: e instanceof CloudError ? e.message : '笔记服务请求失败' });
        }
    };
}
