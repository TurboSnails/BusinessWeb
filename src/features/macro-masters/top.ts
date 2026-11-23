// 「六位顶级投资人怎么看周期」精选页数据（manager 定类型；内容由研究任务填写并附来源）
// 入选标准：可核对的 20 年以上顶尖业绩，且管理过大规模资金。
// 方法、指标、当前读数与按其方法的判断复用 masters.ts / readings.ts / cycleView.ts，这里只放精选页额外需要的内容。
import type { Master } from './types'

export type TopSource = { label: string; url: string }

export type TopMaster = {
  slug: Extract<Master['slug'], 'druckenmiller' | 'soros' | 'templeton' | 'tudor-jones' | 'dalio' | 'marks'>
  /** 综合水平名次（1 = 最高） */
  rank: number
  /** 一句话定位，如「宏观交易：流动性、信用与趋势」 */
  role: string
  record: {
    /** 业绩摘要，如「杜肯资本 1981–2010 年据报道年化约 30%，未出现亏损年度」；拿不准的写定性描述 */
    summary: string
    /** 口径提醒，如「基金自报，未经统一审计」 */
    caveat: string
    sources: TopSource[]
  }
  /** 他怎么看周期（2–3 句，大白话） */
  cycleView: string
  /** 代表性的成功判断（1–3 条，带年份） */
  wins: string[]
  /** 普通股票投资者能学的（3–5 条，可执行） */
  learn: string[]
  /** 不要模仿的（1–3 条） */
  avoid: string[]
  /** 推荐材料（书、公开备忘录、访谈；中文版书名优先） */
  resources: { title: string; note: string; url?: string }[]
}

export const TOP_CRITERIA = '入选标准：有可核对的 20 年以上顶尖业绩，且管理过大规模资金。'

export const REMOVED: { name: string; reason: string }[] = [
  { name: '马丁·茨威格', reason: '规则清晰、可回测，但业绩规模与持续时间达不到入选线；其趋势纪律已由都铎·琼斯的 200 日线覆盖。' },
  { name: '杰里米·格兰瑟姆', reason: '长期估值判断有参考价值，但收益不突出，泡沫判断常早数年。' },
  { name: '安德烈·科斯托拉尼', reason: '投资心理写作有影响力，但没有可核对的业绩记录。' },
]

