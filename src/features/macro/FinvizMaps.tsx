import { ExternalLink } from 'lucide-react'

export const FINVIZ_MAP_LINKS = [
  {
    title: '标普 500',
    href: 'https://finviz.com/map?st=fpe',
    use: '按行业和细分行业分组，看美国大盘股的估值分布',
  },
  {
    title: '纳指 100',
    href: 'https://finviz.com/map?t=sec_ndx&st=fpe',
    use: '只看纳指 100 成分股，科技与成长股估值',
  },
  {
    title: '全球（在美上市的外国公司）',
    href: 'https://finviz.com/map?t=geo&st=fpe',
    use: '按国家分组，对比中概股、欧洲、日本等在美上市公司的估值',
  },
  {
    title: 'ETF',
    href: 'https://finviz.com/map?t=etf&st=fpe',
    use: '按资产类别分组，看主要 ETF 的整体估值',
  },
] as const

/** 美股个股远期市盈率热力图外链入口（Finviz，无法嵌入） */
export default function FinvizMaps(): JSX.Element {
  return (
    <section className="macro-card" aria-labelledby="finviz-maps-title">
      <h3 id="finviz-maps-title">美股个股估值热力图（Finviz）</h3>
      <p>
        每个方块是一只股票，面积代表市值，颜色代表远期市盈率（股价 ÷ 未来 12 个月预期每股收益）。一眼看出哪些行业、哪些公司更贵或更便宜。
      </p>
      <ul className="macro-finviz-grid">
        {FINVIZ_MAP_LINKS.map(item => (
          <li key={item.href}>
            <a
              className="macro-finviz-link"
              href={item.href}
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="macro-finviz-link__title">
                {item.title}
                <ExternalLink size={14} aria-hidden="true" />
              </span>
              <span className="macro-finviz-link__use">{item.use}</span>
            </a>
          </li>
        ))}
      </ul>
      <p className="macro-muted">
        外部网站，无法嵌入本站，需新窗口打开。亏损或没有盈利预期的公司没有远期市盈率。本页表格里指数的 Forward PE 是成分股按市值加权的调和平均，与热力图逐只公司看的口径不同，两者互补。
      </p>
    </section>
  )
}
