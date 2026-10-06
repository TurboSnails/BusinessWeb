import React from 'react'
import { Download } from 'lucide-react'
import { INVESTMENT_SKILLS, INVESTMENT_SKILL_TAG, investmentSkillDownloadUrl } from '../data/investmentSkills'

export default function InvestmentAiTools(): JSX.Element {
  return (
    <main className="container animate-fade-in investment-ai-tools">
      <header className="page-head">
        <h1>AI 工具</h1>
        <p>三套投资分析 Skill 专家，按研究问题挑选。下载包包含 SKILL.md 和完整参考资料。</p>
        <div className="skill-download-actions">
          <span className="tag">{INVESTMENT_SKILL_TAG}</span>
          <a className="skill-download" href={investmentSkillDownloadUrl('investment-analysis-skills.zip')} download="investment-analysis-skills.zip">
            <Download size={16} aria-hidden="true" /> 下载全部（3 套 ZIP）
          </a>
        </div>
      </header>

      <section className="skill-grid" aria-label="投资分析 Skill 专家">
        {INVESTMENT_SKILLS.map(skill => (
          <article className="skill-card" key={skill.id}>
            <span className="tag">{INVESTMENT_SKILL_TAG}</span>
            <h2>{skill.name}</h2>
            <p className="skill-card__alias">{skill.alias}</p>
            <p className="skill-card__focus">{skill.focus}</p>
            <p>{skill.description}</p>
            <p><strong>产出：</strong>{skill.outputs}</p>
            <details className="skill-example">
              <summary>试一句提示词</summary>
              <p>{skill.example}</p>
            </details>
            <a className="skill-download" href={investmentSkillDownloadUrl(`${skill.id}.zip`)} download={`${skill.id}.zip`} aria-label={`下载${skill.name}完整 ZIP`}>
              <Download size={16} aria-hidden="true" /> 下载完整 ZIP
            </a>
          </article>
        ))}
      </section>

      <section className="road__item skill-install" aria-labelledby="skill-install-title">
        <h2 id="skill-install-title">下载后怎么用</h2>
        <ol>
          <li>解压 ZIP，保留每套 Skill 的整个文件夹，包括 SKILL.md 和 references。</li>
          <li>放到项目的 <code>.agents/skills/</code>（Codex）或 <code>.claude/skills/</code>（Claude Code）目录；OpenCode 可用 <code>.opencode/skills/</code>。</li>
          <li>重新打开会话，在提问时写出专家名称，并提供股票代码、市场和研究问题。</li>
        </ol>
        <p>Skill 是供 AI 助手读取的研究流程，使用前需准备公开数据查询能力；团队类 Skill 还需助手支持子代理编排。具体要求见包内说明。</p>
        <a className="skill-guide" href={investmentSkillDownloadUrl('README.md')} download="投资分析Skill-使用说明.md">下载使用说明</a>
      </section>
      <p className="skill-disclaimer">这些工具用于辅助研究，AI 输出需核对数据来源与日期，不构成投资建议。</p>
    </main>
  )
}
