import React from 'react'

const STEPS = [
  { title: '建站', desc: '用 Next.js / React 把个人网站做成学习项目，同时沉淀作品。', state: '进行中' },
  { title: '正念投资 AI V0.1', desc: '输入一家公司，按书里的框架一步步提问：分类、产业、商业模式、护城河、财报、估值、周期、证伪条件，最后生成投资决策卡。不预测涨跌。', state: '准备中' },
  { title: '公开验证', desc: '找 20 个真实用户用起来，看哪些环节有人愿意持续使用。', state: '准备中' },
]

export default function AiStudio(): JSX.Element {
  return (
    <main className="container animate-fade-in">
      <header className="page-head">
        <h1>AI 与独立开发</h1>
        <p>用技术放大自己的创造力。第一个作品，从《正念投资》长出来。</p>
      </header>
      <ol className="road">
        {STEPS.map(s => (
          <li key={s.title} className="road__item">
            <div className="road__head">
              <h2>{s.title}</h2>
              <span className="tag">{s.state}</span>
            </div>
            <p>{s.desc}</p>
          </li>
        ))}
      </ol>
    </main>
  )
}
