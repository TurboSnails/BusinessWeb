import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Download } from 'lucide-react'
import AskLab from '../components/lab/AskLab'
import LabDirectionCard from '../components/lab/LabDirectionCard'
import { LAB_PRINCIPLE, LAB_SHOWCASE, avoidedDirections, findDirection, labStats, recommendedDirections } from '../data/aiLab'
import '../styles/hub-pages.css'
import { Page } from '../components/ui'

export default function AiStudio(): JSX.Element {
  const stats = labStats()
  const avoided = avoidedDirections()
  return (
    <Page className="hub-page lab-page lab-hub">
      <header className="page-head">
        <h1>AI实验室</h1>
        <p>一个程序员为自由生活准备的第二曲线：开发、工具、内容和小生意，每个方向都当成一次公开实验。</p>
        <p className="lab-stats">作品 {stats.works} · 进行中 {stats.running} · 已停止 {stats.stopped}</p>
      </header>

      <AskLab />

      <section id="lab-skills" className="lab-section" aria-labelledby="lab-skills-title">
        <h2 id="lab-skills-title">可下载的 Skills</h2>
        <article className="skill-card">
          <span className="tag">开发协作 Skill</span>
          <h3>Orca 开发团队 dev-team</h3>
          <p className="skill-card__focus">Android · Web 前端 · 后端 · 全栈协作</p>
          <p>在 Orca 中用一个管理入口，协调 Codex、Claude、Kimi、Antigravity 与 OpenCode MiniMax M3，按平台拆解任务、派工、审查与验收。可安装到其他项目，保留进度用于交接与替补。</p>
          <p>完整 ZIP 含技能与 README，涵盖安装、自检、项目配置和日常使用。建议先从只读代码评审开始。</p>
          <div className="skill-download-actions">
            <a className="skill-download" href={`${import.meta.env.BASE_URL}ai-skills/dev-team.zip`} download="dev-team.zip" aria-label="下载 Orca 开发团队 dev-team 完整 ZIP">
              <Download size={16} aria-hidden="true" /> 下载 dev-team ZIP
            </a>
            <Link className="skill-guide" to="/ai/dev-team">使用说明 README</Link>
            <Link className="skill-guide" to="/ai/ai-skills">全部 Skills</Link>
          </div>
        </article>
      </section>


      <nav className="hub-jump-nav" aria-label="AI实验室页内目录">
        <a href="#lab-principle">商业原理</a>
        <a href="#lab-works">作品</a>
        <a href="#lab-learning">学习计划</a>
        <a href="#lab-directions">推荐方向</a>
        <a href="#lab-rules">实验规则</a>
      </nav>

      <section id="lab-principle" className="lab-section lab-principle" aria-labelledby="lab-principle-title">
        <h2 id="lab-principle-title">商业原理</h2>
        <p className="lab-principle__statement">{LAB_PRINCIPLE.statement}</p>

        <div className="lab-principle__grid">
          <div className="lab-principle__part">
            <h3>我的本钱</h3>
            <dl className="lab-limits">
              {LAB_PRINCIPLE.assets.map(a => <React.Fragment key={a.label}><dt>{a.label}</dt><dd>{a.detail}</dd></React.Fragment>)}
            </dl>
          </div>

          <div className="lab-principle__part">
            <h3>价值怎样变成收入</h3>
            <ol className="lab-loop">
              {LAB_PRINCIPLE.loop.map(l => <li key={l.step}><strong>{l.step}</strong><span>{l.text}</span></li>)}
            </ol>
          </div>

          <div className="lab-principle__part lab-principle__layers">
            <h3>三层结构</h3>
            <div className="lab-grid lab-layers">
              {LAB_PRINCIPLE.layers.map(layer => (
                <div key={layer.name} className="lab-card lab-layer">
                  <span className="hub-card__title">{layer.name}</span>
                  <span className="hub-card__desc">{layer.job}</span>
                  <span className="lab-layer__links">
                    {layer.directions.map(slug => {
                      const d = findDirection(slug)
                      return d ? <Link key={slug} to={`/ai/${slug}`} className="tag">{d.title}</Link> : null
                    })}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="lab-principle__part">
            <h3>六条规矩</h3>
            <dl className="lab-limits">
              {LAB_PRINCIPLE.rules.map(r => <React.Fragment key={r.title}><dt>{r.title}</dt><dd>{r.text}</dd></React.Fragment>)}
            </dl>
          </div>

          <div className="lab-principle__part">
            <h3>逐关验证</h3>
            <dl className="lab-limits">
              {LAB_PRINCIPLE.gates.map(g => <React.Fragment key={g.stage}><dt>{g.stage}</dt><dd>{g.pass}</dd></React.Fragment>)}
            </dl>
          </div>
        </div>

        <p><strong>只盯一个数：</strong>{LAB_PRINCIPLE.northStar}</p>
        <p className="hub-group__hint">{LAB_PRINCIPLE.caveat}</p>
      </section>

      <section id="lab-works" className="lab-section" aria-labelledby="lab-works-title">
        <h2 id="lab-works-title">作品</h2>
        <div className="lab-showcase">
          {LAB_SHOWCASE.map(s => (
            <Link key={s.path} to={s.path} className="hub-card lab-showcase__item">
              <span className="hub-card__title">{s.title}</span>
              <span className="hub-card__desc">{s.desc}</span>
              <ArrowRight size={16} className="hub-card__arrow" aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>

      <section id="lab-learning" className="lab-section" aria-labelledby="lab-learning-title">
        <h2 id="lab-learning-title">学习计划</h2>
        <Link to="/ai/fullstack-roadmap" className="lab-card">
          <span className="hub-card__title">AI 全栈 8 周学习路线</span>
          <span className="hub-card__desc">56 天，围绕一个 AI SaaS 边学边做。查看完整计划、标记学习进度、下载原文。</span>
          <span className="tag">进入学习计划 →</span>
        </Link>
      </section>

      <section id="lab-directions" className="lab-section" aria-labelledby="lab-directions-title">
        <h2 id="lab-directions-title">推荐方向</h2>
        <p className="hub-group__hint">按和我的匹配度从高到低排列，匹配度是当前判断。点开看具体用户、获客与收费假设，以及实验边界和日志。</p>
        <div className="lab-grid">
          {recommendedDirections().map(d => <LabDirectionCard key={d.slug} direction={d} />)}
        </div>
      </section>

      <details className="hub-group hub-group--fold lab-section">
        <summary>不推荐（{avoided.length}）</summary>
        <p className="hub-group__hint">这些方向我不做，原因写在每一项里，给想做的人提个醒。</p>
        <div className="lab-grid">
          {avoided.map(d => <LabDirectionCard key={d.slug} direction={d} />)}
        </div>
      </details>

      <section id="lab-rules" className="lab-section" aria-labelledby="lab-rules-title">
        <h2 id="lab-rules-title">实验规则</h2>
        <p>一次只启动一个新实验。每个实验开始前先定好每周时间、预算上限和截止日期；到期看数据，决定继续还是停止。过程和结果都公开记录，没开始的就写“还没开始”。</p>
      </section>
    </Page>
  )
}
