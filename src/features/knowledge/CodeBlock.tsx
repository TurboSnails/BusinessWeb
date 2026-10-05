import React, { useMemo, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import diff from 'highlight.js/lib/languages/diff'
import go from 'highlight.js/lib/languages/go'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import kotlin from 'highlight.js/lib/languages/kotlin'
import markdown from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

// 只注册笔记里常见的语言，控制体积
const LANGUAGES = { bash, css, diff, go, java, javascript, json, kotlin, markdown, python, rust, sql, typescript, xml, yaml }
Object.entries(LANGUAGES).forEach(([name, lang]) => hljs.registerLanguage(name, lang))
hljs.registerAliases(['sh', 'shell', 'zsh', 'console'], { languageName: 'bash' })
hljs.registerAliases(['html', 'svg', 'vue'], { languageName: 'xml' })
hljs.registerAliases(['js', 'jsx', 'mjs'], { languageName: 'javascript' })
hljs.registerAliases(['ts', 'tsx'], { languageName: 'typescript' })
hljs.registerAliases(['py'], { languageName: 'python' })
hljs.registerAliases(['yml'], { languageName: 'yaml' })
hljs.registerAliases(['md'], { languageName: 'markdown' })
hljs.registerAliases(['kt', 'kts'], { languageName: 'kotlin' })

const AUTO_DETECT_LIMIT = 6000

/**
 * 代码块：语言标签 + 复制按钮 + 语法高亮。
 * highlight.js 会先转义源码再包 <span class="hljs-…">，输出只含它自己生成的标签，可以安全注入。
 */
export default function CodeBlock({ code, lang }: { code: string; lang?: string }): JSX.Element {
  const [copied, setCopied] = useState(false)
  const { html, label } = useMemo(() => {
    const name = (lang ?? '').trim().split(/\s+/)[0].toLowerCase()
    try {
      if (name && hljs.getLanguage(name)) return { html: hljs.highlight(code, { language: name, ignoreIllegals: true }).value, label: name }
      if (!name && code.length <= AUTO_DETECT_LIMIT) {
        const auto = hljs.highlightAuto(code)
        if (auto.language && auto.relevance >= 5) return { html: auto.value, label: auto.language }
      }
    } catch { /* 高亮失败时按纯文本显示 */ }
    return { html: null, label: name || 'text' }
  }, [code, lang])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* 剪贴板不可用（非安全上下文等）时忽略 */ }
  }

  return (
    <div className="kb-code">
      <div className="kb-code-head">
        <span>{label}</span>
        <button type="button" onClick={() => void copy()} aria-label="复制代码">{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? '已复制' : '复制'}</button>
      </div>
      <pre data-lang={label}>
        {html !== null ? <code className="hljs" dangerouslySetInnerHTML={{ __html: html }} /> : <code>{code}</code>}
      </pre>
    </div>
  )
}
