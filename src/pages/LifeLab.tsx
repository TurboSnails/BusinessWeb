import React from 'react'

const STAGES = [
  { title: '*** → 目标 400 万', desc: '目标是 400 万。工作积累本金，同时每周拿出几小时积累作品：写书、建站、做第一个小产品。', state: '进行中' },
  { title: '离开全职工作', desc: '到达 400 万后，从“最大化工资”换成“时间自主”。前三个月只休息，不要求赚钱。', state: '准备中' },
  { title: '自由生活第一年', desc: '记录花了多少钱、投资怎么样、每天做什么、有没有后悔。让真正有生命力的事自然长大。', state: '准备中' },
]

export default function LifeLab(): JSX.Element {
  return (
    <main className="container animate-fade-in">
      <header className="page-head">
        <h1>自由生活实验</h1>
        <p>一个普通程序员关于钱、技术与自由生活的长期实验。钱不是终点，是选择权。</p>
      </header>
      <ol className="road">
        {STAGES.map(s => (
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
