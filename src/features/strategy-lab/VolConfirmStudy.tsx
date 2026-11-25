import React from 'react'
import { TableWrap } from '../../components/ui'
import data from './data/vol-confirm.json'
import { pct } from './LateCycleStudy'

function num(value: number | null | undefined, digits = 3): string {
  if (value == null || !Number.isFinite(value)) return '—'
  return value < 0 ? `−${Math.abs(value).toFixed(digits)}` : value.toFixed(digits)
}
const mark = (ok: boolean): string => (ok ? '✓' : '✗')

export default function VolConfirmStudy(): JSX.Element {
  const units = [{ key: 'U1', name: '美国 1959–1972（留出，叠加宏观档位）', ...data.U1 }, ...data.overseas]
  const cap = data.capTable['1973–2026']; const cap59 = data.capTable['1959–1972']
  return (
    <article className="ss-section lab-study" id="lab-vol-confirm" aria-labelledby="lab-vol-confirm-title" data-testid="lab-vol-confirm">
      <p className="lab-status">2026-11-25 · 已完成 · 确认检验「部分成立」 · 不纳入规则</p>
      <h2 id="lab-vol-confirm-title">降低波动：确认检验与决定</h2>

      <div className="ss-cover lab-answer" data-testid="lab-vol-confirm-answer">
        <p className="ss-cover__kicker">决定</p>
        <p className="ss-cover__summary">
          仓位规则维持宏观攻守 v2.2。要降低波动，最可靠的办法是把自己的股票上限调低：上限 80% 时，波动 {pct(cap['1'].vol)} → {pct(cap['0.8'].vol)}，按日最大回撤 {pct(cap['1'].dailyMaxDd)} → {pct(cap['0.8'].dailyMaxDd)}，年化少约 {((cap['1'].cagr - cap['0.8'].cagr) * 100).toFixed(1)} 个百分点，夏普不变。
        </p>
        <p className="ss-p">
          波动率目标（VT3）在规则没见过的数据里只是「部分成立」：海外 9 个指数里 {data.intlHolds} 个成立，美国 1959–1972 年不成立。它在动荡的市场里确实能少亏，但在平稳年代没有帮助，达不到「可靠」，不纳入规则。
        </p>
      </div>

      <div className="ss-cover lab-answer" data-testid="lab-decisions">
        <p className="ss-cover__kicker">三项决定（2026-11-25，用户授权代为决定）</p>
        <ol className="ss-list">
          <li><strong>「降低波动」以深度回撤为主</strong>，日常波动为辅。用户最初担心的是高位回落；日常波动已能靠上限机械压低。后续多资产检验以尾部（大跌时的损失）为主要判定维度。</li>
          <li><strong>美股上限取打算投入美股资金的 80%</strong>，其余放现金或短期国债。波动约 11% → 9%，历史按日最大回撤 −33% → −27%（较差情形约 −39% → −32%），年化少约 1 个百分点，夏普不变。已写入策略说明书 v1.1.0 第二章；能承受更大波动可以调高。</li>
          <li><strong>按「能持有债券和黄金」继续研究</strong>：美国与 A 股都有现成的国债 ETF、黄金 ETF。研究照常推进，实际是否买入由你自己决定。</li>
        </ol>
      </div>

      <h3 className="cs-subhead">确认检验怎么做（预注册，规则一个参数都没改）</h3>
      <p className="ss-p">
        只用上一项研究没用过的数据：美国 1959–1972 年（叠加当时的宏观档位）和 9 个海外指数（恒定 70% 仓位）。对照是「同样平均仓位、但不按波动调整」的版本。每个市场要同时做到三条才算成立：年化波动低 10% 以上、按日最大回撤浅 3 个百分点以上、扣成本夏普不低于对照 0.05 以上。事先写定：美国留出成立且海外至少 7 个成立才算「可靠」。
      </p>
      <TableWrap label="各市场的确认结果">
        <table className="cs-table" data-testid="lab-vol-confirm-table">
          <thead>
            <tr>
              <th scope="col">市场</th>
              <th scope="col" className="num">波动：对照 → VT3</th>
              <th scope="col" className="num">按日最大回撤：对照 → VT3</th>
              <th scope="col" className="num">夏普：对照 → VT3</th>
              <th scope="col" className="num">三条</th>
              <th scope="col">结果</th>
            </tr>
          </thead>
          <tbody>
            {units.map(u => (
              <tr key={u.key}>
                <th scope="row">{u.name}<span className="lab-rule">{u.first} 至 {u.last}</span></th>
                <td className="num">{pct(u.matched.vol)} → {pct(u.vt3.vol)}</td>
                <td className="num">{pct(u.matched.dailyMaxDd)} → {pct(u.vt3.dailyMaxDd)}</td>
                <td className="num">{num(u.matched.sharpeNet)} → {num(u.vt3.sharpeNet)}</td>
                <td className="num">{mark(u.pass.vol)}{mark(u.pass.dd)}{mark(u.pass.sharpe)}</td>
                <td>{u.holds ? '成立' : '不成立'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <ul className="ss-list">
        <li>美国 1959–1972 年三条都没做到：那段时期熊市较浅、波动不高，缩放很少起作用，夏普反而略降。和之前「宏观攻守在 1959–1972 年输给恒定七成」是同一个原因：这段历史不像 1973 年以后那样有剧烈的危机。</li>
        <li>海外成立的 6 个里，回撤改善很明显（纳斯达克 −51.8% → −31.5%，澳大利亚 −36.7% → −22.1%，罗素 2000 −35.6% → −24.5%）；富时 100、恒生回撤几乎没改善，上证波动只低 9%，差一点没到 10%。</li>
        <li>结论：波动率目标在动荡市场里有用，但不是在所有年代、所有市场都有用。按事先写定的标准，它只是「部分成立」。</li>
        <li>独立审稿另算了一遍，数字完全一致，并指出这个「部分成立」本身也很脆弱：海外 6 个成立里有 3 个是擦线通过（日经、澳大利亚的波动只低约 10.2%–10.8%，多伦多回撤只浅 3.2 个百分点）；日经改从 1980 年算就变成不成立。再翻两个，就会变成「不成立」。</li>
        <li>真正要用的写法（叠加在宏观档位上）在美国两段数据里都没达到「波动低 10%」：1973–2026 年低约 9%，1959–1972 年低约 3%。它主要是削减深度回撤（1973–2026 年按日最大回撤浅约 9 个百分点），不是降低日常波动。</li>
      </ul>

      <h3 className="cs-subhead">最可靠的降波动办法：调低上限（机械关系，不是择时）</h3>
      <TableWrap label="现行规则乘不同股票上限">
        <table className="cs-table" data-testid="lab-cap-table">
          <thead>
            <tr>
              <th scope="col">股票上限</th>
              <th scope="col" className="num">年化</th>
              <th scope="col" className="num">年化波动</th>
              <th scope="col" className="num">按日最大回撤</th>
              <th scope="col" className="num">回撤较差 5% 情形</th>
              <th scope="col" className="num">扣成本夏普</th>
              <th scope="col" className="num">1959–1972 波动 / 回撤</th>
            </tr>
          </thead>
          <tbody>
            {(['1', '0.8', '0.6'] as const).map(k => (
              <tr key={k} className={k === '0.8' ? 'is-highlight' : undefined}>
                <th scope="row">{Number(k) * 100}%</th>
                <td className="num">{pct(cap[k].cagr)}</td>
                <td className="num">{pct(cap[k].vol)}</td>
                <td className="num">{pct(cap[k].dailyMaxDd)}</td>
                <td className="num">{pct(data.capIntervals[k].dailyMaxDd.p5)}</td>
                <td className="num">{num(cap[k].sharpeNet)}</td>
                <td className="num">{pct(cap59[k].vol)} / {pct(cap59[k].dailyMaxDd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
      <ul className="ss-list">
        <li>「回撤较差 5% 情形」：把 1973 年以来的日收益按半年一块重新抽样 2,000 次，较差的 5% 路径里的最大回撤。历史只有一条路径，未来的最大回撤可能比表里的历史数字更深。</li>
        <li>调低上限会让波动和回撤按比例变小，夏普几乎不变，在 1973 年以后和 1959–1972 年都成立，不依赖任何择时判断，所以最可靠。代价也确定：收益按比例变少。</li>
        <li>在 1959–1972 年，上限 80% 的波动（{pct(cap59['0.8'].vol)}）和回撤（{pct(cap59['0.8'].dailyMaxDd)}）已经和波动率目标一样或更好。</li>
        <li>怎么用：宏观攻守的档位仓位乘你的上限。例如上限 80%、现在偏进攻 85%，股票占总资产约 68%。</li>
      </ul>

      <p className="ss-note" role="note">
        海外只有价格收益，现金收益记 0（两边相同）；Yahoo 数据未逐日与第二来源核对（日经 1972、1977 年有重复收盘，去掉后结论不变）；成本只计入夏普，波动、回撤、年化为扣费前；9 个指数彼此相关；美国留出只有约 13 年，并且之前看过一个相近写法在这段时期的结果。预注册、脚本与结果在 docs/research/vol-target-confirm-2026-11-25/。历史统计，不构成买卖建议。
      </p>
    </article>
  )
}
