import React from 'react'
import { Download } from 'lucide-react'

const FLOW = `① 需求 ─ ② 澄清(Matt) ─ ③ 规范(OpenSpec) ─ ④ 架构审查 ─ ⑤ 实现(Superpowers+Agents) ─ ⑥ 门禁(CI) ─ ⑦ 合并·归档`

export default function FullstackWorkflowSkillCard(): JSX.Element {
  return (
    <article className="skill-card">
      <span className="tag">开发协作 Skill</span>
      <h3>全栈 AI 开发工作流</h3>
      <p className="skill-card__alias">fullstack-workflow · OpenSpec + Matt + Superpowers</p>
      <p className="skill-card__focus">Web · App · 后端 · 数据库 · 云服务，不绑定语言框架</p>
      <pre><code>{FLOW}</code></pre>
      <p>一个入口 skill 把三套工具编排成一条流程：OpenSpec 是唯一规范来源，Matt 的 grill-with-docs 负责把需求想清楚，Superpowers 的 TDD、系统化调试与验证负责把代码做扎实，CI 负责证明结果。拿到需求先判快速、标准或严格模式，一个按钮不走全流程，支付、认证、破坏性迁移必走严格模式并设审批门。</p>
      <p>多 Agent 分工明确：Orchestrator、Architect、Implementer、Reviewer、Verifier 各有边界，共享 Spec 但隔离 worktree，同一文件串行，Reviewer 不能是实现者。缺少某个工具时给出替代做法，不会卡住。</p>
      <p><strong>产出：</strong>模式判定、需求澄清记录、OpenSpec change（proposal / specs / design / tasks）、架构审查结论、派工任务卡与回执、验证报告、发布与归档清单。</p>
      <p><strong>运行要求：</strong>支持 Skills 的助手。OpenSpec、Matt Skills、Superpowers 均可选装；多 Agent 并行需 git worktree 与子代理，跨执行器派工可配合 dev-team。CI 由项目自行配置。</p>
      <details className="skill-example">
        <summary>试一句提示词</summary>
        <p><code>/fullstack-workflow 订单列表支持按状态筛选并导出 CSV</code>，skill 会判为标准模式，先澄清再 <code>/opsx:propose</code>。</p>
      </details>
      <details className="skill-example skill-install">
        <summary>安装与使用</summary>
        <ol>
          <li>解压 ZIP，把 <code>fullstack-workflow/</code> 整个文件夹放进项目的 <code>.agents/skills/</code> 或 <code>.claude/skills/</code>。</li>
          <li>按需安装 OpenSpec（<code>npm i -g @fission-ai/openspec</code> 后 <code>openspec init</code>）、Matt Skills 与 Superpowers；包内 <code>references/tools.md</code> 写了每个工具的命令与缺省替代。</li>
          <li>按 <code>references/project-structure.md</code> 在项目根补 <code>AGENTS.md</code> 与门禁命令表，重新打开会话后用 <code>/fullstack-workflow &lt;需求&gt;</code> 开始。每阶段结束等你确认，不自动连跑。</li>
        </ol>
      </details>
      <details className="skill-example">
        <summary>包内文件</summary>
        <p>SKILL.md 入口；references 六份：modes（模式判定）、stages（七阶段）、tools（工具取舍）、agents（角色与隔离）、gates（门禁与审批）、project-structure（目录与 AGENTS.md 模板）；templates 五份：需求澄清、架构审查、任务卡、验证报告、发布清单。</p>
      </details>
      <div className="skill-download-actions">
        <a className="skill-download" href={`${import.meta.env.BASE_URL}ai-skills/fullstack-workflow.zip`} download="fullstack-workflow.zip" aria-label="下载全栈 AI 开发工作流完整 ZIP">
          <Download size={16} aria-hidden="true" /> 下载完整 ZIP
        </a>
      </div>
    </article>
  )
}