/** 研究任务填写；按 rank 升序 */
export const TOP_MASTERS: readonly TopMaster[] = [
  {
    slug: 'druckenmiller',
    rank: 1,
    role: '宏观交易：流动性、信用与趋势',
    record: {
      summary:
        '1980 年创立杜肯资本。据彭博 2010 年报道，杜肯 1986 年起年均回报约 30%，到 2010 年宣布关闭时从未出现亏损年度；2008 年约 +11%，同年对冲基金平均亏 19%。1988 年底到 2000 年他还担任索罗斯量子基金的首席策略师。',
      caveat:
        '媒体转述的基金自报数字，未经统一审计，也没有说明是否扣除费用；宣布关闭时 2010 年仍亏约 5%，全年最终结果未见权威披露。',
      sources: [
        {
          label: '彭博（InvestmentNews 转载）：德鲁肯米勒关闭杜肯资本，2010-09-28',
          url: 'https://www.investmentnews.com/alternatives/stanley-druckenmiller-closing-up-shop/30897',
        },
        {
          label: '德鲁肯米勒 2015 年 Lost Tree 俱乐部演讲文字稿（回顾 2005–2008 年判断）',
          url: 'https://gist.github.com/timhwang21/e6a2b24e064182dd9099ad00e4f4f9a6',
        },
      ],
    },
    cycleView:
      '他认为推动整体股市的主要是央行和流动性，而不是眼下的盈利，所以要想象 18–24 个月后的局面，盯利率方向、信用利差这些变量的变化。比起指数本身，他更看重市场内部：领先行业和涨跌家数先转弱，往往比经济数据更早报警。',
    wins: [
      '1992 年：判断英国在经济疲弱时守不住欧洲汇率机制，在量子基金主导做空英镑，据报道为基金赚了约 10 亿美元；英国于 9 月 16 日退出该机制。',
      '2005–2008 年：他回忆 2005 年中就判断过松的货币政策会以房地产崩盘收场，2006 年因为偏早回报一般，2007–2008 年获利；2008 年杜肯约 +11%，同期对冲基金平均亏 19%。',
    ],
    learn: [
      '买入时写下认错条件，理由被证伪就先减仓，不等回本。',
      '每月看一次央行利率方向和信用利差：从降息转向加息、利差持续走阔，就把股票仓位上限调低一档。',
      '除了看大盘，也看小盘股相对大盘、可选消费相对必需消费的强弱；领先板块先转弱时提高警惕。',
      '想清楚一年半到两年后的局面再下判断，不只盯本季度的财报和新闻。',
      '把仓位和把握程度挂钩：没把握时少做、先保本，证据充分时才加仓。',
    ],
    avoid: [
      '高杠杆、集中重仓和外汇宏观交易：他能这样做，靠的是职业团队、流动性极好的市场和很快的止损。',
      '情绪化追高：2000 年他明知科技股接近顶部仍追买，亏损约 30 亿美元。',
    ],
    resources: [
      { title: '《新金融怪杰》', note: '施瓦格的交易员访谈录，有中文版；德鲁肯米勒一章讲流动性、仓位与认错。' },
      {
        title: '2015 年 Lost Tree 俱乐部演讲',
        note: '英文文字稿，免费；回顾他如何用货币政策和信用判断 2008 年危机。',
        url: 'https://gist.github.com/timhwang21/e6a2b24e064182dd9099ad00e4f4f9a6',
      },
      {
        title: '摩根士丹利《Hard Lessons》访谈（2026）',
        note: '英文视频，免费；谈投资生涯中的错误与教训。',
        url: 'https://www.morganstanley.com/insights/videos/hard-lessons/duquesne-stan-druckenmiller-iliana-bouzali',
      },
    ],
  },
  {
    slug: 'soros',
    rank: 2,
    role: '反身性：信用扩张与趋势检验',
    record: {
      summary:
        '据彭博 2011 年报道，量子基金自 1969 年前身成立以来平均每年回报约 20%。同篇报道提到，2000 年核心交易员离开后，索罗斯表示愿意接受约 15% 的年化回报，“约为基金成立以来水平的一半”，按此推算 1969–2000 年约为 30%。1988 年底到 2000 年，日常操盘主要由德鲁肯米勒负责。',
      caveat:
        '约 20% 来自知情人士，约 30% 是由本人表述推算，都没有公开经审计的逐年数据；2000 年后基金逐步只管理家族和基金会的钱，2011 年退还外部资金，后期业绩无法公开比较。',
      sources: [
        {
          label: '彭博（InvestmentNews 转载）：索罗斯基金转为家族办公室，2011',
          url: 'https://www.investmentnews.com/retirement-planning/george-soros-ditches-hedge-fund-empire-for-a-family-office/37776',
        },
        {
          label: 'NPR Planet Money：索罗斯如何迫使英国让英镑贬值，2024-12-04',
          url: 'https://www.npr.org/transcripts/1216966368',
        },
        {
          label: '索罗斯 2009 年中欧大学讲座《金融市场》记录稿（开放社会基金会）',
          url: 'https://www.opensocietyfoundations.org/uploads/2b96bb8c-e2e1-4d88-9eea-badf16d0a2b8/george-soros-financial-markets-transcript.pdf',
        },
      ],
    },
    cycleView:
      '他不认为市场会自动回到均衡：价格会通过信贷和融资改变基本面，基本面又反过来推高价格，形成繁荣—萧条。关键是找出真实在发生的趋势和大家对它的误解，再看它在回调中能不能经受住检验；繁荣往往漫长，崩溃却又快又陡。',
    wins: [
      '1992 年：英国身处衰退却要守住汇率，政策承诺经不起检验；量子基金把做空英镑的仓位从约 15 亿美元加到上百亿美元，英国 9 月 16 日退出欧洲汇率机制，英镑对马克贬值约 15%。',
      '2008 年 1 月：在《金融时报》撰文称这是“60 年来最严重的市场危机”；他把 2007 年次贷泡沫破裂看作持续数十年的信用“超级泡沫”的转折点。',
    ],
    learn: [
      '每个热门主题写两行：现实中真正发生的趋势是什么，市场可能夸大或误解了什么。',
      '留意“融资推高股价、股价再支持融资”的循环，例如高价增发和并购热潮；循环停转时提高警惕。',
      '回调时观察坏消息出来后价格能否站稳，站不稳说明多数人的信念开始动摇。',
      '每个判断都配一个“如果我错了”的预案，并在下单前写下来。',
    ],
    avoid: [
      '用杠杆做外汇或宏观方向大赌注。',
      '把反身性当成能精确择时的公式：他本人也曾把 1997–1998 年当成转折点而判断错误，2008 年方向对了却因仓位过大付出代价。',
    ],
    resources: [
      { title: '《金融炼金术》', note: '有中文版；反身性理论的原始著作，附他 1985–1986 年的实时交易日记。' },
      { title: '《索罗斯带你走出金融危机》', note: '有中文版（英文原名 The New Paradigm for Financial Markets）；用反身性解释 2008 年信用超级泡沫。' },
      {
        title: '2009 年中欧大学系列讲座',
        note: '英文记录稿，免费；用通俗语言讲反身性和繁荣—萧条模型。',
        url: 'https://www.opensocietyfoundations.org/uploads/2b96bb8c-e2e1-4d88-9eea-badf16d0a2b8/george-soros-financial-markets-transcript.pdf',
      },
    ],
  },
  {
    slug: 'templeton',
    rank: 3,
    role: '全球选股：估值与最大悲观点',
    record: {
      summary:
        '1954 年创立邓普顿成长基金。据美国《Money》杂志 1999 年报道，基金此后 38 年年均回报约 15%；另据 Motley Fool 整理，1954 年投入的 1 万美元到 1992 年他出售基金公司时已超过 200 万美元（分红再投资），两者折算一致。',
      caveat:
        '媒体整理的长期平均数，没有说明是否扣除申购费等费用；1992 年后基金由富兰克林邓普顿管理，之后的业绩不代表他本人。',
      sources: [
        {
          label: 'Money 杂志：The Secrets of Sir John Templeton，1999-01-01（网页存档）',
          url: 'https://web.archive.org/web/20131103095005/http://money.cnn.com/magazines/moneymag/moneymag_archive/1999/01/01/253723/index.htm',
        },
        {
          label: 'Motley Fool：Who Is John Templeton?',
          url: 'https://www.fool.com/investing/how-to-invest/famous-investors/john-templeton',
        },
        {
          label: '晨星澳洲：John Templeton: How to be a bargain hunter，2020-07-07',
          url: 'https://www.morningstar.com.au/insights/personal-finance/203792/john-templeton-how-to-be-a-bargain-hunter',
        },
      ],
    },
    cycleView:
      '他把周期看成人心的轮回：牛市生于悲观、长于怀疑、成熟于乐观、死于狂热。所以他不去预测经济，而是在全世界找人人害怕、价格远低于价值的个股，等大家都乐观时再卖出；“最大悲观点”只能事后确认，所以他常常比底部早买。',
    wins: [
      '1939 年：二战爆发、市场一片悲观时，借钱给 104 家股价不到 1 美元的美国公司各买约 100 美元（其中 37 家处于破产状态），几年后只有 4 家没有赚钱。',
      '1960 年代：日本股市市盈率约 4 倍、美股约 19.5 倍时，率先大举投资日本；1970 年代日本股票变得热门后又逐步转出。',
    ],
    learn: [
      '平时准备一份想长期持有的好公司清单和合理价格，大跌、人人悲观时按清单分批买入。',
      '听到“这次不一样”时，先找历史上相似的情形对照，再决定要不要跟。',
      '在不同市场、不同行业之间比较估值，不只盯一个市场。',
      '大家都乐观、新股火爆时，逐个检查持仓价格是否已经远高于价值。',
      '每次犯错都写复盘：错在哪里、下次怎么避免，而不是加大风险把亏损赚回来。',
    ],
    avoid: [
      '把“最大悲观点”当成能提前算准的底部、一次性重仓抄底：他自己也常常早于底部好几个月买入，需要承受继续下跌。',
      '像 1939 年那样借钱买股：那是他年轻时的特例，普通投资者用杠杆抄底可能在底部前被迫卖出。',
    ],
    resources: [
      { title: '《邓普顿教你逆向投资》', note: '有中文版；他的侄孙女劳伦·邓普顿整理的最大悲观点买入法和历次案例。' },
      {
        title: '《投资成功的 16 条法则》',
        note: '英文，免费 PDF（富兰克林邓普顿重印）；他本人写的投资原则。',
        url: 'https://www.franklintempleton.com/forms-literature/download/TL-R16',
      },
    ],
  },
  {
    slug: 'tudor-jones',
    rank: 4,
    role: '趋势与风险控制：200 日线与金融条件',
    record: {
      summary:
        '据《纽约时报》2014 年报道，旗舰的都铎 BVI 全球基金长期年化回报接近 19.5%；1987 年扣费后 +125.9%，1990 年 +87.4%，2008 年亏 4.9% 是唯一亏损年度。另一份私人银行数据库显示，该基金自 1986 年 10 月成立到 2009 年 6 月年化 22.1%。后期明显变低，2010–2012 年平均每年只有约 5%。',
      caveat:
        '数字来自基金给潜在投资者的材料和私人银行数据库，属于基金自报，未经统一审计；19.5% 与 22.1% 截止时间不同，不能直接比较；“唯一亏损年度”的说法截至 2014 年。',
      sources: [
        {
          label: '《纽约时报》DealBook：After a Dazzling Early Career, a Star Trader Settles Down，2014-03-05',
          url: 'https://archive.nytimes.com/dealbook.nytimes.com/2014/03/05/after-a-dazzling-early-career-a-star-trader-settles-down/index.html',
        },
        {
          label: 'Opalesque：私人银行数据库中的全球宏观基金排名，2009-08-11',
          url: 'https://www.opalesque.com/OFI189/Top_have_a_surprise_for_you_the89.html',
        },
      ],
    },
    cycleView:
      '他先问“怎么不亏大钱”：价格跌破 200 日均线就先离场，宏观环境恶劣时宁可跟着趋势走，也不硬猜。方向上他盯美联储和金融条件，联储还在加息、金融条件又快速收紧，是对股票最不利的组合；货币大扩张时，他担心通胀卷土重来。',
    wins: [
      '1987 年：押注美股大跌，在当年 10 月股灾中获利，旗舰基金全年扣费后 +125.9%。',
      '1990 年：日本股市泡沫破裂时获利，当年 +87.4%。',
      '2001–2002 年：科技股下跌期间两年合计 +48.1%。',
    ],
    learn: [
      '给指数或持仓设一条趋势底线（例如 200 日均线），收盘跌破就先降低风险，重新站上再考虑加回。',
      '亏损的仓位不加码摊平。',
      '每笔投资先想清楚最多能亏多少，再想能赚多少。',
      '联储仍在加息而金融条件快速收紧时，把整体仓位上限调低。',
    ],
    avoid: [
      '期货杠杆和频繁短线交易：他的转折点交易依赖专业团队和严格止损。',
      '把一条均线当成全部系统：机械执行会反复进出、产生交易成本，也代表不了他的全部方法。',
    ],
    resources: [
      { title: '《金融怪杰》', note: '施瓦格的交易员访谈录，有中文版；都铎·琼斯一章讲防守、止损和不摊平亏损。' },
      {
        title: '2020 年致投资者信《伟大的货币通胀》',
        note: '英文，媒体摘要免费可读；他如何看疫情后的货币扩张与通胀对冲。',
        url: 'https://decrypt.co/28169/paul-tudor-jones-makes-compelling-case-for-bitcoin',
      },
    ],
  },
  {
    slug: 'dalio',
    rank: 5,
    role: '债务周期：信用、流动性与风险平衡',
    record: {
      summary:
        '据《财富》2009 年报道，桥水旗舰纯阿尔法（Pure Alpha）基金此前 18 年扣费前年均约 15%，单年亏损从未超过 2%，2008 年毛回报约 14%。之后长期平均逐步下降：《纽约时报》2014 年报道为自 1991 年以来年均 13.5%，《财富》2022 年报道纯阿尔法 II 自 1991 年成立以来年均约 11.4%。',
      caveat:
        '桥水不公开披露业绩：2009 年数字是扣费前，后两个数字没有说明是否扣费；2019 年小亏，2020 年全年亏约 12.6%，近年波动明显变大。',
      sources: [
        { label: '《财富》：Inside Bridgewater: The World\'s Biggest Hedge Fund，2009-03-19', url: 'https://fortune.com/2009/03/19/bridgewater-ray-dalio' },
        {
          label: '《财富》：桥水旗舰基金 2022 年上半年如何跑赢熊市，2022-07-06',
          url: 'https://fortune.com/2022/07/06/how-ray-dalio-flagship-hedge-fund-beat-bear-market-in-first-half-2022/',
        },
        {
          label: '《纽约时报》DealBook（提到纯阿尔法 1991 年以来年均 13.5%），2014-03-05',
          url: 'https://archive.nytimes.com/dealbook.nytimes.com/2014/03/05/after-a-dazzling-early-career-a-star-trader-settles-down/index.html',
        },
      ],
    },
    cycleView:
      '他把经济看成一台机器：生产率缓慢向上，叠加约 5–8 年一轮的短期债务周期和几十年一轮的长期债务周期，利率降到零附近就意味着长周期进入去杠杆。真正推动资产价格的，是增长和通胀相对市场预期的变化；因为没人能准确预测，他选择在不同经济环境之间平衡风险。',
    wins: [
      '2008 年：早在 2001 年就把“萧条指标”写进交易系统，2008 年该指标报警；纯阿尔法当年毛回报约 14%，同年约七成对冲基金亏损，行业平均跌 18%。',
    ],
    learn: [
      '不押单一预测：股票之外，配一些在衰退、通胀等不同环境下表现不同的资产，例如债券和黄金。',
      '看经济数据时问“比预期好还是差”，而不只看好坏本身。',
      '关注债务增速和利率空间：债务短期快速上升、利率已接近零时，更重视防守。',
      '把自己的决策规则写下来，事后对照结果修订。',
    ],
    avoid: [
      '照搬加杠杆的风险平价：桥水的组合依赖杠杆和专业风控，个人加杠杆很难承受债券和股票同时下跌的年份。',
      '用几十年一轮的长期债务周期判断一两年内的买卖时点。',
    ],
    resources: [
      { title: '《原则》', note: '有中文版；他的决策方法和桥水的管理方式。' },
      {
        title: '《债务危机：我的应对原则》',
        note: '有中文版；英文版第一部分可在桥水官网免费下载，讲债务周期的典型路径。',
        url: 'https://www.bridgewater.com/big-debt-crises/Principles-For-Navigating-Big-Debt-Crises-By-Ray-Dalio.pdf',
      },
      {
        title: '《经济机器是怎样运行的》',
        note: '约 30 分钟的免费动画视频，用大白话讲生产率与两种债务周期。',
        url: 'https://www.economicprinciples.org/',
      },
    ],
  },
  {
    slug: 'marks',
    rank: 6,
    role: '市场体温：信用周期与估值',
    record: {
      summary:
        '橡树资本在 2018 年年报（向美国证监会提交）中披露，截至 2018 年底：不良债权基金自 1988 年起累计投入约 438 亿美元，内部收益率扣费前 21.9%、扣费后 16.0%；美国高收益债策略自 1986 年起年化扣费前 8.9%、扣费后 8.3%，同期基准 8.0%，违约率约为整个市场的三分之一。',
      caveat:
        '这是团队业绩，不是马克斯个人账户：不良债主要由联合创始人布鲁斯·卡什管理，马克斯负责高收益债和整体投资理念；1995 年橡树成立前的部分来自他们在 TCW 时期的同一批团队。内部收益率和年化回报算法不同，不能直接相比。',
      sources: [
        {
          label: '橡树资本 2018 年年报（美国证监会 EDGAR）',
          url: 'https://www.sec.gov/Archives/edgar/data/1403528/000140352819000007/a201810-kdoc.htm',
        },
        {
          label: '马克斯备忘录《Taking the Temperature》，2023-07-10',
          url: 'https://www.oaktreecapital.com/docs/default-source/memos/taking-the-temperature.pdf',
        },
      ],
    },
    cycleView:
      '他说自己预测不了拐点，但能知道现在大概在哪：看信贷是不是很好借、新发行的交易是不是越来越差、投资者是贪婪还是恐惧。市场情绪像钟摆，很少停在中间；只有走到极端时他才明显调整攻守，平时不靠宏观预测择时。',
    wins: [
      '2000 年初：写备忘录警告科技股泡沫（标题就叫“bubble.com”），之后科技股大跌。',
      '2004–2007 年：连续提示风险溢价太薄、交易太差，橡树收缩基金规模，几乎没碰次贷；标普 500 从 2007 年高点跌到 2009 年 2 月，跌幅 53%。他也承认 2004 年那次“太早了”。',
      '2008 年第四季度：雷曼破产后判断“世界不会终结”，橡树的不良债团队平均每周投入约 4 亿美元，一个季度投了约 60 亿美元。',
    ],
    learn: [
      '定期给市场量体温：贷款好不好借、低质量的新股和新债多不多、身边是不是人人都在谈赚钱。',
      '只在极端时调整攻守：明显过热时降低风险，恐慌时敢于分批买入，平时按计划持有。',
      '分清价格和价值：再好的公司，买得太贵也是坏投资。',
      '大跌恐慌时问自己“世界会不会终结”，答案是不会，就别因为恐惧把好资产全部卖掉。',
      '先想怎么少亏，再想怎么多赚：避开自己看不懂的高风险产品。',
    ],
    avoid: [
      '直接买不良债或低评级高收益债：这需要专业的债务重组能力和分散组合。',
      '因为担心周期而长期大幅低配股票：他自己也承认偏早，防守太久有踏空成本。',
    ],
    resources: [
      { title: '《投资最重要的事》', note: '有中文版；讲风险、周期、逆向思维和量体温。' },
      { title: '《周期》', note: '有中文版（英文原名 Mastering the Market Cycle）；系统讲经济、信用和心理周期。' },
      {
        title: '橡树资本备忘录合集',
        note: '英文，免费；他三十多年来写给客户的全部备忘录，周期判断都在里面。',
        url: 'https://www.oaktreecapital.com/insights/memos',
      },
    ],
  },
]
