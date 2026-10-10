import React from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter, MemoryRouter, Route, Routes } from 'react-router-dom';
import CompanyNotes from './CompanyNotes';
const id = '11111111-1111-4111-8111-111111111111';
const note = { id, market: 'cn', code: '600900', title: '原始研究', content: '# 原始分析', revision: 1, createdAt: '2026-10-09T00:00:00Z', updatedAt: '2026-10-09T00:00:00Z' };
function mount(path = '/research-notes/company/cn/600900/notes') { return render(<MemoryRouter initialEntries={[path]}><Routes><Route path='/research-notes/company/:market/:code/notes' element={<CompanyNotes />}/></Routes></MemoryRouter>); }
function fakeCloud(failSave = false) { vi.stubGlobal('fetch', async (input: unknown, init?: RequestInit) => { const url = String(input); if (!url.includes('/api/company-notes'))
    return new Response('[]'); if (url.includes('action=list'))
    return new Response(JSON.stringify({ items: [note], hasMore: false })); if (url.includes('action=unlock'))
    return new Response(JSON.stringify({ ok: true })); if (url.includes('action=update'))
    return failSave ? new Response(JSON.stringify({ error: '版本冲突' }), { status: 409 }) : new Response(JSON.stringify({ ...note, ...JSON.parse(String(init?.body)), revision: 2 })); return new Response(JSON.stringify(note)); }); }
