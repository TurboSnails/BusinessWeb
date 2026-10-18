import React from 'react'
import '../styles/hub-pages.css'
import { Page } from '../components/ui'

interface LifeItem {
  title: string
  desc: string
  state: '进行中' | '准备中'
}

interface LifeSection {
  id: string
  title: string
  desc: string
  items: LifeItem[]
}

const SECTIONS: LifeSection[] = [
  {
    id: 'on-the-road',
    title: '路上',
    desc: '脚踏实地的日常修行与实践，走好当下的每一步。',
    items: [
      {
        title: '锻炼身体',
        desc: '保持规律运动与体能锻炼，重视作息与睡眠。健康的体魄是一切精力、专注与自由生活的基石。',
        state: '进行中',
      },
      {
        title: '冥想',
        desc: '每日正念冥想与呼吸觉察。在市场的波动与日常的琐碎喧嚣中，保持内心的安顿、觉知与清醒。',
        state: '进行中',
      },
      {
        title: '前端全栈',
        desc: '打磨现代 Web 前端与全栈工程能力，掌握端到端独立交付，亲手把想法做成可用、好用的小产品。',
        state: '进行中',
      },
      {
        title: '*** → 目标 400 万',
        desc: '目标是 400 万。工作积累本金，同时每周拿出几小时积累作品：写书、建站、做第一个小产品。',
        state: '进行中',
      },
      {
        title: '读书与写作',
        desc: '持续阅读经典，沉淀认知；通过公开写作和投资复盘，理清思考，把日子过得明白从容。',
        state: '进行中',
      },
    ],
  },
  {
    id: 'distant-horizon',
    title: '远方',
    desc: '尚未实现的愿景与目标，心怀向往，静待花开。',
    items: [
      {
        title: '离开全职工作',
        desc: '到达 400 万后，从“最大化工资”换成“时间自主”。前三个月只休息，不要求赚钱。',
        state: '准备中',
      },
      {
        title: '自由生活第一年',
        desc: '记录花了多少钱、投资怎么样、每天做什么、有没有后悔。让真正有生命力的事自然长大。',
        state: '准备中',
      },
    ],
  },
]

export default function LifeLab(): JSX.Element {
  return (
    <Page className="hub-page life-hub">
      <header className="page-head">
        <h1>自由之路</h1>
        <p>一个普通程序员关于钱、技术与自由生活的长期实验。钱不是终点，是选择权。</p>
      </header>
      {SECTIONS.map(sec => (
        <section key={sec.id} className="life-section" aria-labelledby={`sec-${sec.id}`}>
          <div className="life-section__head">
            <h2 id={`sec-${sec.id}`}>{sec.title}</h2>
            <p className="life-section__desc">{sec.desc}</p>
          </div>
          <ol className="road">
            {sec.items.map(s => (
              <li
                key={s.title}
                className={`road__item life-stage${s.state === '进行中' ? ' is-current' : ''}`}
                aria-current={s.state === '进行中' ? 'step' : undefined}
              >
                <div className="road__head">
                  <h3>{s.title}</h3>
                  <span className="tag">{s.state}</span>
                </div>
                <p>{s.desc}</p>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </Page>
  )
}
