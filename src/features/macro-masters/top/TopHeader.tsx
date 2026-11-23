import React from 'react'
import { Link } from 'react-router-dom'
import { REMOVED, TOP_CRITERIA } from '../top'

export const TOP_MASTERS_SORT_NOTE =
  '排序按综合水平：长期业绩 × 持续时间 × 风险控制。'

export default function TopHeader(): JSX.Element {
  return (
    <header className="page-head tm-head">
      <h1>六位顶级投资人怎么看周期</h1>
      <p>
        {TOP_CRITERIA}
        {' '}
        {TOP_MASTERS_SORT_NOTE}
      </p>
      <details className="tm-removed">
        <summary>为什么去掉三位</summary>
        <ul>
          {REMOVED.map(item => (
            <li key={item.name}>
              <strong>{item.name}</strong>
              ：
              {item.reason}
            </li>
          ))}
        </ul>
      </details>
      <p>
        <Link to="/invest/macro-masters">查看九位完整版</Link>
      </p>
    </header>
  )
}
