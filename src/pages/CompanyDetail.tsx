import React, { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react'
import { useCompanies, useLynch, Market } from '../data/companies'
import { usePageSeo } from '../components/RouteSeo'
import ResearchNotice from '../components/research/ResearchNotice'
import { toneOf, Tone } from '../data/notionNotes'
import { CN_REPORT } from '../data/cnReassessment'
import { SP500_REPORT } from '../data/sp500Reassessment'
import CandidateButton from '../components/CandidateButton'
import { useCandidates } from '../features/candidates/useCandidates'
import { priceAnchorAge } from '../features/dcf/priceAnchor'
import { buildDcfLink } from '../features/dcf'
import { Badge, Card, EmptyState, Page, Stat, StatGrid, TableWrap } from '../components/ui'
import { PageDataFreshness } from '../components/ui/PageDataFreshness'
import '../styles/research.css'

// 评级语气的文字色：只用色板 token
const TONE_INK: Record<Tone, string> = {
  green: 'var(--down-ink)',
  blue: 'var(--accent-ink)',
  orange: 'var(--warm-ink)',
  red: 'var(--up-ink)',
  gray: 'var(--text-secondary)',
}

export default function CompanyDetail(): JSX.Element {
  const { market, code } = useParams()
  const navigate = useNavigate()
  const mk = (market === 'cn' ? 'cn' : market === 'hk' ? 'hk' : market === 'adr' ? 'adr' : market === 'ndx' ? 'ndx' : 'us') as Market
  const { list, loading } = useCompanies(mk)
  const lynchAll = useLynch()
  const company = list.find(c => c.code === decodeURIComponent(code || ''))
  const cand = useCandidates(true)
  usePageSeo(company ? `${company.name}（${company.code}）研究笔记` : undefined, company ? `${company.name}（${company.code}）：${company.headline}`.slice(0, 160) : undefined)

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [market, code])

  const row = (text: string, accent: string, key: number, warn = false): JSX.Element => (
    <div key={key} className="rn-check">
      {warn ? <AlertTriangle size={16} color={accent} aria-hidden="true" /> : <CheckCircle2 size={16} color={accent} aria-hidden="true" />}
      <span>{text}</span>
    </div>
  )

  const DataTable = ({ label, heads, rows }: { label: string; heads?: string[]; rows: React.ReactNode[][] }): JSX.Element => (
    <TableWrap label={label}>
      <table className="ui-table rn-table rn-table--top">
        {heads && <thead><tr>{heads.map(h => <th key={h} scope="col">{h}</th>)}</tr></thead>}
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </TableWrap>
  )

  const back = (
    <Link
      to={`/research-notes?tab=companies&m=${mk}`}
      onClick={e => {
        // 有站内历史就原路返回（保留页签、市场、板块和滚动位置）
        if (window.history.state && window.history.state.idx > 0) {
          e.preventDefault()
          navigate(-1)
        }
      }}
      className="rn-back"
    >
      <ArrowLeft size={14} aria-hidden="true" /> 返回公司研究
    </Link>
  )

  if (!company) {
    return (
      <Page variant="reading" title={loading ? '公司研究' : '未找到该公司'}>
        {back}
        <EmptyState title={loading ? '正在加载…' : '未找到该公司'}>
          {loading ? '正在读取补全公司数据。' : '该公司还没有整理进公司库。'}
        </EmptyState>
      </Page>
    )
  }

  const tone = toneOf(company.rating)

  // ── 按“最终返回标准”整理：三情景表、买入纪律、完整度 ──
  const nums = (t: string): number[] => (t.match(/[\d,]+(?:\.\d+)?/g) || []).map(x => Number(x.replace(/,/g, ''))).filter(n => !Number.isNaN(n))
  // 存档仍显示在指标表，但不能自动回填已经撤回的情景与纪律。
  const activeMetrics = company.metrics.filter(([label]) => !label.startsWith('上轮'))
  const metric = (re: RegExp): string | undefined => activeMetrics.find(([l]) => re.test(l))?.[1]
  const priceText = metric(/价格锚点|收盘价|现价|9\/18 收盘/)
  const price = company.marketRefresh?.tradability === 'unverified' ? undefined : priceText ? nums(priceText)[0] : undefined
  const priceAge = priceAnchorAge(priceText)
  const scenText = metric(/Bear \/ Base \/ Bull/)
  const scenNums = scenText && !/市值/.test(scenText) ? nums(scenText) : []
  const scenRows: [string, string, string, string][] | null = scenNums.length === 3
    ? (['悲观', '基准', '乐观'] as const).map((n, i) => {
        const v = scenNums[i]
        const pct = price && v > price * 0.1 && v < price * 10 ? `${v >= price ? '+' : ''}${((v / price - 1) * 100).toFixed(1)}%` : '—'
        const trigger = n === '悲观' ? '盈利下修或估值压缩' : n === '基准' ? '正常兑现路径' : '增长/利润率超预期'
        return [n, v.toLocaleString(), pct, trigger] as [string, string, string, string]
      })
    : null
  const pool = [...company.next, ...company.thesis, ...company.risk, ...activeMetrics.map(([l, v]) => `${l}：${v}`)]
  const pick = (re: RegExp): string | undefined => pool.find(t => re.test(t))
  const dz = company.discipline
  const discipline: [string, string | undefined][] = [
    ['条件价格（研究假设）', dz?.zone || pick(/买入区|买入观察|观察买入|买入区间|首次关注|重仓区|核心买入/)],
    ['加仓条件（研究假设）', dz?.add || pick(/确认加仓|加仓|突破|确认.{0,6}(后|才)/)],
    ['减仓 / 止盈', dz?.trim || pick(/减仓|止盈|兑现|卖出区|首减/)],
    ['失效条件', dz?.invalid || company.risk.find(t => /证伪|失效|跌破|连续|低于|恶化/.test(t)) || company.risk[0]],
    ['仓位原则', dz?.position || pick(/仓位|建议仓位|不超过|上限/)],
  ]
  // 缺项时按研究标准补默认条款，并明确标注（不冒充公司专属结论）
  const bullPrice = company.scenarios?.find(x => x.name === '乐观' || x.name === '牛市')?.price || (scenRows ? `${scenRows[2][1]}` : undefined)
  const std = '（按研究标准默认条款）'
  if (!discipline[2][1]) discipline[2][1] = `${bullPrice ? `接近乐观情景价 ${bullPrice}，` : ''}或盈利预期不再改善、赔率变差时分批处理${std}`
  if (!discipline[4][1] && /观察|回避|暂不|等待|不追|谨慎/.test(company.rating)) discipline[4][1] = `赔率未达约 2:1，按研究标准只放观察名单，不建仓${std}`
  const disciplineFilled = discipline.filter(d => d[1]).length
  const completeness: [string, boolean][] = [
    ['公司简介', !!company.profile],
    ['业务分布', !!company.segments],
    ['优缺点', !!company.pros && !!company.cons],
    ['行业趋势', !!company.industry],
    ['结论卡', !!company.rating && !!company.headline],
    ['关键指标', company.metrics.length > 0],
    ['增长与护城河', company.thesis.length > 0 && (!!company.moat || company.thesis.length >= 3)],
    ['三情景表', !!scenRows || !!company.scenarios],
    ['买入纪律', disciplineFilled >= 3],
    ['风险与证伪', company.risk.length > 0],
    ['多空交锋', !!company.bullBear],
    ['口径说明', !!company.asOf],
    ['验证日历', company.next.length > 0 || !!company.calendar],
  ]
  const done = completeness.filter(c => c[1]).length
  const pending = (label: string): JSX.Element => (
    <span className="rn-pending">待补充{label}（可在 Notion 原页查看）</span>
  )

  return (
    <Page variant="reading" className="rn-page">
      {/* 页面头部 */}
      <div className="page-hero">
        <div className="rn-hero-links">
          {back}
          <Link to={`/valuation?market=${mk === 'adr' || mk === 'ndx' ? 'us' : mk}&code=${encodeURIComponent(company.code)}`}>建立估值模型 →</Link>
          <Link to={buildDcfLink({ company: company.name, code: company.code, researchMarket: mk, price })}>用当前价格测算 DCF →</Link>
          <Link to={`/research-notes/company/${mk}/${encodeURIComponent(company.code)}/notes`}>研究笔记 →</Link>
        </div>
        <h1 className="rn-hero-title">{company.name}</h1>
        <p className="rn-hero-meta">
          {company.market === 'us' ? '标普500' : company.market === 'hk' ? '港股' : company.market === 'adr' ? '美股非标普' : company.market === 'ndx' ? '纳指100' : '沪深'} · {company.code} · {company.sector} · {company.batch}
        </p>
        {company.marketRefresh && <PageDataFreshness checkedAt={company.marketRefresh.checkedAt} dataLabel="行情日期" dataDates={[company.marketRefresh.priceDate]} researchAsOf={company.marketRefresh.originalAsOf} />}
        <div className="ui-cluster">
          <span className="rn-rating" style={{ color: TONE_INK[tone] }}>{company.rating}</span>
          <CandidateButton on={cand.items.some(i => i.market === company.market && i.code === company.code)} onClick={() => cand.toggle(company.market, company.code)} />
        </div>
        {priceAge && (
          <p role="status" className={priceAge.stale ? 'rn-price-age is-stale' : 'rn-price-age'}>
            价格锚点 {priceAge.date}（{priceAge.days === 0 ? '今天' : `${priceAge.days} 天前`}）
            {priceAge.stale && '：盈亏比与买入价按这个价格算，重新取价后再用'}
          </p>
        )}
      </div>

      <div>
        <ResearchNotice />
        {(company.market === 'us' || company.market === 'cn' || company.market === 'hk' || company.market === 'adr') && (company.researchReport || company.metrics.some(([key]) => key === '圆桌复核日期')) && (
          <Card title={company.researchReport ? '公司研究 · 本轮事实复核与估值初稿' : '腾讯自选股投研专家团 · 本轮公告复核'}>
            <p className="rn-text">{(company.market === 'hk' || company.market === 'adr') && company.researchReport ? '已逐家核读公司业绩原件并补充新行情，报告列明来源、旧结论修正及待补证据。部分公司有数值敏感性草案；两种独立估值、现金与股本桥接仍待补，旧评级和价位不作为当前结论。' : company.researchReport ? '已按公司核对财报与现金流，完整报告列明来源、旧结论调整及待补证据。估值假设尚未认证；林奇分类仍为此前的程序化筛选结果。' : '本轮已补充公司公告；证据分为公告原件、公告转载及待核实；旧情景价值的认证状态以本轮结论为准。“上轮”指标保留历史口径，林奇分类仍为此前的程序化筛选结果。'}</p>
            <a href={`${import.meta.env.BASE_URL}${company.researchReport ?? (company.market === 'cn' ? CN_REPORT : SP500_REPORT)}`} target="_blank" rel="noreferrer" className="rn-link">查看本轮完整报告与一手来源</a>
          </Card>
        )}
        {(() => {
          const ly = lynchAll[`${company.market}:${company.code}`]
          if (!ly || ((company.market === 'hk' || company.market === 'adr') && company.researchReport)) return null
          const cls = ly.r === '高' ? 'rn-card--good' : ly.r === '中' ? 'rn-card--lead' : undefined
          return (
            <Card className={cls} title={<>林奇分类：{ly.t}（同类关注度 {ly.r}）{ly.m ? ` · ${ly.m.l}` : ''}</>}>
              <p className="rn-text">{[...ly.w, ly.v].filter(Boolean).join('；')}</p>
              <p className="rn-footnote rn-footnote--top">
                {ly.pe ? `PE ${ly.pe}×` : 'PE 不适用'}{ly.g !== null && ly.g !== undefined ? ` · 利润近一年 ${ly.g > 0 ? '+' : ''}${ly.g}%` : ''}{ly.c !== null && ly.c !== undefined ? `（两年年化 ${ly.c > 0 ? '+' : ''}${ly.c}%）` : ''}{ly.peg ? ` · PEG ${ly.peg}` : ''}{ly.ph ? ` · 周期位置：${ly.ph}` : ''}{ly.dy !== null && ly.dy !== undefined ? ` · 股息率 ${ly.dy}%` : ''}
              </p>
              {ly.f.map(x => <p key={x} className="rn-warn-text">⚠ {x}</p>)}
              {ly.m && (
                <>
                  <TableWrap label="护城河财务证据" className="rn-gap">
                    <table className="ui-table rn-table rn-moat">
                      <tbody>
                        {ly.m.i.map(([name, ok, note]) => (
                          <tr key={name}>
                            <td>{name}</td>
                            <td>{ok === null ? '—' : ok ? '✓' : '✗'}</td>
                            <td>{note}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableWrap>
                  <p className="rn-footnote">护城河只看财务证据（{ly.m.s}/{ly.m.n} 项通过）：它检验品牌、网络效应、转换成本等通常留下的痕迹，不能证明护城河本身；无 FCF/股息（A 股、美股）。规则见「研究笔记 → 分类数据 → 林奇分组」。</p>
                </>
              )}
            </Card>
          )
        })()}
        {company.auto && (
          <Card className="rn-card--warn" title={company.reviewed ? '程序化研究页（已人工复核）' : '程序化研究页'}>
            <p className="rn-text">{company.metrics.some(([key]) => key === '圆桌复核日期') ? '本页源自程序化补全；本轮圆桌已另行核实公告并更正结论，旧模型已暂停认证。旧数值存档不等于逐项一手财务验证，分部占比、正常化估值与完整现金流仍需补齐。' : <>本页的财务数值、估值、三情景与买入区由脚本按统一规则计算（规则见「研究笔记 → 研究标准」），业务描述与行业判断为简述；{company.reviewed ? '已用最新半年报/指引人工复核评级与关键风险（见指标表「人工复核」行），但情景数值仍是脚本结果；' : ''}不含公司特有催化与风险，一手公告、分部占比、一致预期、自由现金流均未取到。结论用于筛选与排序，深度判断需回到公司公告。</>}</p>
          </Card>
        )}
        <Card title="公司简介与业务分布">
          {company.profile ? <p className="rn-text">{company.profile}</p> : <p className="rn-text">{pending('公司简介')}</p>}
          {company.segments
            ? <DataTable label="业务分布" heads={['业务 / 分部', '占比', '说明']} rows={company.segments.map(r => [r.name, <span className="rn-nowrap">{r.share || '—'}</span>, r.note || ''])} />
            : pending('业务分布')}
        </Card>

        <Card title="优势与缺点">
          {company.pros || company.cons ? (
            <>
              <p className="rn-eyebrow">优势</p>
              {(company.pros || []).map((t, i) => row(t, 'var(--down)', i))}
              <p className="rn-eyebrow rn-gap">缺点</p>
              {(company.cons || []).map((t, i) => row(t, 'var(--up)', i, true))}
            </>
          ) : pending('优缺点')}
        </Card>

        <Card title="行业趋势">
          {company.industry ? company.industry.map((t, i) => row(t, 'var(--accent)', i)) : pending('行业趋势')}
          {company.industry && <p className="rn-footnote">行业趋势含研究者判断，需随最新数据更新。</p>}
        </Card>

        <Card className="rn-card--lead">
          <p className="rn-lead">{company.headline}</p>
          {(company.certainty || company.duration || company.ratioNote) && (
            <div className="rn-facts">
              {company.certainty && <div><strong className="rn-strong">确定性：</strong>{company.certainty}</div>}
              {company.duration && <div><strong className="rn-strong">增长可持续期限：</strong>{company.duration}</div>}
              {company.ratioNote && <div><strong className="rn-strong">盈亏比：</strong>{company.ratioNote}</div>}
            </div>
          )}
          <div className="rn-badges" aria-label={`最终返回标准完整度 ${done}/${completeness.length}`}>
            <span className="rn-inline-label">最终返回标准完整度 {done}/{completeness.length}</span>
            {completeness.map(([n, ok]) => (
              <span key={n} className={ok ? 'rn-pill is-done' : 'rn-pill'}>{ok ? '✓' : '○'} {n}</span>
            ))}
          </div>
        </Card>

        {company.metrics.length > 0 && (
          <>
            <p className="rn-eyebrow">关键指标</p>
            <StatGrid className="rn-stat-grid rn-stat-grid--metrics rn-card">
              {company.metrics.map(([label, value]) => <Stat key={label} label={label} value={value} />)}
            </StatGrid>
          </>
        )}

        <Card title="增长与护城河 / 核心逻辑">
          {company.thesis.length > 0 ? company.thesis.map((t, i) => row(t, 'var(--down)', i)) : pending('')}
          {company.growth && (
            <>
              <p className="rn-eyebrow rn-gap">增长来源与持续性</p>
              {company.growth.map((t, i) => row(t, 'var(--accent)', i))}
            </>
          )}
          {company.moat && (
            <>
              <p className="rn-eyebrow rn-gap">护城河</p>
              {company.moat.map((t, i) => row(t, 'var(--system-teal)', i))}
            </>
          )}
        </Card>

        <Card title="三情景估值">
          {company.scenarios ? (
            <DataTable label="三情景估值" heads={['情景（概率）', '盈利与倍数假设', '隐含价', '相对现价', '触发 / 证伪']}
              rows={company.scenarios.map(r => [
                <span className="rn-nowrap">{r.name}{r.prob ? `（${r.prob}）` : ''}</span>,
                <span className="rn-cell-wide">{r.assumption}{r.multiple ? `；倍数 ${r.multiple}` : ''}</span>,
                <strong className="rn-strong rn-nowrap">{r.price}</strong>,
                <span className="rn-nowrap">{r.change}</span>,
                <span className="rn-small-metrics">{r.trigger}</span>,
              ])} />
          ) : scenRows ? (
            <DataTable label="三情景估值" heads={['情景', '隐含价', '相对价格锚点', '触发 / 证伪方向']} rows={scenRows} />
          ) : (
            scenText ? <p className="rn-text">{scenText}</p> : pending('三情景估值表')
          )}
          <p className="rn-footnote">情景价 = 正常化 EPS × 合理倍数，为研究假设，不是目标价；概率与期望收益如有，也不是历史回测胜率。</p>
        </Card>

        <Card title="结论与买入纪律">
          <DataTable label="买入纪律" rows={discipline.map(([label, text]) => [<span className="rn-nowrap">{label}</span>, text || pending('')])} />
          <p className="rn-footnote">价位均为条件化研究区间，不是交易指令；未列出的项按“最终返回标准”尚待补充。</p>
        </Card>

        <Card title="风险与证伪">
          {company.risk.length > 0 ? company.risk.map((t, i) => row(t, 'var(--accent-warm)', i, true)) : pending('')}
        </Card>

        <Card title="多空交锋">
          {company.bullBear ? (
            <>
              <div className="rn-bullbear">
                <Badge tone="down">多头最强论点</Badge>
                <p>{company.bullBear.bull}</p>
              </div>
              <div className="rn-bullbear">
                <Badge tone="up">空头最强论点</Badge>
                <p>{company.bullBear.bear}</p>
              </div>
              <div className="rn-bullbear">
                <Badge tone="accent">裁决</Badge>
                <p>{company.bullBear.verdict}</p>
              </div>
              <p className="rn-footnote">整理自研究页内容，不是独立的多空对抗检验。</p>
            </>
          ) : pending('（本页未做多空对抗检验）')}
        </Card>

        <Card title="后续验证 / 操作参考">
          {(company.next.length > 0 || company.calendar) ? [...company.next, ...(company.calendar || [])].map((t, i) => (
            <div key={i} className="rn-check">
              <ArrowRight size={16} color="var(--accent)" aria-hidden="true" />
              <span>{t}</span>
            </div>
          )) : pending('')}
        </Card>

        {(company.pitfalls || company.aiNote) && (
          <Card title="口径与陷阱">
            {(company.pitfalls || []).map((t, i) => row(t, 'var(--accent-warm)', i, true))}
            {company.aiNote && row(`AI 的位置：${company.aiNote}`, 'var(--accent)', 99)}
          </Card>
        )}

        <Card title="数据口径">
          <p className="rn-text">{company.asOf}</p>
          {company.url && (
            <a href={company.url} target="_blank" rel="noreferrer" className="rn-back">
              <ExternalLink size={14} aria-hidden="true" /> 在 Notion 查看完整研究页
            </a>
          )}
        </Card>

        <p className="rn-disclaimer">
          内容整理自 Notion 个人研究笔记，仅为研究记录，不构成投资建议。情景价值与价位为研究假设，非目标价。
        </p>
      </div>
    </Page>
  )
}
