import React from 'react'
import { TableWrap } from '../../components/ui'
import { MASTERS } from './masters'

export default function OverviewTrack(): JSX.Element {
  return (
    <section className="mm-overview__track" aria-labelledby="mm-track-title">
      <h2 id="mm-track-title">这九位靠不靠谱</h2>
      <p className="mm-overview__section-lead">
        不打分、不排名。只列能不能检验、适合回答什么问题，以及公开记录里的失误。
      </p>
      <TableWrap label="可靠性对照表" className="mm-overview__track-wrap">
        <table className="ui-table mm-overview__track-table">
          <thead>
            <tr>
              <th scope="col">大师</th>
              <th scope="col">能不能检验</th>
              <th scope="col">适合回答</th>
              <th scope="col">不适合回答</th>
              <th scope="col">公开失误</th>
            </tr>
          </thead>
          <tbody>
            {MASTERS.map(master => (
              <tr key={master.slug}>
                <th scope="row">{master.name}</th>
                <td>{master.track.testability}</td>
                <td>{master.track.bestFor}</td>
                <td>{master.track.notFor}</td>
                <td>{master.track.misses}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <ul className="mm-overview__track-cards" aria-label="可靠性对照（窄屏）">
        {MASTERS.map(master => (
          <li key={master.slug} className="mm-overview__track-card">
            <details className="mm-overview__track-fold">
              <summary>
                <span className="mm-overview__track-card-name">{master.name}</span>
                <span className="mm-overview__track-card-best">{master.track.bestFor}</span>
              </summary>
              <div className="mm-overview__track-fold-body">
                <p><span className="mm-overview__track-label">能不能检验</span>{master.track.testability}</p>
                <p><span className="mm-overview__track-label">不适合回答</span>{master.track.notFor}</p>
                <p><span className="mm-overview__track-label">公开失误</span>{master.track.misses}</p>
              </div>
            </details>
          </li>
        ))}
      </ul>
    </section>
  )
}
