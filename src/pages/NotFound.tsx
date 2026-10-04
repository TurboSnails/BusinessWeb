import React from 'react'
import { Link } from 'react-router-dom'

export default function NotFound(): JSX.Element {
  return (
    <main className="container animate-fade-in">
      <header className="page-head">
        <h1>这一页不存在</h1>
        <p>链接可能写错了，或者这一页已经搬家。</p>
      </header>
      <div className="hero__actions" style={{ justifyContent: 'flex-start' }}>
        <Link to="/" className="btn-primary">回到首页</Link>
        <Link to="/first-book" className="btn-ghost">去看《正念投资》</Link>
      </div>
    </main>
  )
}
