import React, { useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import promptText from '../../content/human3-interview-prompt.md?raw'

const prompt = promptText.trim()

export default function HumanInterviewPrompt(): JSX.Element {
  const [state, setState] = useState<'idle' | 'copying' | 'copied' | 'failed'>('idle')
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)

  async function copy() {
    setState('copying')
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
      await navigator.clipboard.writeText(prompt)
      setState('copied')
    } catch {
      if (detailsRef.current) detailsRef.current.open = true
      textRef.current?.focus()
      textRef.current?.select()
      setState('failed')
    }
  }

  return <section className="human-life__prompt" aria-labelledby="human-prompt-title">
    <div className="human-life__section-head">
      <h2 id="human-prompt-title">人生规划提示词</h2>
      <button type="button" className="tool-btn" disabled={state === 'copying'} onClick={() => void copy()}>
        {state === 'copied' ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
        {state === 'copying' ? '正在复制…' : state === 'copied' ? '已复制' : '复制完整提示词'}
      </button>
    </div>
    <p className="human-life__note">复制到你常用的 AI 对话中，从第一个问题开始，逐步完成四象限分析与90天规划。</p>
    <details ref={detailsRef}>
      <summary>查看完整提示词</summary>
      <textarea ref={textRef} aria-label="完整人生规划提示词" readOnly rows={16} value={prompt} spellCheck={false} />
    </details>
    {state === 'copied' && <p role="status" className="human-life__note">完整提示词已复制，可以粘贴到 AI 对话中。</p>}
    {state === 'failed' && <p role="alert" className="human-life__note">自动复制不可用。完整提示词已选中，请手动复制。</p>}
  </section>
}
