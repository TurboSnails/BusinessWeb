import React from 'react'
import { Link } from 'react-router-dom'

export default function Home(): JSX.Element {
  return (
    <main className="container">
      <section className="card">
        <Link to="/pulse" style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
          <h2>经济脉搏</h2>
          <p>每日经济分析(机构+游资)</p>
        </Link>
      </section>

      <section className="card">
        <h2>跨设备支持</h2>
        <p>这是一个移动优先的响应式布局，适应手机和平板与桌面屏幕。</p>
      </section>

      <section className="card">
        <h2>简单示例</h2>
        <p>调整屏幕尺寸查看布局变化。</p>
      </section>
    </main>
  )
}
