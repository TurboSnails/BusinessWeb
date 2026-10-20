import React from 'react'
import { Download } from 'lucide-react'

const FLOW = `grill-me ─ to-spec ─ to-tickets ─┬─ implement ──────┬─ code-review ─ pr ─ retro
                                 └─ implement-spec ─┘`

export default function MattWorkflowSkillCard(): JSX.Element {
  return (
    <article className="skill-card">
      <span className="tag">开发协作 Skill</span>
      <h3>Matt Pocock 开发工作流</h3>
      <p className="skill-card__alias">matt-workflow · Skills v1.3 中文版</p>
      <p className="skill-card__focus">想法 → spec → tickets → 实现 → 审查 → PR → 复盘</p>
      <pre><code>{FLOW}</code></pre>
      <p>先被追问把设计想清楚，再把对话写成 spec、拆成带依赖关系的 tickets；可以逐个 ticket 实现，也可以用 v1.3 新增的 implement-spec 按依赖图并行派子代理实现到同一集成分支。之后做 Standards / Spec 双轴代码审查，用 pr 写带图示、证据和合并风险的 PR 描述，最后用 retro 复盘并改进 agent 的工作环境。</p>
      <p>完整 ZIP 含 9 个流程 Skill 与 grilling、tdd、setup-matt-pocock-skills 三个依赖，可独立安装。</p>
      <p><strong>产出：</strong>spec（PRD）、tickets、测试先行的代码提交、双轴审查报告、PR 描述、复盘建议。</p>
      <p><strong>运行要求：</strong>Claude Code 或其他支持 Skills 的助手；先用 setup-matt-pocock-skills 配置 issue tracker（GitHub、GitLab 或本地文件）。implement-spec 另需子代理与 git worktree。</p>
      <details className="skill-example">
        <summary>试一句提示词</summary>
        <p><code>/grill-me 我想给 DCF 页面加一个“对比两家公司”的功能</code>，聊清楚后接着 <code>/to-spec</code>、<code>/to-tickets</code>。</p>
      </details>
      <details className="skill-example skill-install">
        <summary>安装与使用</summary>
        <ol>
          <li>解压 ZIP，把 <code>skills/</code> 下的全部文件夹复制到项目的 <code>.claude/skills/</code> 或 <code>.agents/skills/</code>。</li>
          <li>重新打开会话，运行 <code>/setup-matt-pocock-skills</code> 配置 issue tracker 与 triage labels。</li>
          <li>运行 <code>/matt-workflow</code> 查看流程与下一步，或直接从 <code>/grill-me</code> 开始。每一站都手动调用，不会自动连跑。</li>
        </ol>
        <p>小改动用 <code>/implement</code> 一次做一个 ticket；ticket 多且可并行时用 <code>/implement-spec</code>。</p>
      </details>
      <details className="skill-example">
        <summary>来源</summary>
        <p>翻译自 <a href="https://github.com/mattpocock/skills" target="_blank" rel="noreferrer">mattpocock/skills</a>（MIT 许可）。pr 的图示菜单来自 Dex Horthy 的 show-me，署名见包内 CREDITS.md。</p>
      </details>
      <div className="skill-download-actions">
        <a className="skill-download" href={`${import.meta.env.BASE_URL}ai-skills/matt-workflow.zip`} download="matt-workflow.zip" aria-label="下载 Matt Pocock 开发工作流完整 ZIP">
          <Download size={16} aria-hidden="true" /> 下载完整 ZIP
        </a>
      </div>
    </article>
  )
}
