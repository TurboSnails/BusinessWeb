import React from 'react'
import { Download } from 'lucide-react'
import skillMarkdown from '../../../agent-skills/skills/deepen-task/SKILL.md?raw'

const ORIGINAL_PROMPT = skillMarkdown.split('## 原始提示词\n\n> ')[1].trim()

export default function DeepenTaskSkillCard(): JSX.Element {
  return (
    <article className="skill-card">
      <span className="tag">提示词改写 Skill</span>
      <h3>任务深挖</h3>
      <p className="skill-card__alias">deepen-task</p>
      <p className="skill-card__focus">专家视角 · 一手材料 · 具体方法 · 独立验证</p>
      <p>在原有任务范围内提升专业深度：先找出专家会补上的关键工作，追溯最原始的材料，明确具体方法与工具，并用外部证据定义验收标准，最后重写成可直接使用的提示词。</p>
      <p><strong>产出：</strong>四项诊断和一份完整提示词。适合研究、分析、设计与写作任务；运行本 Skill 只改写请求，后续执行由你决定。</p>
      <details className="skill-example">
        <summary>试一句提示词</summary>
        <p>用 deepen-task 深挖这个任务：分析公司近三年的盈利质量，交付一页结论。保持公司、时间范围和篇幅，先说明专家会补什么、一手材料、具体方法与工具、独立验证标准，再重写提示词。</p>
      </details>
      <details className="skill-example">
        <summary>英文原始提示词</summary>
        <p>{ORIGINAL_PROMPT}</p>
      </details>
      <div className="skill-download-actions">
        <a className="skill-download" href={`${import.meta.env.BASE_URL}ai-skills/deepen-task.zip`} download="deepen-task.zip" aria-label="下载任务深挖完整 ZIP">
          <Download size={16} aria-hidden="true" /> 下载完整 ZIP
        </a>
      </div>
    </article>
  )
}
