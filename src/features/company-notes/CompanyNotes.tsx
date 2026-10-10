import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams, useLocation } from 'react-router-dom';
import MarkdownPreview from '../knowledge/MarkdownPreview';
import { companyNotesApi as api, CompanyNotesError, downloadMarkdown, editTokenKey, readMarkdownFile } from './api';
import { MAX_NOTE_BYTES, validCompany } from './types';
import type { CompanyNote, CompanyNoteMeta } from './types';
import { useCompanies } from '../../data/companies';
import type { Market } from '../../data/companies';
import '../knowledge/knowledge.css';
import './company-notes.css';
type Draft = {
    id: string;
    title: string;
    content: string;
    expectedRevision: number | null;
};
const errorText = (error: unknown) => error instanceof Error ? error.message : '操作失败';
const dateText = (value: string) => new Date(value).toLocaleString('zh-CN');
function storedToken() { try {
    return sessionStorage.getItem(editTokenKey) || '';
}
catch {
    return '';
} }
function NotesWorkspace({ market, code }: {
    market: string;
    code: string;
}): JSX.Element {
    const [params, setParams] = useSearchParams();
    const selected = params.get('note') || '';
    const { list: companies } = useCompanies(market as Market);
    const name = companies.find(c => c.code === code)?.name || code;
    const [items, setItems] = useState<CompanyNoteMeta[]>([]), [hasMore, setHasMore] = useState(false), [loading, setLoading] = useState(true);
    const [note, setNote] = useState<CompanyNote | null>(null), [reading, setReading] = useState(false);
    const [token, setToken] = useState(''), [tokenInput, setTokenInput] = useState(''), [unlockOpen, setUnlockOpen] = useState(false);
    const [draft, setDraft] = useState<Draft | null>(null), [editing, setEditing] = useState(false), [preview, setPreview] = useState(false);
    const [busy, setBusy] = useState(''), [error, setError] = useState(''), [message, setMessage] = useState(''), [conflict, setConflict] = useState(false);
    const [storageWarning, setStorageWarning] = useState(false);
    const alive = useRef(true), readId = useRef(0), listId = useRef(0), uploadId = useRef(0), authId = useRef(0);
    const fileInput = useRef<HTMLInputElement>(null);
    const location = useLocation();
    const historyEntry = useRef({ index: window.history.state?.idx as number | undefined, state: window.history.state, url: window.location.href });
    useEffect(() => { historyEntry.current = { index: window.history.state?.idx, state: window.history.state, url: window.location.href }; }, [location.key]);
    const draftKey = `company-note-draft:${market}:${code}`;
    const dirty = !!draft && (draft.expectedRevision === null || draft.title !== note?.title || draft.content !== note?.content);
    const dirtyRef = useRef(dirty);
    dirtyRef.current = dirty;
    useEffect(() => { alive.current = true; return () => { alive.current = false; readId.current++; listId.current++; uploadId.current++; authId.current++; }; }, []);
    async function list(offset = 0) { const seq = ++listId.current; if (!offset)
        setLoading(true); try {
        const result = await api.list(market, code, offset);
        if (!alive.current || seq !== listId.current)
            return;
        setItems(previous => offset ? [...previous, ...result.items.filter(n => !previous.some(p => p.id === n.id))] : result.items);
        setHasMore(result.hasMore);
    }
    catch (e) {
        if (alive.current && seq === listId.current)
            setError(errorText(e));
    }
    finally {
        if (alive.current && seq === listId.current)
            setLoading(false);
    } }
    useEffect(() => { void list(); }, []);
    useEffect(() => {
        const seq = ++readId.current;
        setNote(null);
        setReading(!!selected);
        if (!selected)
            return;
        void api.read(selected).then(value => { if (!alive.current || seq !== readId.current)
            return; if (value.market !== market || value.code !== code)
            throw new Error('这篇笔记不属于当前公司'); setNote(value); }).catch(e => { if (alive.current && seq === readId.current)
            setError(errorText(e)); }).finally(() => { if (alive.current && seq === readId.current)
            setReading(false); });
    }, [selected]);
    useEffect(() => {
        if (!editing)
            return;
        try {
            dirty ? sessionStorage.setItem(draftKey, JSON.stringify(draft)) : sessionStorage.removeItem(draftKey);
        }
        catch {
            setStorageWarning(true);
        }
    }, [draft, dirty, editing]);
    useEffect(() => {
        const warn = (event: BeforeUnloadEvent) => { if (dirtyRef.current) {
            event.preventDefault();
            event.returnValue = '';
        } };
        const anchor = (event: MouseEvent) => { const target = event.target instanceof Element ? event.target.closest('a[href]') : null; if (!dirtyRef.current || !target || target.getAttribute('download') !== null || target.getAttribute('target') === '_blank')
            return; const href = target.getAttribute('href'); if (!href || href.startsWith('#'))
            return; if (!window.confirm('有未保存修改。离开后可在本会话重新解锁编辑恢复草稿，仍要离开吗？')) {
            event.preventDefault();
            event.stopPropagation();
        } };
        let restoringHistory = false;
        const historyNavigation = (event: PopStateEvent) => {
            if (restoringHistory) { restoringHistory = false; return; }
            if (!dirtyRef.current) return;
            if (window.confirm('有未保存修改。请先保存或下载 MD；仍要离开吗？')) {
                setEditing(false);
                return;
            }
            event.stopImmediatePropagation();
            const previous = historyEntry.current;
            const nextIndex = event.state?.idx;
            if (typeof previous.index === 'number' && typeof nextIndex === 'number' && previous.index !== nextIndex) {
                restoringHistory = true;
                window.history.go(previous.index - nextIndex);
            } else {
                window.history.replaceState(previous.state, '', previous.url);
            }
        };
        window.addEventListener('popstate', historyNavigation, true);
        window.addEventListener('beforeunload', warn);
        document.addEventListener('click', anchor, true);
        return () => { window.removeEventListener('popstate', historyNavigation, true); window.removeEventListener('beforeunload', warn); document.removeEventListener('click', anchor, true); };
    }, []);
    function restoreDraft() {
        if (draft) { setEditing(true); setMessage('已恢复未保存草稿，请核对后保存'); return; }
        try {
        const saved = JSON.parse(sessionStorage.getItem(draftKey) || 'null');
        if (saved && typeof saved.id === 'string' && typeof saved.title === 'string' && typeof saved.content === 'string' && (saved.expectedRevision === null || Number.isSafeInteger(saved.expectedRevision))) {
            setDraft(saved);
            setEditing(true);
            setMessage('已恢复本会话草稿，请核对后保存');
            setParams({ note: saved.expectedRevision === null ? '' : saved.id }, { replace: true });
        }
    }
    catch {
        setStorageWarning(true);
    } }
    async function unlock(value: string) { const seq = ++authId.current; setBusy('unlock'); setError(''); try {
        await api.unlock(value);
        if (!alive.current || seq !== authId.current)
            return;
        setToken(value);
        setTokenInput('');
        setUnlockOpen(false);
        try {
            sessionStorage.setItem(editTokenKey, value);
        }
        catch {
            setStorageWarning(true);
        }
        restoreDraft();
    }
    catch (e) {
        if (alive.current && seq === authId.current) {
            setError(errorText(e));
            try {
                sessionStorage.removeItem(editTokenKey);
            }
            catch { }
        }
    }
    finally {
        if (alive.current && seq === authId.current)
            setBusy('');
    } }
    useEffect(() => { const saved = storedToken(); if (saved)
        void unlock(saved); }, []);
    function discardOK() { if (dirty && !window.confirm('放弃当前未保存修改？可先下载 MD 保留草稿。'))
        return false; uploadId.current++; setDraft(null); setEditing(false); setConflict(false); setPreview(false); try {
        sessionStorage.removeItem(draftKey);
    }
    catch { } ; return true; }
    function choose(id: string) { if (busy || !discardOK())
        return; setError(''); setMessage(''); setParams({ note: id }); }
    function newDraft(title = '公司分析', content = '') { if (!token || busy || !discardOK())
        return; readId.current++; setNote(null); setReading(false); setDraft({ id: crypto.randomUUID(), title, content, expectedRevision: null }); setEditing(true); setError(''); setMessage(''); setParams({}, { replace: true }); }
    function edit() { if (!note || busy)
        return; setDraft({ id: note.id, title: note.title, content: note.content, expectedRevision: note.revision }); setEditing(true); setPreview(false); setMessage(''); setError(''); }
    async function upload(file: File) { const seq = ++uploadId.current; setBusy('upload'); setError(''); try {
        const imported = await readMarkdownFile(file);
        if (!alive.current || seq !== uploadId.current)
            return;
        if (dirty && !window.confirm('放弃当前草稿并导入新笔记？'))
            return;
        readId.current++;
        setNote(null);
        setReading(false);
        setDraft({ id: crypto.randomUUID(), ...imported, expectedRevision: null });
        setEditing(true);
        setPreview(false);
        setConflict(false);
        setParams({}, { replace: true });
        setMessage('已导入草稿，保存后公开');
    }
    catch (e) {
        if (alive.current && seq === uploadId.current)
            setError(errorText(e));
    }
    finally {
        if (alive.current && seq === uploadId.current)
            setBusy('');
    } }
    async function save() { if (!draft || !token || busy)
        return; const captured = draft; if (!captured.title.trim() || captured.title.trim().length > 200 || !captured.content.trim()) {
        setError('标题和正文不能为空，标题最多 200 字符');
        return;
    } if (new TextEncoder().encode(captured.content).length > MAX_NOTE_BYTES) {
        setError('笔记正文超过 1 MiB');
        return;
    } setBusy('save'); setError(''); setMessage(''); try {
        const saved = captured.expectedRevision === null ? await api.create({ id: captured.id, market, code, title: captured.title, content: captured.content }, token) : await api.update({ id: captured.id, expectedRevision: captured.expectedRevision, title: captured.title, content: captured.content }, token);
        if (!alive.current)
            return;
        setNote(saved);
        setDraft(null);
        setEditing(false);
        setConflict(false);
        try {
            sessionStorage.removeItem(draftKey);
        }
        catch { }
        ;
        setMessage('已保存到云端');
        if (selected !== saved.id)
            setParams({ note: saved.id }, { replace: true });
        void list();
    }
    catch (e) {
        if (alive.current) {
            setError(errorText(e));
            setConflict(e instanceof CompanyNotesError && e.status === 409);
            if (e instanceof CompanyNotesError && e.status === 401) {
                setToken('');
                setUnlockOpen(true);
                try {
                    sessionStorage.removeItem(editTokenKey);
                }
                catch { }
            }
        }
    }
    finally {
        if (alive.current)
            setBusy('');
    } }
    async function reload() {
        if (!draft || busy || !window.confirm('重新加载会替换当前草稿，请先下载 MD 保留修改。继续吗？')) return;
        const id = draft.id;
        setBusy('reload'); setReading(true); setError('');
        try {
            const value = await api.read(id);
            if (!alive.current) return;
            if (value.market !== market || value.code !== code) throw new Error('这篇笔记不属于当前公司');
            setNote(value); setDraft(null); setEditing(false); setPreview(false); setConflict(false);
            try { sessionStorage.removeItem(draftKey); } catch { }
            setParams({ note: value.id }, { replace: true });
        } catch (e) { if (alive.current) setError(errorText(e)); }
        finally { if (alive.current) { setReading(false); setBusy(''); } }
    }
    function lock() { if (busy || (dirty && !window.confirm('锁定后将保留本会话草稿，重新解锁可恢复。继续吗？')))
        return; authId.current++; setToken(''); setEditing(false); setPreview(false); try {
        sessionStorage.removeItem(editTokenKey);
    }
    catch { } }
    const visibleDraft = editing && !!token ? draft : null;
    return <main className='container company-notes'>
    <header className='page-head'><Link to={`/research-notes/${market}/${encodeURIComponent(code)}`}>← 返回公司研究</Link><h1>{name} · 研究笔记</h1><p>{market.toUpperCase()} · {code} · 所有人可阅读，输入主人的 token 后可上传和编辑。保存即公开。</p></header>
    <div className='company-notes__toolbar'>
      {token ? <><button disabled={!!busy} onClick={() => newDraft()}>新建笔记</button><button disabled={!!busy} onClick={() => fileInput.current?.click()}>上传 MD</button><button disabled={!!busy} onClick={() => newDraft('公司分析', `# ${name} · 公司分析\n\n## 核心判断\n\n## 商业模式\n\n## 关键财务\n\n## 估值假设\n\n## 风险与反证\n\n## 下次验证\n\n## 资料来源\n`)}>使用分析模板</button><button disabled={!!busy} onClick={lock}>锁定编辑</button></> : <button disabled={!!busy} onClick={() => setUnlockOpen(!unlockOpen)}>解锁编辑</button>}
      <button disabled={!!busy || loading} onClick={() => void list()}>刷新列表</button>
      <input ref={fileInput} aria-label='上传 Markdown 文件' type='file' accept='.md,text/markdown' hidden style={{ display: 'none' }} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file && token)
        void upload(file); }}/>
    </div>
    {unlockOpen && <form className='company-notes__unlock' onSubmit={event => { event.preventDefault(); void unlock(tokenInput); }}><label>编辑 token<input aria-label='编辑 token' type='password' autoComplete='off' value={tokenInput} onChange={e => setTokenInput(e.target.value)} required/></label><button disabled={!!busy}>验证 token</button><p>仅在当前浏览器会话保留，用于写入授权。</p></form>}
    {error && <p role='alert' className='company-notes__error'>{error}</p>}{message && <p role='status'>{message}</p>}{draft && !token && <p>有未保存草稿，重新解锁可继续编辑。</p>}{storageWarning && <p role='alert'>浏览器暂存不可用，请及时下载 MD 保留修改。</p>}{busy && <p role='status'>{busy === 'save' ? '保存中…' : busy === 'upload' ? '正在导入…' : '正在验证…'}</p>}
    <div className='company-notes__layout'>
      <aside aria-label='公司笔记列表' className='company-notes__list'><h2>笔记 · {items.length}{hasMore ? '+' : ''}</h2>{loading && <p role='status'>正在加载笔记…</p>}{!loading && !items.length && <p>还没有笔记。主人解锁后可以上传或新建。</p>}{items.map(item => <div key={item.id} className={selected === item.id ? 'company-notes__item is-active' : 'company-notes__item'}><button disabled={!!busy} onClick={() => choose(item.id)}>{item.title}</button><small>更新于 {dateText(item.updatedAt)} · v{item.revision}</small></div>)}{hasMore && <button disabled={!!busy || loading} onClick={() => void list(items.length)}>加载更多</button>}</aside>
      <section aria-label='笔记内容' className='company-notes__document'>
        {reading && <p role='status'>正在读取笔记…</p>}
        {visibleDraft ? <><label className='company-notes__title'>笔记标题<input aria-label='笔记标题' maxLength={200} disabled={!!busy} value={visibleDraft.title} onChange={e => setDraft({ ...visibleDraft, title: e.target.value })}/></label><div className='company-notes__toolbar'><button disabled={!!busy} onClick={() => setPreview(!preview)}>{preview ? '继续编辑' : '阅读预览'}</button><button disabled={!!busy || !dirty} onClick={() => void save()}>保存并公开</button><button onClick={() => downloadMarkdown(visibleDraft.title, visibleDraft.content)}>下载 MD</button><button disabled={!!busy} onClick={() => discardOK()}>取消编辑</button>{conflict && <button disabled={!!busy} onClick={() => void reload()}>重新加载云端版本</button>}</div><p className='company-notes__hint'>保存后所有访客均可阅读。{dirty ? '有未保存修改。' : '内容未修改。'} 文件上限 1 MiB。</p>{preview ? <MarkdownPreview content={visibleDraft.content} relations={null} onOpen={() => setError('公司笔记不支持打开私人知识库链接')}/> : <textarea aria-label='Markdown 正文' spellCheck={false} disabled={!!busy} value={visibleDraft.content} onChange={e => setDraft({ ...visibleDraft, content: e.target.value })}/>}</> : note ? <><h2>{note.title}</h2><p className='company-notes__hint'>更新于 {dateText(note.updatedAt)} · v{note.revision}</p><div className='company-notes__toolbar'>{token && <button disabled={!!busy || reading} onClick={edit}>编辑笔记</button>}<button onClick={() => downloadMarkdown(note.title, note.content)}>下载 MD</button><a href={`?note=${encodeURIComponent(note.id)}`}>笔记直达链接</a></div><MarkdownPreview content={note.content} relations={null} onOpen={() => setError('公司笔记不支持打开私人知识库链接')}/></> : !reading && <p>选择一篇笔记开始阅读。</p>}
      </section>
    </div>
  </main>;
}
export default function CompanyNotes(): JSX.Element { const { market = '', code = '' } = useParams(); if (!validCompany(market, code))
    return <main className='container'><p role='alert'>公司参数无效</p><Link to='/research-notes'>返回公司研究</Link></main>; return <NotesWorkspace key={`${market}:${code}`} market={market} code={code}/>; }
