import React from 'react'
import { Link } from 'react-router-dom'
import { masterBySlug } from '../masters'
import type { TopMaster } from '../top'
import { roleDivisions } from './consensus'

export const TOP_MASTERS_DISCLAIMER =
  '业绩来自公开报道、未经统一审计；读数为本站映射，不代表他们本人此刻的判断；以上内容不构成买卖建议。'

export default function TopFooter({ masters }: { masters: readonly TopMaster[] }): JSX.Element {
  const divisions = roleDivisions(masters, slug => masterBySlug(slug)?.name ?? slug)

  return (
    <footer className="tm-footer" role="contentinfo">
      {masters.length > 0 && (
        <section className="tm-footer__roles" aria-labelledby="tm-roles-title">
          <h2 id="tm-roles-title">六位的分工小结</h2>
          {divisions.length === 0 ? (
            <p className="tm-muted">角色描述里尚未标注流动性 / 信用 / 趋势 / 估值 / 选股关键词。</p>
          ) : (
            <ul>
              {divisions.map(row => (
                <li key={row.dimension}>
                  <strong>{row.dimension}</strong>
                  ：看
                  {row.names.join('、')}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <p>
        他们的思路在本站回测中的检验见
        <Link to="/invest/macro-posture#mp-candidates">宏观攻守的候选指标检验</Link>
        。
      </p>
      <p className="tm-footer__disclaimer">{TOP_MASTERS_DISCLAIMER}</p>
    </footer>
  )
}
