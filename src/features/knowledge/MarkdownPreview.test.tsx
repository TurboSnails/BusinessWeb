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
it('</table> 后紧跟正文和代码块（无空行）时，不会把后文吞进 HTML 块', () => {
  const md = '介绍：\n<table header-row="true">\n<tr>\n<td>**维度**</td>\n</tr>\n<tr>\n<td>核心层</td>\n</tr>\n</table>\n正文一段\n```python\nprint(1)\n```\n后文\n<table>\n<tr>\n<td>第二张</td>\n</tr>\n</table>\n结尾'
  const { container } = render(<MarkdownPreview content={md} relations={null} onOpen={vi.fn()} />)
  expect(container.querySelectorAll('table')).toHaveLength(2)
  expect(container.querySelector('th strong')?.textContent).toBe('维度')
  expect(container.querySelectorAll('.kb-code')).toHaveLength(1)
  expect(container.querySelector('.kb-code code')?.textContent).toBe('print(1)')
  expect(Array.from(container.querySelectorAll('p')).map(p => p.textContent)).toEqual(expect.arrayContaining(['正文一段', '后文', '结尾']))
  expect(container.textContent).not.toMatch(/<\/?(table|tr|td)\b/)
})
it('Notion 转义成 \\<table\\> 的表格还原渲染', () => {
  const md = '下表：\n\\<table header-row="true"\\>\\<tr\\>\\<td\\>情景\\</td\\>\\<td\\>价格\\</td\\>\\</tr\\>\\<tr\\>\\<td\\>基准\\</td\\>\\<td\\>\\$249.27\\</td\\>\\</tr\\>\n\\</table\\>\n**模型输出**'
  const { container } = render(<MarkdownPreview content={md} relations={null} onOpen={vi.fn()} />)
  expect(Array.from(container.querySelectorAll('th')).map(t => t.textContent)).toEqual(['情景', '价格'])
  expect(Array.from(container.querySelectorAll('td')).map(t => t.textContent)).toEqual(['基准', '$249.27'])
  expect(container.textContent).not.toMatch(/\\|<\/?t(able|r|d)/)
  expect(container.querySelector('p strong')?.textContent).toBe('模型输出')
})
it('Notion 制表符缩进的嵌套内容：段落、表格、代码围栏都按原样识别，不当成缩进代码', () => {
  const md = '- 折叠块\n\n\t嵌套段落 **加粗**\n\t\t\t<table header-row="true">\n<tr>\n<td>层级</td>\n</tr>\n<tr>\n<td>L1</td>\n</tr>\n</table>\n\n\t```\n\t一、启动:<br>adb shell am start \\<包名\\><br>\n\t```\n结尾'
  const { container } = render(<MarkdownPreview content={md} relations={null} onOpen={vi.fn()} />)
  expect(Array.from(container.querySelectorAll('p')).map(p => p.textContent?.trim())).toContain('嵌套段落 加粗')
  expect(container.querySelector('th')?.textContent).toBe('层级')
  const codes = container.querySelectorAll('.kb-code code')
  expect(codes).toHaveLength(1)
  expect(codes[0].textContent).toBe('一、启动:\nadb shell am start <包名>\n')
})
it('Notion 折叠块 <details>：标题取 summary，内部（带缩进）按 Markdown 解析，支持嵌套', () => {
  const md = '前言\n\t\t<details>\n\t\t<summary>**架构设计**</summary>\n\t\t\t## 一、问题定义\n\t\t\t普通 Agent **无状态**:\n\t\t\t1. 记忆要全\n\t\t\t2. 要懂用户\n\t\t\t\t- 子项\n\t\t\t<table header-row="true">\n<tr>\n<td>层级</td>\n</tr>\n</table>\n\t\t\t<details>\n\t\t\t<summary>内层</summary>\n\t\t\t\t内层正文\n\t\t\t</details>\n\t\t</details>\n结尾'
  const { container } = render(<MarkdownPreview content={md} relations={null} onOpen={vi.fn()} />)
  const outer = container.querySelector('details.kb-details')!
  expect(outer.querySelector(':scope > summary strong')?.textContent).toBe('架构设计')
  const body = outer.querySelector(':scope > .kb-details-body')!
  expect(body.querySelector('h3')?.textContent).toBe('一、问题定义')
  expect(body.querySelectorAll('ol > li')).toHaveLength(2)
  expect(body.querySelector('ol li ul li')?.textContent).toBe('子项')
  expect(body.querySelector('th')?.textContent).toBe('层级')
  const inner = body.querySelector('details.kb-details')!
  expect(inner.querySelector('summary')?.textContent).toBe('内层')
  expect(inner.textContent).toContain('内层正文')
  expect(container.textContent).not.toMatch(/<\/?(details|summary)|##/)
  expect(Array.from(container.querySelectorAll(':scope > article > p')).map(p => p.textContent)).toEqual(['前言', '结尾'])
})
it('制表符缩进的标题和分隔线仍按标题、分隔线显示', () => {
  const { container } = render(<MarkdownPreview content={'正文\n\n\t\t## Technology\n\t\t---\n\t### 传统的 MVC'} relations={null} onOpen={vi.fn()} />)
  expect(container.querySelector('h3')?.textContent).toBe('Technology')
  expect(container.querySelector('hr')).toBeTruthy()
  expect(container.querySelector('h4')?.textContent).toBe('传统的 MVC')
})
