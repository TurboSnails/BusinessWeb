import React from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import MarkdownPreview from './MarkdownPreview'
afterEach(cleanup)
it('安全显示 Markdown，wikilink 只打开已解析笔记，不执行 HTML', () => {
  const open = vi.fn()
  const { container } = render(<MarkdownPreview content={'# 研究\n[[AI|人工智能]]\n<img src=x onerror=alert(1)>\n```\n[[AI]]\n```'} relations={{ outgoing: [{ target: 'AI', label: '人工智能', status: 'resolved', path: 'AI.md', candidates: ['AI.md'] }], backlinks: [] }} onOpen={open} />)
  fireEvent.click(screen.getByRole('button', { name: '人工智能' }))
  expect(open).toHaveBeenCalledWith('AI.md')
  expect(container.querySelector('img')).toBeNull()
  expect(container.querySelector('pre')?.textContent).toBe('[[AI]]')
  expect(screen.getByRole('heading', { name: '研究' })).toBeTruthy()
})
it('排版 GFM 与 Obsidian 语法：属性、表格、列表、任务、高亮、callout', () => {
  const md = '---\ntitle: 研究\ntags: [AI, 投资]\n---\n# 标题\n第一行\n第二行 *斜体* ~~删~~ ==重点==\n\n1. 一\n2. 二\n   - 子项\n\n- [x] 完成\n- [ ] 待办\n\n| 代码 | 涨跌 |\n|---|--:|\n| AAPL | 1.2% |\n\n> [!warning] 风险提示\n> 注意仓位\n\n<script>alert(1)</script>'
  const { container } = render(<MarkdownPreview content={md} relations={null} onOpen={vi.fn()} />)
  expect(screen.getByLabelText('笔记属性').textContent).toContain('研究')
  expect(Array.from(container.querySelectorAll('.kb-tag')).map(t => t.textContent)).toEqual(['AI', '投资'])
  expect(container.textContent).not.toContain('title: 研究')
  expect(container.querySelector('p br')).toBeTruthy()
  expect(container.querySelector('em')?.textContent).toBe('斜体')
  expect(container.querySelector('del')?.textContent).toBe('删')
  expect(container.querySelector('mark')?.textContent).toBe('重点')
  expect(container.querySelectorAll('ol > li')).toHaveLength(2)
  expect(container.querySelector('ol li ul li')?.textContent).toBe('子项')
  const boxes = container.querySelectorAll<HTMLInputElement>('input.kb-task')
  expect(Array.from(boxes).map(b => b.checked)).toEqual([true, false])
  expect(container.querySelector('td[style*="right"]')?.textContent).toBe('1.2%')
  expect(container.querySelector('.kb-callout-warning .kb-callout-title')?.textContent).toBe('风险提示')
  expect(container.querySelector('.kb-callout-body')?.textContent).toContain('注意仓位')
  expect(container.querySelector('script')).toBeNull()
  expect(container.textContent).not.toContain('alert(1)')
})
it('Notion 导出的 HTML 表格（含空行）渲染成表格，首行为表头；危险内容被剔除', () => {
  const md = '## 2.1 核心诉求拆解\n你原始描述：\n\n<table header-row="true">\n<tr>\n<td>你的原话</td>\n<td>可行性</td>\n</tr>\n\n<tr>\n<td>claude code 写需求</td>\n<td>✅ **各家都有** API</td>\n</tr>\n</table>\n\n正文 <strong>加粗</strong><br>换行 <a href="javascript:alert(1)" onclick="x()">坏链接</a> <img src="x" onerror="alert(1)">'
  const { container } = render(<MarkdownPreview content={md} relations={null} onOpen={vi.fn()} />)
  expect(Array.from(container.querySelectorAll('th')).map(th => th.textContent)).toEqual(['你的原话', '可行性'])
  expect(Array.from(container.querySelectorAll('td')).map(td => td.textContent)).toEqual(['claude code 写需求', '✅ 各家都有 API'])
  expect(container.querySelector('td strong')?.textContent).toBe('各家都有')
  expect(container.textContent).not.toContain('<tr>')
  expect(container.querySelector('p strong')?.textContent).toBe('加粗')
  expect(container.querySelector('p br')).toBeTruthy()
  expect(container.querySelector('a[href^="javascript"]')).toBeNull()
  expect(container.querySelector('[onclick], [onerror], img')).toBeNull()
})
it('代码块：语言标签、语法高亮、复制按钮，源码中的 HTML 不会被执行', () => {
  const md = '```python\ndef f():\n    return "<img src=x onerror=alert(1)>"\n```\n\n```\n纯文本\n```'
  const { container } = render(<MarkdownPreview content={md} relations={null} onOpen={vi.fn()} />)
  const blocks = container.querySelectorAll('.kb-code')
  expect(blocks[0].querySelector('.kb-code-head span')?.textContent).toBe('python')
  expect(blocks[0].querySelector('.hljs-keyword')?.textContent).toBe('def')
  expect(blocks[0].querySelector('img')).toBeNull()
  expect(blocks[0].querySelector('code')?.textContent).toContain('<img src=x onerror=alert(1)>')
  expect(blocks[1].querySelector('code')?.textContent).toBe('纯文本')
  expect(screen.getAllByRole('button', { name: '复制代码' })).toHaveLength(2)
})
it('导出时被压成一行的代码块（行内代码 + <br>）还原为代码块，语言取上一行', () => {
  const md = 'Plaintext\n\n`+---+<br>| 阶段一 &amp; 二 |<br>+---+`\n\n| 列 |\n|---|\n| `a<br>b` |'
  const { container } = render(<MarkdownPreview content={md} relations={null} onOpen={vi.fn()} />)
  const block = container.querySelector('.kb-code')!
  expect(block.querySelector('.kb-code-head span')?.textContent).toBe('plaintext')
  expect(block.querySelector('pre code')?.textContent).toBe('+---+\n| 阶段一 & 二 |\n+---+')
  expect(container.textContent).not.toContain('<br>')
  expect(container.querySelector('td code br')).toBeTruthy()
  expect(Array.from(container.querySelectorAll('p')).some(p => p.textContent === 'Plaintext')).toBe(false)
})
it('导出时用 <br> 连成一段、引用符转义成 \\> 的内容恢复为分行引用', () => {
  const md = 'Key highlights:<br>主要亮点：<br>> 机构级量化工具<br>\\> 生产级代码质量<br>\\> 开源许可 \\> 持续维护<br>Apache-2.0 开源\n\n| 列 |\n|---|\n| a<br>b |'
  const { container } = render(<MarkdownPreview content={md} relations={null} onOpen={vi.fn()} />)
  expect(container.textContent).not.toContain('\\>')
  expect(container.textContent).not.toContain('<br>')
  const quote = container.querySelector('blockquote')!
  expect(quote.textContent).toBe('机构级量化工具生产级代码质量开源许可持续维护')
  expect(quote.querySelectorAll('br')).toHaveLength(3)
  expect(Array.from(container.querySelectorAll('p')).map(p => p.textContent)).toContain('Apache-2.0 开源')
  expect(container.querySelector('td br')).toBeTruthy()
})