afterEach(() => { sessionStorage.clear(); vi.unstubAllGlobals(); });
it('visitors read notes without editor controls', async () => { fakeCloud(); mount(); fireEvent.click(await screen.findByRole('button', { name: '原始研究' })); expect(await screen.findByRole('heading', { name: '原始分析' })).toBeTruthy(); expect(screen.queryByRole('textbox', { name: 'Markdown 正文' })).toBeNull(); expect(screen.getByRole('button', { name: '下载 MD' })).toBeTruthy(); });
it('owner unlocks, edits, saves and locks back to public reading', async () => { fakeCloud(); mount(); fireEvent.click(await screen.findByRole('button', { name: '原始研究' })); await screen.findByRole('heading', { name: '原始分析' }); fireEvent.click(screen.getByRole('button', { name: '解锁编辑' })); fireEvent.change(screen.getByLabelText('编辑 token'), { target: { value: 'owner-token' } }); fireEvent.click(screen.getByRole('button', { name: '验证 token' })); fireEvent.click(await screen.findByRole('button', { name: '编辑笔记' })); fireEvent.change(screen.getByRole('textbox', { name: 'Markdown 正文' }), { target: { value: '# 修订分析' } }); fireEvent.click(screen.getByRole('button', { name: '保存并公开' })); await screen.findByText('已保存到云端'); fireEvent.click(screen.getByRole('button', { name: '锁定编辑' })); expect(await screen.findByRole('heading', { name: '修订分析' })).toBeTruthy(); expect(screen.queryByRole('textbox', { name: 'Markdown 正文' })).toBeNull(); });
it('conflict leaves modified draft in editor', async () => { fakeCloud(true); mount(); fireEvent.click(await screen.findByRole('button', { name: '原始研究' })); await screen.findByRole('heading', { name: '原始分析' }); fireEvent.click(screen.getByRole('button', { name: '解锁编辑' })); fireEvent.change(screen.getByLabelText('编辑 token'), { target: { value: 'owner' } }); fireEvent.click(screen.getByRole('button', { name: '验证 token' })); fireEvent.click(await screen.findByRole('button', { name: '编辑笔记' })); fireEvent.change(screen.getByRole('textbox', { name: 'Markdown 正文' }), { target: { value: '# 不要丢失' } }); fireEvent.click(screen.getByRole('button', { name: '保存并公开' })); await screen.findByRole('alert'); expect((screen.getByRole('textbox', { name: 'Markdown 正文' }) as HTMLTextAreaElement).value).toBe('# 不要丢失'); expect(screen.getByRole('button', { name: '重新加载云端版本' })).toBeTruthy(); });
it('shared note from a different company is rejected', async () => { fakeCloud(); mount('/research-notes/company/cn/000001/notes?note=' + id); expect((await screen.findByRole('alert')).textContent).toContain('不属于当前公司'); expect(screen.queryByRole('heading', { name: '原始分析' })).toBeNull(); });
async function unlockEditor() {
  fireEvent.click(screen.getByRole('button', {name:'解锁编辑'}));
  fireEvent.change(screen.getByLabelText('编辑 token'),{target:{value:'owner'}});
  fireEvent.click(screen.getByRole('button',{name:'验证 token'}));
  await screen.findByRole('button',{name:'新建笔记'});
}
it('recovers a committed create after its response was lost', async()=>{
  let saved:any;
  vi.stubGlobal('fetch',async(input:unknown,init?:RequestInit)=>{
    const url=String(input);
    if(!url.includes('/api/company-notes'))return new Response('[]');
    if(url.includes('action=list'))return new Response(JSON.stringify({items:[],hasMore:false}));
    if(url.includes('action=unlock'))return new Response('{"ok":true}');
    if(url.includes('action=create')){saved={...note,...JSON.parse(String(init?.body))};return new Response('{"error":"重复创建"}',{status:409})}
    return new Response(JSON.stringify(saved));
  });
  vi.spyOn(window,'confirm').mockReturnValue(true);
  mount();await screen.findByText('还没有笔记。主人解锁后可以上传或新建。');
  await unlockEditor();fireEvent.click(screen.getByRole('button',{name:'新建笔记'}));
  fireEvent.change(screen.getByRole('textbox',{name:'Markdown 正文'}),{target:{value:'# 已写入云端'}});
  fireEvent.click(screen.getByRole('button',{name:'保存并公开'}));
  fireEvent.click(await screen.findByRole('button',{name:'重新加载云端版本'}));
  expect(await screen.findByRole('heading',{name:'已写入云端'})).toBeTruthy();
});
it('locking retains in-memory draft when browser storage is unavailable',async()=>{
  fakeCloud();vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('QuotaExceeded')});
  vi.spyOn(window,'confirm').mockReturnValue(true);
  mount();await screen.findByRole('button',{name:'原始研究'});await unlockEditor();
  fireEvent.click(screen.getByRole('button',{name:'新建笔记'}));
  fireEvent.change(screen.getByRole('textbox',{name:'Markdown 正文'}),{target:{value:'# 保留内存草稿'}});
  fireEvent.click(screen.getByRole('button',{name:'锁定编辑'}));
  await unlockEditor();
  expect((await screen.findByRole('textbox',{name:'Markdown 正文'}) as HTMLTextAreaElement).value).toBe('# 保留内存草稿');
});
it('upload enters a draft and can preview before publishing',async()=>{
  fakeCloud();mount();await screen.findByRole('button',{name:'原始研究'});await unlockEditor();
  const bytes=new TextEncoder().encode('# 上传内容\n\n原始文本');
  const file={name:'财报分析.md',size:bytes.length,arrayBuffer:async()=>bytes.buffer};
  fireEvent.change(screen.getByLabelText('上传 Markdown 文件'),{target:{files:[file]}});
  expect((await screen.findByRole('textbox',{name:'Markdown 正文'}) as HTMLTextAreaElement).value).toBe('# 上传内容\n\n原始文本');
  fireEvent.click(screen.getByRole('button',{name:'阅读预览'}));
  expect(await screen.findByRole('heading',{name:'上传内容'})).toBeTruthy();
  expect(screen.getByRole('button',{name:'保存并公开'})).toBeTruthy();
});
it('browser history navigation warns before leaving an unsaved draft',async()=>{
  fakeCloud();const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
  mount();await screen.findByRole('button',{name:'原始研究'});await unlockEditor();
  fireEvent.click(screen.getByRole('button',{name:'新建笔记'}));
  fireEvent.change(screen.getByRole('textbox',{name:'Markdown 正文'}),{target:{value:'未保存'}});
  window.dispatchEvent(new PopStateEvent('popstate',{state:{idx:0}}));
  expect(confirm).toHaveBeenCalled();
  expect((screen.getByRole('textbox',{name:'Markdown 正文'}) as HTMLTextAreaElement).value).toBe('未保存');
});
it('canceling real BrowserRouter Back restores URL and leaves draft intact',async()=>{
  fakeCloud();const confirm=vi.spyOn(window,'confirm').mockReturnValue(false);
  window.history.replaceState({idx:0,key:'previous'},'', '/research-notes');
  window.history.pushState({idx:1,key:'current'},'', '/research-notes/company/cn/600900/notes');
  const rendered=render(<BrowserRouter><Routes><Route path='/research-notes' element={<h1>公司库返回页</h1>}/><Route path='/research-notes/company/:market/:code/notes' element={<CompanyNotes/>}/></Routes></BrowserRouter>);
  await screen.findByRole('button',{name:'原始研究'});await unlockEditor();
  fireEvent.click(screen.getByRole('button',{name:'新建笔记'}));
  fireEvent.change(screen.getByRole('textbox',{name:'Markdown 正文'}),{target:{value:'保留真实历史草稿'}});
  await act(async()=>{window.history.back()});
  await waitFor(()=>expect(confirm).toHaveBeenCalled());
  await waitFor(()=>expect(window.history.state.idx).toBe(1));
  expect(window.location.pathname).toBe('/research-notes/company/cn/600900/notes');
  expect((screen.getByRole('textbox',{name:'Markdown 正文'}) as HTMLTextAreaElement).value).toBe('保留真实历史草稿');
  expect(screen.queryByRole('heading',{name:'公司库返回页'})).toBeNull();
  confirm.mockReturnValue(true);
  await act(async()=>{window.history.back()});
  expect(await screen.findByRole('heading',{name:'公司库返回页'})).toBeTruthy();
  rendered.unmount();window.history.replaceState(null,'','/');
});
