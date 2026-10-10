import { MAX_NOTE_BYTES, validCompany } from './types';
import type { CompanyNote, CompanyNoteMeta, NewCompanyNote, NoteList, NoteUpdate } from './types';
export class CompanyNotesError extends Error {
    constructor(message: string, public status: number) { super(message); }
}
export const editTokenKey = 'company-notes-edit-token';
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
function validMeta(value: unknown): value is CompanyNoteMeta { return object(value) && typeof value.id === 'string' && validCompany(value.market, value.code) && typeof value.title === 'string' && Number.isSafeInteger(value.revision) && Number(value.revision) > 0 && typeof value.createdAt === 'string' && typeof value.updatedAt === 'string'; }
function fullNote(value: unknown): CompanyNote { if (!object(value) || typeof value.content !== 'string' || !validMeta(value))
    throw new CompanyNotesError('云端笔记格式无效', 502); return value as CompanyNote; }
async function request(action: string, params: Record<string, string> = {}, body?: unknown, token?: string): Promise<unknown> {
    const base = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
        const response = await fetch(`${base}/api/company-notes?${new URLSearchParams({ action, ...params })}`, { method: body === undefined ? 'GET' : 'POST', cache: 'no-store', signal: controller.signal, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
        let value: unknown;
        try {
            value = await response.json();
        }
        catch {
            throw new CompanyNotesError('公司笔记服务未连接，请检查部署配置', response.status || 502);
        }
        if (!response.ok)
            throw new CompanyNotesError(object(value) && typeof value.error === 'string' ? value.error : '笔记请求失败', response.status);
        return value;
    }
    catch (error) {
        if (error instanceof CompanyNotesError)
            throw error;
        throw new CompanyNotesError(controller.signal.aborted ? '请求超时，草稿仍保留，请稍后重试' : '无法连接云端笔记服务', 503);
    }
    finally {
        clearTimeout(timeout);
    }
}
export const companyNotesApi = {
    async list(market: string, code: string, offset = 0): Promise<NoteList> { const value = await request('list', { market, code, offset: String(offset) }); if (!object(value) || !Array.isArray(value.items) || !value.items.every(validMeta) || typeof value.hasMore !== 'boolean')
        throw new CompanyNotesError('笔记列表格式无效', 502); return value as NoteList; },
    async read(id: string): Promise<CompanyNote> { return fullNote(await request('note', { id })); },
    async unlock(token: string): Promise<void> { const value = await request('unlock', {}, {}, token); if (!object(value) || value.ok !== true)
        throw new CompanyNotesError('编辑验证失败', 502); },
    async create(note: NewCompanyNote, token: string): Promise<CompanyNote> { return fullNote(await request('create', {}, note, token)); },
    async update(note: NoteUpdate, token: string): Promise<CompanyNote> { return fullNote(await request('update', {}, note, token)); },
};
export async function readMarkdownFile(file: File): Promise<{
    title: string;
    content: string;
}> {
    if (!/\.md$/i.test(file.name))
        throw new Error('请选择 .md 格式的笔记');
    if (file.size > MAX_NOTE_BYTES)
        throw new Error('笔记文件超过 1 MiB');
    if (!file.size)
        throw new Error('笔记文件为空');
    let content: string;
    try {
        content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
    }
    catch {
        throw new Error('笔记需要使用 UTF-8 编码');
    }
    if (!content.trim())
        throw new Error('笔记正文不能为空');
    return { title: file.name.replace(/\.md$/i, '').slice(0, 200), content };
}
export function downloadMarkdown(title: string, content: string): void {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_') || '研究笔记'}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
