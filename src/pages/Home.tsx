import React from 'react'
import { Link } from 'react-router-dom'

export default function Home(): JSX.Element {
  return (
    <main className="container">
      <section className="card">
        <Link to="/investment-targets" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
          <h2>📈 长期看好的公司</h2>
          <p>投资标的列表</p>
        </Link>
      </section>

      <section className="card">
        <Link to="/pulse" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
          <h2>📊 经济脉搏</h2>
          <p>每日经济分析(机构+游资)</p>
        </Link>
      </section>

      <section className="card">
        <Link to="/investment-plan-2026" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
          <h2>📅 2026年美股投资计划</h2>
          <p>基于经济衰退预警的系统性风险管理方案</p>
        </Link>
      </section>

      <section className="card">
        <h2>跨设备支持</h2>
        <p>这是一个移动优先的响应式布局，适应手机和平板与桌面屏幕。</p>
      </section>
    </main>
  )
}
