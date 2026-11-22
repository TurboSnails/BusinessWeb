import React from 'react'
import { Link } from 'react-router-dom'
import { Page, TableWrap } from '../components/ui'
import { MASTERS } from '../features/macro-masters/masters'
import ReadingCell from '../features/macro-masters/ReadingCell'
import { READING_LABELS, READING_THEMES, useReadings } from '../features/macro-masters/readings'
import type { Master, ReadingKey } from '../features/macro-masters/types'
import '../styles/macro-masters.css'

export const MACRO_MASTERS_FOOTER =
  '整理自公开访谈、演讲与书信，原话注明出处；各人观点会变，读数只是本站数据的映射，不代表他们本人的判断，也不构成买卖建议。'

export const MACRO_MASTERS_LEAD =
  '这里并列几位宏观投资人看周期的思路与常用指标，供对照参考。不合成总分，也不给出买卖信号。'

function mastersFor(key: ReadingKey): Master[] {
  return MASTERS.filter(m => m.indicators.some(ind => ind.readings?.includes(key)))
}

export default function MacroMasters(): JSX.Element {
  const readings = useReadings()
  const loading = readings.state === 'loading'
  const map = readings.state === 'ok' ? readings.readings : {}

  return (
    <Page className="mm-overview">
      <header className="page-head mm-overview__head">
        <h1>宏观大师怎么看周期</h1>
        <p>{MACRO_MASTERS_LEAD}</p>
      </header>

      <section className="mm-overview__masters" aria-label="九位宏观大师">
        <ul className="mm-overview__cards">
          {MASTERS.map(master => (
            <li key={master.slug}>
              <Link to={`/invest/macro-masters/${master.slug}`} className="mm-overview__card">
                <span className="mm-overview__card-name">{master.name}</span>
                <span className="mm-overview__card-en">{master.nameEn}</span>
                <span className="mm-overview__card-line">{master.oneLiner}</span>
                <span className="mm-overview__card-tags">
                  {master.tags.map(tag => <span key={tag} className="mm-overview__tag">{tag}</span>)}
                  <span className="mm-overview__kind">{master.kind === 'quant' ? '偏定量' : '偏定性'}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="mm-overview__compare" aria-labelledby="mm-compare-title">
        <h2 id="mm-compare-title">指标对照</h2>
        <p className="mm-overview__compare-lead">按主题列出本站当前读数，以及哪几位大师的框架里会看它。</p>
        {readings.state === 'error' && (
          <p className="mm-overview__error" role="alert">读数加载失败：{readings.message}</p>
        )}
        <TableWrap label="指标对照表" stickyFirst className="mm-overview__table-wrap">
          <table className="ui-table mm-overview__table">
            <thead>
              <tr>
                <th scope="col">主题 / 指标</th>
                <th scope="col">本站读数</th>
                <th scope="col">关注的大师</th>
              </tr>
            </thead>
            {READING_THEMES.map(theme => (
              <tbody key={theme.id}>
                <tr className="mm-overview__theme">
                  <th scope="rowgroup" colSpan={3}>{theme.name}</th>
                </tr>
                {theme.keys.map(key => {
                  const watchers = mastersFor(key)
                  return (
                    <tr key={key}>
                      <th scope="row">{READING_LABELS[key]}</th>
                      <td>
                        <ReadingCell
                          reading={readings.state === 'ok' ? map[key] : undefined}
                          loading={loading}
                        />
                      </td>
                      <td>
                        {watchers.length
                          ? watchers.map(m => m.name).join('、')
                          : '本表未直接映射'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            ))}
          </table>
        </TableWrap>
      </section>

      <footer className="mm-overview__footer" role="note">
        <p>{MACRO_MASTERS_FOOTER}</p>
      </footer>
    </Page>
  )
}
