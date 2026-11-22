import React from 'react'
import { TableWrap } from '../../../components/ui'
import type { Episode, RunResult } from '../types'
import { returnClass, signedPercent } from './format'

function episodeDifference(result: RunResult, baseline: RunResult | undefined, episode: Episode): number | null {
  if (!baseline) return null
  const start = result.dates.indexOf(episode.enter)
  const endDate = episode.recover ?? result.end
  const end = result.dates.indexOf(endDate)
  const baseStart = baseline.dates.indexOf(episode.enter)
  const baseEnd = baseline.dates.indexOf(endDate)
  if (start < 0 || end < 0 || baseStart < 0 || baseEnd < 0 || end <= start || baseEnd <= baseStart) return null
  const activeReturn = result.equity[end] / result.equity[start] - 1
  const baseReturn = baseline.equity[baseEnd] / baseline.equity[baseStart] - 1
  return activeReturn - baseReturn
}

export function SwitchEpisodes({ result, baseline }: { result: RunResult; baseline?: RunResult }): JSX.Element | null {
  if (result.episodes.length === 0) return null
  return (
    <section className="pr-section" aria-labelledby="pr-episodes-title">
      <div className="pr-section__head"><h2 id="pr-episodes-title">逐轮大跌</h2><p>进入与恢复日期为信号日，实际成交在下一交易日；收益差为同段普通动态平衡的对照。</p></div>
      <TableWrap label="逐轮大跌" stickyFirst>
        <table className="ui-table pr-table">
          <thead><tr><th scope="col">进入日</th><th scope="col" className="num">切换步数</th><th scope="col">恢复日</th><th scope="col">退出方式</th><th scope="col" className="num">该轮收益差</th></tr></thead>
          <tbody>{result.episodes.map(episode => {
            const difference = episodeDifference(result, baseline, episode)
            return <tr key={`${episode.enter}-${episode.steps}`}>
              <th scope="row">{episode.enter}</th><td className="num">{episode.steps}</td><td>{episode.recover ?? '尚未恢复'}</td>
              <td>{episode.exit === 'recover' ? '恢复' : episode.exit === 'timeout' ? '超时恢复' : '进行中'}</td>
              <td className={`num ${difference === null ? '' : returnClass(difference)}`}>{difference === null ? '—' : signedPercent(difference)}</td>
            </tr>
          })}</tbody>
        </table>
      </TableWrap>
      <p className="pr-section__foot">该轮累计期末结果仍见核心指标；分段收益差仅用于定位规则影响。</p>
    </section>
  )
}
