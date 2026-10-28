import React from 'react'
import { Download } from 'lucide-react'

export default function KfDeeperSkillCard(): JSX.Element {
  return (
    <article className="skill-card">
      <span className="tag">提示词改写 Skill</span>
      <h3>更深，而不是更大</h3>
      <p className="skill-card__alias">kf-deeper</p>
      <p className="skill-card__focus">专业补足 · 原始材料 · 方法工具 · 独立验证</p>
      <p>把现有任务或功能的要求改写得更深入而不扩大范围：先回答四问，再给出可直接使用的改写提示词。改写完成后停止，等你确认才执行。仅在明确要求“做深”时触发，普通实现、修复或润色不会自动调用。</p>
      <p><strong>产出：</strong>四问回答和一段完整提示词；涉及行为、接口、成本的建议单列为可选项，不写成新要求。</p>
      <details className="skill-example">
        <summary>试一句提示词</summary>
        <p>$kf-deeper 把登录按钮的防重复提交做深一点，保持现有接口与用户流程，改写任务。</p>
      </details>
      <div className="skill-download-actions">
        <a className="skill-download" href={`${import.meta.env.BASE_URL}ai-skills/kf-deeper.zip`} download="kf-deeper.zip" aria-label="下载更深而不是更大完整 ZIP">
          <Download size={16} aria-hidden="true" /> 下载完整 ZIP
        </a>
      </div>
    </article>
  )
}
