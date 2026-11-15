// 另一个开源项目三套 ETF 规则的样本外检验结论（静态研究事实，2026-11-15）。
// 来源：docs/research/2026-11-15-friend-etf-strategies-oos.md；数字为 76 只 ETF 等权平均，超额 = 策略年化 − 一直持有年化（百分点）。

export const OOS_ASOF = '2026-11-15'
export const OOS_DOC = 'https://github.com/TurboSnails/BusinessWeb/blob/main/docs/research/2026-11-15-friend-etf-strategies-oos.md'
export const LONG_DOC = 'https://github.com/TurboSnails/BusinessWeb/blob/main/docs/research/etf-timing-long-history.md'
export const SCRIPTS = 'https://github.com/TurboSnails/BusinessWeb/tree/main/scripts/research/etf-strategy-oos'

export type OosRow = { label: string; values: [string, string, string] }
export const OOS_SPLITS: [string, string, string] = ['2023-01 起', '2024-01 起', '2024-07 起']
export const OOS_ROWS: OosRow[] = [
  { label: 'MACD 优选名单（切分前按原标准挑选）超额', values: ['+0.5（4/8 跑赢）', '+0.6（4/7）', '+0.3（7/13）'] },
  { label: 'MACD 全部 ETF 超额', values: ['−0.1', '−0.9', '−3.1'] },
  { label: '20 日线基准 全部 ETF 超额', values: ['−0.5', '−0.4', '−2.7'] },
  { label: '择时＋只认金叉（沪深300 比值）全部 ETF 超额', values: ['+3.6（52/76）', '+1.7（47/76）', '+2.1（42/76）'] },
  { label: '择时＋只认金叉（创业板 比值）全部 ETF 超额', values: ['+3.9（53/76）', '+2.3（44/76）', '+2.1（40/76）'] },
  { label: '平均最大回撤：择时 / 一直持有', values: ['−22% / −42%', '−20% / −39%', '−19% / −39%'] },
]

export const OOS_VERDICTS: Array<{ title: string; tone: 'danger' | 'warn' | 'ok'; text: string }> = [
  { title: '「MACD 优秀」名单：不采用', tone: 'danger', text: '按切分点之前的数据、用同样标准挑选并冻结名单，样本外超额只有 +0.3～+0.6 个百分点，跑赢一直持有的约一半，接近抛硬币。' },
  { title: '「沪深300 择时优选」：不采用', tone: 'danger', text: '沪深300 比值与创业板比值择时，样本外几乎没有差别；逐只挑「哪种择时更好」是噪音。' },
  { title: '「择时＋只认金叉」规则本身：观察中', tone: 'warn', text: '不挑品种、用于全部 ETF，样本外收益与一直持有持平或略高，最大回撤约减半；2011 年起指数检验只部分通过（见下）。' },
]
