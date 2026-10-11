import React from 'react'
import { Download } from 'lucide-react'

export default function DevTeamSkillCard(): JSX.Element {
  return (
    <article className="skill-card">
      <span className="tag">开发协作 Skill</span>
      <h3>Orca 开发团队 dev-team</h3>
      <p className="skill-card__alias">dev-team · 可迁移的多执行器开发团队</p>
      <p className="skill-card__focus">Android · Web 前端 · 后端 · 全栈协作</p>
      <p>一个管理入口，通过 Orca 分派开发、审查和测试任务。以 Codex、Claude 为主，支持 Kimi、Antigravity 和 OpenCode MiniMax M3 辅助；各平台分别组织需求、设计与验证流程，只加载当前任务需要的资料。</p>
      <p>执行器额度不足时，记录进度并交接给可用替补。技能可独立安装到其他项目，运行记录和账号凭据不包含在下载包中。</p>
      <p><strong>产出：</strong>任务计划、设计与接口契约、代码改动、审查与测试记录、交接检查点。</p>
      <p><strong>运行要求：</strong>Node 20+、Orca，以及至少一个已安装、已登录且有可用额度的执行器。Android 构建与设备验证还需目标项目的 SDK 和设备环境。</p>
      <details className="skill-example">
        <summary>试一句提示词</summary>
        <p><code>$dev-team 开发 Android 订单列表和后端分页接口，先统一接口契约，再分派实现、审查与测试。</code></p>
      </details>
      <details className="skill-example skill-install">
        <summary>安装与使用</summary>
        <ol>
          <li>下载并解压 ZIP，保留整个 <code>dev-team</code> 文件夹。</li>
          <li>安装到目标项目：<code>node /path/to/dev-team/scripts/dev-team.mjs init --project /path/to/project</code>。这会创建项目配置，并连接 Codex、Claude Code 和 OpenCode 的技能入口。</li>
          <li>在 Orca 打开目标项目并重新开启会话，使用 <code>$dev-team</code>（Codex）、<code>/dev-team</code>（Claude Code）或 <code>/skill:dev-team</code>（Kimi），加上开发目标。</li>
        </ol>
        <p>详细派工、额度替补与恢复步骤见包内 <code>references/operations.md</code> 和 <code>references/recovery.md</code>。</p>
      </details>
      <a className="skill-download" href={`${import.meta.env.BASE_URL}ai-skills/dev-team.zip`} download="dev-team.zip" aria-label="下载 Orca 开发团队 dev-team 完整 ZIP">
        <Download size={16} aria-hidden="true" /> 下载完整 ZIP
      </a>
    </article>
  )
}
