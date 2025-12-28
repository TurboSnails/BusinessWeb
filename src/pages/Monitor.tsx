import React, { useState, useEffect } from 'react'
import { fetchCBOEPCRatios } from '../services/api'

// 数据类型定义
type InvestmentFramework = {
  id: string
  title: string
  content: string
  category: 'plan' | 'strategy' | 'monitor'
  lastUpdated: string
}

// localStorage 操作
const STORAGE_KEY = 'monitor_data'

const loadData = (): InvestmentFramework[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY)
    return data ? JSON.parse(data) : getDefaultData()
  } catch {
    return getDefaultData()
  }
}

const saveData = (data: InvestmentFramework[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

const getDefaultData = (): InvestmentFramework[] => [
  {
    id: '1',
    title: '投资总纲',
    content: `🎯 目标
在可能出现的 2026 年美股中大级别回撤中，尽量避开主要跌幅，并在「极度恐慌—错杀」阶段分批建仓，获得中长期收益。

📦 核心资产
• 指数与权重股：NVDA 等美股核心成长
• 杠杆放大器：YINN（仅限趋势阶段）
• 贵金属与矿企：黄金仓位 + PAAS
• 卫星仓：RKLB 等高 Beta 小票（仅在特定阶段参与）

👥 适用人群
能承受中等回撤，有一定期权与衍生品概念，习惯按规则执行的主动投资者。

📦 资产角色定义
💊 LLY - 礼来（股票）
制药增长

💳 AXP - 美国运通（股票）
金融稳定

🔍 GOOGL - 谷歌（股票）
AI领导

🔌 TSM - 台积电（股票）
半导体核心

🥈 PAAS - Pan American Silver（股票）
银矿对冲

🚀 RKLB - Rocket Lab（股票）
航天潜力

🥇 GOLD - 黄金（商品）
卖出若回调>10%或利率升`,
    category: 'strategy',
    lastUpdated: new Date().toISOString().split('T')[0]
  },
  {
    id: '2',
    title: '宏观假设',
    content: `⚠️ 前提假设
以下假设是这套策略的基础前提。如果这些假设不成立，策略需要相应调整。

假设一：宏观环境
美股 2026 年处在高估 + 滞涨或衰退尾声，存在一次中到大级别回撤。

假设二：货币政策
美联储在 2025–2026 年利率高位徘徊或缓慢下行，流动性不会立刻极度宽松。

假设三：适用人群
策略适合能承受中等回撤、可频繁调整仓位、有一定衍生品理解能力的投资者。

🌍 宏观场景与对应策略

场景一：软着陆
经济温和放缓，通胀回落，美联储逐步降息。
策略：保持 60-70% 权益仓位，重点关注优质成长股，减少杠杆 ETF 比例。

场景二：硬着陆
经济快速衰退，失业率上升，企业盈利大幅下滑。
策略：提前减仓至 30-40% 权益，增加现金和黄金比例，等待极度恐慌后的抄底机会。

场景三：滞涨
通胀居高不下，经济增长停滞，美联储进退两难。
策略：降低权益仓位至 50%，增加贵金属（黄金、PAAS）配置，保持高现金比例。`,
    category: 'strategy',
    lastUpdated: new Date().toISOString().split('T')[0]
  },
  {
    id: '3',
    title: '指标体系',
    content: `指标体系与优先级

一级指标（核心灵魂）
🥇 Equity Put/Call Ratio
散户情绪"体温计"，用于识别极度恐慌与过度乐观，确认抄底时机。

🥈 Net GEX
判断是否进入负 Gamma 崩盘区，决定是否禁止加仓高 Beta。

二级指标（辅助验证）
🥉 SPX Put/Call Ratio
机构对冲意愿变化，辅助判断"防弹衣是否已脱"。

4️⃣ VIX 及其期限结构
观察恐慌程度与期限倒挂。

三级指标（专项工具）
5️⃣ 金银比（Gold/Silver Ratio）
用于在极端错价时调整黄金与白银矿仓位。

指标阈值与行动表
• Equity Put/Call Ratio: 0.5 < P/C < 0.8 → 情绪偏乐观，维持持仓，不再加仓高 Beta
• Equity Put/Call Ratio: P/C ≥ 1.1 → 极度恐慌，启动 1/8 现金抄底 PAAS
• SPX Put/Call Ratio: SPX P/C < 0.9 且指数创新高 → 视为机构对冲意愿下降，逐步减仓 YINN/NVDA
• Net GEX: 进入明显负 Gamma 区 → 禁止加仓高 Beta（RKLB/YINN 等），只允许减仓或对冲
• 金银比: GSR > 85–90 → 白银相对极度便宜，可把部分黄金敞口换成 PAAS 分批买入`,
    category: 'monitor',
    lastUpdated: new Date().toISOString().split('T')[0]
  },
  {
    id: '4',
    title: '阶段划分',
    content: `💰 当前持仓与黄金分析
您的组合包括 LLY、AXP、GOOGL、TSM、PAAS、RKLB、GOLD（黄金商品，假设为黄金相关资产如GLD ETF或Barrick Gold股票），每个约12.5%，加上现金12.5%。黄金部分（GOLD + PAAS）占约25%，提供通胀对冲和防御。

2025年黄金表现：金价从年初约$2450/盎司涨至年末约$3900/盎司（基于GLD代理），YTD +59%，受益于地缘不确定、中央银行购买和关税影响。然而，2025后期涨幅放缓（7-8月微跌），显示潜在峰值。

黄金卖出时机：
• 宏观指标：利率上升（10年美债收益率>4%），美元强势（DXY>105），通胀回落（CPI<2%），这些削弱黄金吸引力。
• 技术信号：金价回调>10%从峰值，或金/道指比率接近1:1（当前约0.08，远未到）。银/金比率<30:1也暗示过热。
• 市场周期：在权益牛市（如金屋行情）卖出，转入成长股；泡沫后期若VIX>20，渐减。
• 个人规则：设定止盈（如+20% YTD卖1/3），或若相信2026继续涨（J.P. Morgan预测更高），持有。

📊 优化后组合（整合黄金卖出）
比例微调：保持黄金10-15%，但添加卖出阈值（如> +20%卖部分）。

资产配置表：
• LLY: 20% - 制药增长 - YTD +0.79% - Beta 0.8
• AXP: 15% - 金融稳定 - YTD +0.55% - Beta 1.4
• GOOGL: 15% - AI领导 - YTD +0.07% - Beta 1.1
• TSM: 20% - 半导体核心 - YTD +2.07% - Beta 1.3
• PAAS: 10% - 银矿对冲 - YTD +5.69% - Beta 1.5
• RKLB: 10% - 航天潜力 - YTD -2.00% - Beta 2.0
• GOLD: 10% - 黄金商品；卖出若回调>10%或利率升 - YTD +3.03% - Beta 0.9
• 现金/TLT: 10%/5% - 防御
• 做空工具: <5-10% - 熊市对冲

📈 基于市场周期的动态策略（融入持仓+做空+黄金卖出）

阶段一：金屋行情
情绪与指标特征：指数创新高，P/C <0.7，VIX <15
仓位大致范围：权益70-80%，商品15-20%，现金5%
分沽操作：持有LLY/TSM/GOOGL，加RKLB
基准操作：增科技，监控AI
做空部分：无
黄金卖出规则：持有GOLD/PAAS；若金价+20% YTD，卖1/3转权益（如TSM）

阶段二：泡沫初期
情绪与指标特征：指数高位，P/C 0.7-1.0，VIX 15-20
仓位大致范围：权益60-70%，商品20-25%，现金10%
分沽操作：减RKLB，转GOOGL
基准操作：加TLT；止盈>10%
做空部分：1-3% SQQQ
黄金卖出规则：监控金价峰值；若美债>4%，卖GOLD 20%，转现金

阶段三：泡沫后期
情绪与指标特征：指数急跌，Net GEX负大，VIX >20
仓位大致范围：权益40-50%，商品25-30%，现金20-30%
分沽操作：只减不加；VIX PUT。止损-8%
基准操作：移仓PAAS/GOLD；限交易
做空部分：5-10% SQQQ/SPXS
黄金卖出规则：持有作为防御；但若美元>105，卖GOLD 30%，避回调

阶段四：中期筑底
情绪与指标特征：Equity P/C >1.2，VIX <30回落
仓位大致范围：权益30-40%，商品30%，现金30-40%
分沽操作：1/8现金买PAAS/GOLD
基准操作：All in优质；增商品若CPI>3%
做空部分：3-5% SPXS
黄金卖出规则：增持GOLD；卖出信号弱，观察通胀降<2%再减

阶段五：熊市后期
情绪与指标特征：指数比跌，P/C 中性，VIX <20
仓位大致范围：权益60-70%，商品20-25%，现金10%
分沽操作：增TSM/GOOGL
基准操作：再平衡，卖< -5%
做空部分：5% short弱势
黄金卖出规则：若权益反弹，卖GOLD/PAAS 20%，转成长股；金/道指>0.1持，否则卖

阶段六：筑底回升
情绪与指标特征：指数止跌，P/C 中性，VIX <15
仓位大致范围：权益60-70%，商品20-25%，现金10-15%
分沽操作：加LLY/AXP；止损-5%
基准操作：观察美联储，加权益
做空部分：<3%局部
黄金卖出规则：渐减GOLD若价格稳定高位；卖若回调>10%，或2026预测转弱

实施：每周查指标（如VIX、DXY），季度再平衡。回测显示添加卖出规则可减波动15%。`,
    category: 'plan',
    lastUpdated: new Date().toISOString().split('T')[0]
  },
  {
    id: '5',
    title: '日常之行',
    content: `市场情绪与崩盘信号分析器

🏆 指标优先级排名（实战有效性）
🥇 第一名：Equity Put/Call Ratio（核心灵魂）
散户情绪"体温计"，确认抄底时机。只有当它 > 1.1 甚至冲向 1.3 时，才是 1/8 现金进场的安全红灯。

🥈 第二名：Net GEX（波动引擎）
预测崩盘速度。一旦转负，做市商会助跌，股价会快速下跌。判断"要不要再等更低点"的关键指标。

🥉 第三名：SPX Put/Call Ratio（避雷针）
机构的动作，预测鱼尾结束。如果跌破 0.9，说明"防弹衣"脱了，这是减仓 YINN/NVDA 的最高指令。

4️⃣ 第四名：VIX 期限结构（预警哨兵）
长线转折预警。一旦倒挂，立刻进入"临战模式"。

5️⃣ 第五名：金/银比（专项工具）
专门针对 PAAS。如果冲到 85-90，就算大盘还在跌，也可以开始建仓 PAAS。

💡 2026 "三步走"实战清单
1️⃣ 看"撤退信号"（看第 3、4 名）
如果 SPX P/C 下跌 + VIX 期限结构开始收窄 = 撤退 YINN/NVDA，准备现金。

2️⃣ 看"崩盘速度"（看第 2 名）
如果 GEX 转负 = 耐心等待。不要在刚转负时接 RKLB，因为它会跌得很快，目标位稳稳能到。

3️⃣ 看"抄底红灯"（看第 1、5 名）
如果 Equity P/C > 1.2 + 金银比 > 85 = 全线出击。买入 PAAS 和 RKLB。

📚 市场博弈逻辑：从"鱼尾行情"到"崩盘"再到"熊转牛"

📉 第一部分：熊市崩盘的三个阶段
1. 诱多期（防弹衣剥落）：SPX 1.22 → 0.90。市场还在涨，但机构开始获利了结 Put 或不再购买昂贵的保险。散户的 Equity P/C 可能还在 0.6 以下（极度贪婪）。
2. 踩踏期（无保护自由落体）：SPX < 0.8 / Equity 0.6 → 1.0。导火索引爆，机构没有 Put 保护，开始砸盘抛售现货。散户开始慌乱买入 Put 避险。
3. 绝望期（终极洗盘）：Equity P/C > 1.2。这是你等待的瞬间。大盘无差别暴跌，PAAS 和 RKLB 杀到你的预警位。这就是你的"第一笔 1/8 现金"入场点。

📈 第二部分：熊转牛的"接力流程"
第一步：SPX P/C 先行见顶回落（机构先嗅到转机）
第二步：Equity P/C 出现"极致恐慌后的平复"（散户投降）
第三步：VIX 确认（温度降下来）
第四步：散户回归（新的牛市开启）

每日执行清单
查看自选
KRE、XHB、GDX/GLD、VIX、DXY、^TNX、BTC-USD、CNN Fear & Greed 指数

记录数据
当天 Equity P/C、SPX P/C、Net GEX、金银比，以及自己给市场阶段打一个标签（鱼尾 / 诱多 / 崩盘 / 恐慌 / 筑底）

行动决策
• 若无阶段切换信号 → 不做大动作
• 若阶段变更 → 按上表调整仓位，不做超过两步的大幅改动

投资纪律
• 现金是等待成本，也是买错的止损器。
• 做空需要耐心，抄底需要勇气，二者都要有规则约束。
• 宁可错过，不要做错；宁可慢一点，不要频繁大振幅改仓。`,
    category: 'plan',
    lastUpdated: new Date().toISOString().split('T')[0]
  }
]

const categoryConfig = {
  plan: { title: '计划执行', icon: '📋', color: '#3b82f6', bgColor: '#eff6ff' },
  strategy: { title: '决策策略', icon: '🎯', color: '#8b5cf6', bgColor: '#faf5ff' },
  monitor: { title: '监控分析', icon: '📊', color: '#10b981', bgColor: '#f0fdf4' }
}

export default function Monitor(): JSX.Element {
  const [data, setData] = useState<InvestmentFramework[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editContent, setEditContent] = useState('')
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'assumptions' | 'indicators' | 'temperature' | 'china-temperature' | 'stages' | 'execution' | 'us-monitor'>('execution')
  
  // 市场情绪分析器状态
  const [equityPC, setEquityPC] = useState<string>('')
  const [spxPC, setSpxPC] = useState<string>('')
  const [vixNear, setVixNear] = useState<string>('')
  const [vixFar, setVixFar] = useState<string>('')
  const [netGEX, setNetGEX] = useState<string>('')
  const [goldSilverRatio, setGoldSilverRatio] = useState<string>('')
  const [loadingPCRatios, setLoadingPCRatios] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<{
    status: 'safe' | 'warning' | 'danger'
    title: string
    content: string
    action: string
    advanced?: string
  } | null>(null)

  useEffect(() => {
    // 初始化数据，确保分类正确
    const currentData = loadData()
    const defaultData = getDefaultData()
    
    // 创建分类映射表（用于迁移旧数据）
    const categoryMap: Record<string, 'plan' | 'strategy' | 'monitor'> = {
      '投资总纲': 'strategy',
      '宏观假设': 'strategy',
      '指标体系': 'monitor',
      '阶段划分': 'plan',
      '日常之行': 'plan'
    }
    
    // 合并数据：保留已有内容，更新分类
    const updatedData = defaultData.map(defaultItem => {
      const existing = currentData.find(item => item.id === defaultItem.id || item.title === defaultItem.title)
      if (existing) {
        // 如果已有数据，保留内容，但更新分类
        return {
          ...existing,
          category: categoryMap[defaultItem.title] || defaultItem.category,
          id: defaultItem.id // 确保ID一致
        }
      }
      return defaultItem
    })
    
    setData(updatedData)
    saveData(updatedData)
  }, [])

  useEffect(() => {
    if (data.length > 0) {
      saveData(data)
    }
  }, [data])

  // 自动获取 P/C Ratio 数据
  const handleFetchPCRatios = async () => {
    setLoadingPCRatios(true)
    try {
      console.log('开始获取 CBOE P/C Ratio 数据...')
      const data = await fetchCBOEPCRatios()
      console.log('获取到的数据:', data)
      
      let successCount = 0
      if (data.equityPC !== null) {
        setEquityPC(data.equityPC.toFixed(2))
        successCount++
      }
      if (data.spxPC !== null) {
        setSpxPC(data.spxPC.toFixed(2))
        successCount++
      }
      
      if (successCount === 0) {
        const openCBOE = confirm('⚠️ 无法自动获取数据\n\nCBOE 页面使用动态加载，无法直接解析。\n\n是否在新窗口打开 CBOE 页面？\n\n（打开后，请查找 "Equity Put/Call Ratio" 和 "SPX Put/Call Ratio" 数据）')
        if (openCBOE) {
          window.open('https://www.cboe.com/us/options/market_statistics/daily/', '_blank')
        }
      } else if (successCount === 1) {
        const missing = []
        if (data.equityPC === null) missing.push('Equity P/C Ratio')
        if (data.spxPC === null) missing.push('SPX P/C Ratio')
        const openCBOE = confirm(`✅ 已获取部分数据\n\n缺失：${missing.join('、')}\n\n是否打开 CBOE 页面补充缺失数据？`)
        if (openCBOE) {
          window.open('https://www.cboe.com/us/options/market_statistics/daily/', '_blank')
        }
      } else {
        alert('✅ 数据获取成功！')
      }
    } catch (error) {
      console.error('Failed to fetch P/C Ratios:', error)
      const openCBOE = confirm('❌ 获取数据失败\n\nCBOE 页面使用动态加载，无法直接解析。\n\n是否在新窗口打开 CBOE 页面手动获取？')
      if (openCBOE) {
        window.open('https://www.cboe.com/us/options/market_statistics/daily/', '_blank')
      }
    } finally {
      setLoadingPCRatios(false)
    }
  }

  // 市场分析函数
  const analyzeMarket = () => {
    const equity = parseFloat(equityPC)
    const spx = parseFloat(spxPC)
    const vixN = parseFloat(vixNear)
    const vixF = parseFloat(vixFar)
    const gex = parseFloat(netGEX)
    const gsRatio = parseFloat(goldSilverRatio)
    
    if (isNaN(equity) || isNaN(spx)) {
      alert('请输入 Equity P/C 和 SPX P/C 的数值')
      return
    }

    // 高阶参数分析
    let advancedAnalysis = ''
    const hasAdvanced = !isNaN(vixN) && !isNaN(vixF) || !isNaN(gex) || !isNaN(gsRatio)
    
    if (hasAdvanced) {
      const advParts: string[] = []
      
      // VIX 期限结构分析
      if (!isNaN(vixN) && !isNaN(vixF)) {
        if (vixN > vixF) {
          advParts.push('⚠️ VIX 期限结构倒挂（近期 > 远期）：这是崩盘前兆，即使大盘还在涨也要警惕！')
        } else if (vixN >= vixF * 0.9) {
          advParts.push('⚠️ VIX 期限结构接近倒挂：近期急速逼近远期，需要密切关注。')
        } else {
          advParts.push('✅ VIX 期限结构正常（远期 > 近期）：市场情绪相对稳定。')
        }
      }
      
      // Net GEX 分析
      if (!isNaN(gex)) {
        if (gex < 0) {
          advParts.push('🚨 Net GEX 为负值：市场进入崩盘区，做市商对冲行为会"越跌越卖"，价格可能自由落体！')
        } else if (gex < 10) {
          advParts.push('⚠️ Net GEX 接近零轴：市场稳定性下降，波动可能加剧。')
        } else {
          advParts.push('✅ Net GEX 为高正值：市场处于安全区，做市商会"越涨越卖，越跌越买"，波动较小。')
        }
      }
      
      // 金银比分析
      if (!isNaN(gsRatio)) {
        if (gsRatio >= 90) {
          advParts.push('💰 金银比 ≥ 90：白银极度便宜，这是确定性最高的 PAAS 买入时刻！')
        } else if (gsRatio >= 85) {
          advParts.push('💰 金银比 ≥ 85：白银相对便宜，接近 PAAS 的买入区间。')
        } else if (gsRatio < 70) {
          advParts.push('⚠️ 金银比 < 70：白银猛涨（PAAS 冲高），可能是鱼尾行情末端。')
        } else {
          advParts.push('✅ 金银比正常（70-85）：金属市场相对平衡。')
        }
      }
      
      if (advParts.length > 0) {
        advancedAnalysis = advParts.join('\n\n')
      }
    }

    let result: typeof analysisResult = null

    // 完善的分析逻辑
    if (equity < 0.7 && spx >= 1.2) {
      result = {
        status: 'safe',
        title: '当前状态：鱼尾行情（非理性繁荣，有保护）',
        content: '散户在狂欢，但机构买了大量保险。虽然看似危险，但由于对冲充足，短期内很难发生断崖式崩盘。市场可能还在涨，甚至创新高。',
        action: '资产状态：持有 YINN, NVDA | 操作：持仓不动，不加仓。继续持有现金，不要追高。',
        advanced: advancedAnalysis
      }
    } else if (equity < 0.7 && spx >= 0.85 && spx < 1.2) {
      result = {
        status: 'warning',
        title: '当前状态：诱多末期（防弹衣剥落）',
        content: 'SPX 比例从 1.22 降到 0.9 以下。市场可能还在涨，但机构的"防弹衣"没了。机构开始获利了结 Put 或不再购买昂贵的保险。散户的 Equity P/C 可能还在 0.6 以下（极度贪婪）。',
        action: '资产状态：极度危险 | 操作：考虑对 YINN 进行止盈。握紧你的 1/8 现金，暴风雨可能在 2 周内到来。',
        advanced: advancedAnalysis
      }
    } else if (equity < 0.7 && spx < 0.85) {
      result = {
        status: 'warning',
        title: '当前状态：裸奔时刻（无保护自由落体）',
        content: '个股极度贪婪，且机构撤走了对冲保护（或者对冲已经赔光）。这是崩盘前的最危险信号！导火索（如经济数据）可能即将引爆。',
        action: '资产状态：极度危险 | 操作：握紧你的 1/8 现金，暴风雨可能在 2 周内到来。',
        advanced: advancedAnalysis
      }
    } else if (equity >= 0.7 && equity < 1.0 && spx < 0.8) {
      result = {
        status: 'warning',
        title: '当前状态：踩踏期（无保护自由落体）',
        content: '导火索已引爆。因为机构没有 Put 保护，为了自保，他们开始在大盘直接砸盘抛售现货。散户开始意识到不对劲，个股跌破关键位，散户开始慌乱买入 Put 避险，Equity P/C 快速拉升。',
        action: '资产状态：账户回撤 | 操作：忍耐，手握现金。等待 Equity P/C 继续飙升。',
        advanced: advancedAnalysis
      }
    } else if (equity >= 1.2 && spx >= 0.9 && spx < 1.1) {
      result = {
        status: 'danger',
        title: '当前状态：极度恐惧（黄金坑 - 第一笔买入点）',
        content: '这是你等待的瞬间。大盘无差别暴跌，PAAS 和 RKLB 杀到你的预警位。市场上所有人都认为还要跌。散户不再买 Call，全部在割肉或买 Put 保命。',
        action: '资产状态：买入点！| 操作：1/8 现金抄底 PAAS 和 RKLB。检查股价！如果 PAAS 到了 $50-51，RKLB 到了 $55，这就是最佳分批建仓时刻。',
        advanced: advancedAnalysis
      }
    } else if (equity >= 1.1 && spx >= 1.1) {
      result = {
        status: 'warning',
        title: '当前状态：系统性风险爆发',
        content: '全市场都在买保险。虽然恐惧，但说明大家还没放弃抵抗。',
        action: '操作：等待 Equity 继续飙升或 SPX 开始回落（即机构开始投降或直接抛售现货）。',
        advanced: advancedAnalysis
      }
    } else if (equity >= 0.8 && equity < 1.0 && spx >= 0.9 && spx < 1.0) {
      result = {
        status: 'safe',
        title: '当前状态：筑底回升（熊转牛开始）',
        content: 'SPX P/C 先行见顶回落，机构不再恐慌性买入指数保险。Equity P/C 出现"极致恐慌后的平复"，想卖的人都已经卖完了。这是量价背离，说明空头动能耗尽，市场开始筑底。',
        action: '资产状态：盈利中 | 操作：持股待涨。PAAS 和 RKLB 应该在底部横盘。',
        advanced: advancedAnalysis
      }
    } else if (equity < 0.7 && spx >= 0.9 && spx < 1.2) {
      result = {
        status: 'safe',
        title: '当前状态：散户回归（新牛市开启）',
        content: '踏空的人开始追高。Equity P/C 重新跌回 0.7 以下。此时 PAAS 已经从底部回升，你的仓位已经安全盈利。',
        action: '资产状态：盈利中 | 操作：持股待涨，享受牛市。',
        advanced: advancedAnalysis
      }
    } else {
      result = {
        status: 'safe',
        title: '当前状态：震荡修复期',
        content: '多空力量交织，没有明显的极端情绪。保持耐心。',
        action: '操作：继续观察，等待更明确的信号。',
        advanced: advancedAnalysis
      }
    }

    setAnalysisResult(result)
  }

  const handleEdit = (item: InvestmentFramework) => {
    setEditingId(item.id)
    setEditContent(item.content)
  }

  const handleSave = (id: string) => {
    setData(data.map(item => 
      item.id === id 
        ? { ...item, content: editContent, lastUpdated: new Date().toISOString().split('T')[0] }
        : item
    ))
    setEditingId(null)
    setEditContent('')
  }

  const handleCancel = () => {
    setEditingId(null)
    setEditContent('')
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '16px', minHeight: '100vh' }}>
      {/* 子Tab导航 - 参考 InvestmentPlan2026 的样式 */}
      <div style={{ background: 'white', borderLeft: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', flexDirection: 'column', borderBottom: '1px solid #e5e7eb' }}>
          {/* 计划执行类 */}
          <div style={{ display: 'flex', borderBottom: '1px solid #f3f4f6', flexWrap: 'wrap' }}>
            <div style={{ 
              padding: '8px 12px', 
              fontSize: '0.75rem', 
              color: '#6b7280', 
              fontWeight: '600',
              background: '#f9fafb',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              minWidth: '80px'
            }}>
              📅 计划执行
            </div>
            {(['stages', 'execution', 'us-monitor'] as const).map((subTab) => {
              const subLabels: Record<typeof subTab, string> = {
                stages: '阶段划分',
                execution: '日常执行',
                'us-monitor': '美经监控'
              }
              const isActive = activeSubTab === subTab
              return (
                <button
                  key={subTab}
                  onClick={() => setActiveSubTab(subTab)}
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    fontWeight: '500',
                    background: isActive ? '#eff6ff' : 'transparent',
                    color: isActive ? '#2563eb' : '#4b5563',
                    border: 'none',
                    borderBottom: isActive ? '2px solid #2563eb' : '2px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    fontSize: '0.9rem'
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = '#f9fafb'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'transparent'
                    }
                  }}
                >
                  {subLabels[subTab]}
                </button>
              )
            })}
          </div>

          {/* 决策策略类 */}
          <div style={{ display: 'flex', borderBottom: '1px solid #f3f4f6', flexWrap: 'wrap' }}>
            <div style={{ 
              padding: '8px 12px', 
              fontSize: '0.75rem', 
              color: '#6b7280', 
              fontWeight: '600',
              background: '#f9fafb',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              minWidth: '80px'
            }}>
              ⚖️ 决策策略
            </div>
            {(['overview', 'assumptions'] as const).map((subTab) => {
              const subLabels: Record<typeof subTab, string> = {
                overview: '投资总纲',
                assumptions: '宏观假设'
              }
              const isActive = activeSubTab === subTab
              return (
                <button
                  key={subTab}
                  onClick={() => setActiveSubTab(subTab)}
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    fontWeight: '500',
                    background: isActive ? '#eff6ff' : 'transparent',
                    color: isActive ? '#2563eb' : '#4b5563',
                    border: 'none',
                    borderBottom: isActive ? '2px solid #2563eb' : '2px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    fontSize: '0.9rem'
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = '#f9fafb'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'transparent'
                    }
                  }}
                >
                  {subLabels[subTab]}
                </button>
              )
            })}
          </div>

          {/* 监控分析类 */}
          <div style={{ display: 'flex', borderBottom: '1px solid #f3f4f6', flexWrap: 'wrap' }}>
            <div style={{ 
              padding: '8px 12px', 
              fontSize: '0.75rem', 
              color: '#6b7280', 
              fontWeight: '600',
              background: '#f9fafb',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              minWidth: '80px'
            }}>
              📊 监控分析
            </div>
            {(['indicators', 'temperature', 'china-temperature'] as const).map((subTab) => {
              const subLabels: Record<typeof subTab, string> = {
                indicators: '指标体系',
                temperature: '美经温度',
                'china-temperature': '中经温度'
              }
              const isActive = activeSubTab === subTab
              return (
                <button
                  key={subTab}
                  onClick={() => setActiveSubTab(subTab)}
                  style={{
                    flex: 1,
                    padding: '12px 16px',
                    fontWeight: '500',
                    background: isActive ? '#eff6ff' : 'transparent',
                    color: isActive ? '#2563eb' : '#4b5563',
                    border: 'none',
                    borderBottom: isActive ? '2px solid #2563eb' : '2px solid transparent',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    fontSize: '0.9rem'
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = '#f9fafb'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.background = 'transparent'
                    }
                  }}
                >
                  {subLabels[subTab]}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* 子Tab内容 */}
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '0 0 12px 12px', padding: '24px' }}>
      {activeSubTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* 投资总纲 */}
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '12px', padding: '24px' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '16px', color: '#1e40af', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '2rem' }}>🎯</span>
              投资总纲（2026）
            </h2>
            
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#1f2937' }}>目标</h3>
              <p style={{ fontSize: '0.95rem', lineHeight: '1.8', color: '#374151', marginBottom: '12px' }}>
                在可能出现的 2026 年美股中大级别回撤中，尽量避开主要跌幅，并在「极度恐慌—错杀」阶段分批建仓，获得中长期收益。
              </p>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#1f2937' }}>核心资产</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '12px' }}>
                <div style={{ background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                  <div style={{ fontWeight: '600', marginBottom: '4px', color: '#1f2937' }}>指数与权重股</div>
                  <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>NVDA 等美股核心成长</div>
                </div>
                <div style={{ background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                  <div style={{ fontWeight: '600', marginBottom: '4px', color: '#1f2937' }}>杠杆放大器</div>
                  <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>YINN（仅限趋势阶段）</div>
                </div>
                <div style={{ background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                  <div style={{ fontWeight: '600', marginBottom: '4px', color: '#1f2937' }}>贵金属与矿企</div>
                  <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>黄金仓位 + PAAS</div>
                </div>
                <div style={{ background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                  <div style={{ fontWeight: '600', marginBottom: '4px', color: '#1f2937' }}>卫星仓</div>
                  <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>RKLB 等高 Beta 小票（仅在特定阶段参与）</div>
                </div>
              </div>
            </div>

            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#1f2937' }}>适用人群</h3>
              <p style={{ fontSize: '0.95rem', lineHeight: '1.8', color: '#374151' }}>
                能承受中等回撤，有一定期权与衍生品概念，习惯按规则执行的主动投资者。
              </p>
            </div>
          </div>

          {/* 资产角色定义 */}
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '12px', padding: '24px' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '16px', color: '#166534', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '2rem' }}>📦</span>
              资产角色定义
            </h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #d1fae5' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '1.5rem' }}>💊</span>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#1f2937' }}>LLY - 礼来</h3>
                  <span style={{ fontSize: '0.85rem', color: '#6b7280', background: '#f3f4f6', padding: '4px 8px', borderRadius: '4px' }}>股票</span>
                </div>
              </div>

              <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #d1fae5' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '1.5rem' }}>💳</span>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#1f2937' }}>AXP - 美国运通</h3>
                  <span style={{ fontSize: '0.85rem', color: '#6b7280', background: '#f3f4f6', padding: '4px 8px', borderRadius: '4px' }}>股票</span>
                </div>
              </div>

              <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #d1fae5' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '1.5rem' }}>🔍</span>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#1f2937' }}>GOOGL - 谷歌</h3>
                  <span style={{ fontSize: '0.85rem', color: '#6b7280', background: '#f3f4f6', padding: '4px 8px', borderRadius: '4px' }}>股票</span>
                </div>
              </div>

              <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #d1fae5' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '1.5rem' }}>🔌</span>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#1f2937' }}>TSM - 台积电</h3>
                  <span style={{ fontSize: '0.85rem', color: '#6b7280', background: '#f3f4f6', padding: '4px 8px', borderRadius: '4px' }}>股票</span>
                </div>
              </div>

              <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #d1fae5' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '1.5rem' }}>🥈</span>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#1f2937' }}>PAAS - Pan American Silver</h3>
                  <span style={{ fontSize: '0.85rem', color: '#6b7280', background: '#f3f4f6', padding: '4px 8px', borderRadius: '4px' }}>股票</span>
                </div>
              </div>

              <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #d1fae5' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '1.5rem' }}>🚀</span>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#1f2937' }}>RKLB - Rocket Lab</h3>
                  <span style={{ fontSize: '0.85rem', color: '#6b7280', background: '#f3f4f6', padding: '4px 8px', borderRadius: '4px' }}>股票</span>
                </div>
              </div>

              <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #d1fae5' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '1.5rem' }}>🥇</span>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#1f2937' }}>GOLD - 黄金</h3>
                  <span style={{ fontSize: '0.85rem', color: '#6b7280', background: '#f3f4f6', padding: '4px 8px', borderRadius: '4px' }}>商品</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'assumptions' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* 假设前提 */}
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '12px', padding: '24px' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '16px', color: '#991b1b', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '2rem' }}>⚠️</span>
              前提假设
            </h2>
            <p style={{ fontSize: '0.95rem', lineHeight: '1.8', color: '#7f1d1d', marginBottom: '20px' }}>
              以下假设是这套策略的基础前提。如果这些假设不成立，策略需要相应调整。
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #fecaca' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>假设一：宏观环境</h3>
                <p style={{ fontSize: '0.95rem', lineHeight: '1.8', color: '#374151' }}>
                  美股 2026 年处在高估 + 滞涨或衰退尾声，存在一次中到大级别回撤。
                </p>
              </div>
              
              <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #fecaca' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>假设二：货币政策</h3>
                <p style={{ fontSize: '0.95rem', lineHeight: '1.8', color: '#374151' }}>
                  美联储在 2025–2026 年利率高位徘徊或缓慢下行，流动性不会立刻极度宽松。
                </p>
              </div>
              
              <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #fecaca' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>假设三：适用人群</h3>
                <p style={{ fontSize: '0.95rem', lineHeight: '1.8', color: '#374151' }}>
                  策略适合能承受中等回撤、可频繁调整仓位、有一定衍生品理解能力的投资者。
                </p>
              </div>
            </div>
          </div>

          {/* 宏观场景与对应策略 */}
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '12px', padding: '24px' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '16px', color: '#1e40af', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '2rem' }}>🌍</span>
              宏观场景与对应策略
            </h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>场景一：软着陆</h3>
                <p style={{ fontSize: '0.95rem', lineHeight: '1.8', color: '#374151', marginBottom: '8px' }}>
                  经济温和放缓，通胀回落，美联储逐步降息。
                </p>
                <p style={{ fontSize: '0.9rem', color: '#059669', fontWeight: '500' }}>
                  <strong>策略：</strong>保持 60-70% 权益仓位，重点关注优质成长股，减少杠杆 ETF 比例。
                </p>
              </div>
              
              <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>场景二：硬着陆</h3>
                <p style={{ fontSize: '0.95rem', lineHeight: '1.8', color: '#374151', marginBottom: '8px' }}>
                  经济快速衰退，失业率上升，企业盈利大幅下滑。
                </p>
                <p style={{ fontSize: '0.9rem', color: '#dc2626', fontWeight: '500' }}>
                  <strong>策略：</strong>提前减仓至 30-40% 权益，增加现金和黄金比例，等待极度恐慌后的抄底机会。
                </p>
              </div>
              
              <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>场景三：滞涨</h3>
                <p style={{ fontSize: '0.95rem', lineHeight: '1.8', color: '#374151', marginBottom: '8px' }}>
                  通胀居高不下，经济增长停滞，美联储进退两难。
                </p>
                <p style={{ fontSize: '0.9rem', color: '#f59e0b', fontWeight: '500' }}>
                  <strong>策略：</strong>降低权益仓位至 50%，增加贵金属（黄金、PAAS）配置，保持高现金比例。
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'indicators' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* 指标体系与优先级 */}
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '12px', padding: '24px' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '16px', color: '#1e40af', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '2rem' }}>📊</span>
              指标体系与优先级
            </h2>
            
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#1f2937' }}>一级指标（核心灵魂）</h3>
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '16px', marginBottom: '12px' }}>
                <div style={{ fontWeight: '600', marginBottom: '8px', color: '#dc2626' }}>🥇 Equity Put/Call Ratio</div>
                <p style={{ fontSize: '0.9rem', color: '#374151', marginBottom: '12px' }}>
                  散户情绪"体温计"，用于识别极度恐慌与过度乐观，确认抄底时机。
                </p>
              </div>
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '16px' }}>
                <div style={{ fontWeight: '600', marginBottom: '8px', color: '#dc2626' }}>🥈 Net GEX</div>
                <p style={{ fontSize: '0.9rem', color: '#374151' }}>
                  判断是否进入负 Gamma 崩盘区，决定是否禁止加仓高 Beta。
                </p>
              </div>
            </div>

            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#1f2937' }}>二级指标（辅助验证）</h3>
              <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '16px', marginBottom: '12px' }}>
                <div style={{ fontWeight: '600', marginBottom: '8px', color: '#f59e0b' }}>🥉 SPX Put/Call Ratio</div>
                <p style={{ fontSize: '0.9rem', color: '#374151', marginBottom: '12px' }}>
                  机构对冲意愿变化，辅助判断"防弹衣是否已脱"。
                </p>
              </div>
              <div style={{ background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '8px', padding: '16px' }}>
                <div style={{ fontWeight: '600', marginBottom: '8px', color: '#f59e0b' }}>4️⃣ VIX 及其期限结构</div>
                <p style={{ fontSize: '0.9rem', color: '#374151' }}>
                  观察恐慌程度与期限倒挂。
                </p>
              </div>
            </div>

            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#1f2937' }}>三级指标（专项工具）</h3>
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '16px' }}>
                <div style={{ fontWeight: '600', marginBottom: '8px', color: '#059669' }}>5️⃣ 金银比（Gold/Silver Ratio）</div>
                <p style={{ fontSize: '0.9rem', color: '#374151' }}>
                  用于在极端错价时调整黄金与白银矿仓位。
                </p>
              </div>
            </div>
          </div>

          {/* 指标阈值与行动表格 */}
          <div style={{ background: 'white', border: '2px solid #3b82f6', borderRadius: '12px', padding: '24px' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '20px', color: '#1e40af', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '2rem' }}>📋</span>
              指标阈值与行动表
            </h2>
            
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr style={{ background: '#eff6ff', borderBottom: '2px solid #3b82f6' }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: '#1e40af' }}>指标</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: '#1e40af' }}>条件</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: '#1e40af' }}>动作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937' }}>Equity Put/Call Ratio</td>
                    <td style={{ padding: '12px', color: '#374151' }}>0.5 &lt; P/C &lt; 0.8</td>
                    <td style={{ padding: '12px', color: '#374151' }}>情绪偏乐观，维持持仓，不再加仓高 Beta</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#fef2f2' }}>
                    <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937' }}>Equity Put/Call Ratio</td>
                    <td style={{ padding: '12px', color: '#374151' }}>P/C ≥ 1.1</td>
                    <td style={{ padding: '12px', color: '#dc2626', fontWeight: '600' }}>极度恐慌，启动 1/8 现金抄底 PAAS，如已持有则只加仓高分散度标的</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937' }}>SPX Put/Call Ratio</td>
                    <td style={{ padding: '12px', color: '#374151' }}>SPX P/C &lt; 0.9 且指数创新高</td>
                    <td style={{ padding: '12px', color: '#374151' }}>视为机构对冲意愿下降，逐步减仓 YINN/NVDA</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#fef2f2' }}>
                    <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937' }}>Net GEX</td>
                    <td style={{ padding: '12px', color: '#374151' }}>进入明显负 Gamma 区</td>
                    <td style={{ padding: '12px', color: '#dc2626', fontWeight: '600' }}>禁止加仓高 Beta（RKLB/YINN 等），只允许减仓或对冲</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937' }}>金银比</td>
                    <td style={{ padding: '12px', color: '#374151' }}>GSR &gt; 85–90</td>
                    <td style={{ padding: '12px', color: '#374151' }}>白银相对极度便宜，可把部分黄金敞口换成 PAAS 分批买入</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {activeSubTab === 'temperature' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* 周期温度总表 */}
          <div style={{ background: 'white', border: '2px solid #10b981', borderRadius: '12px', padding: '24px' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '20px', color: '#059669', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '2rem' }}>🌡️</span>
              周期温度总表（含当前评分）
            </h2>
            
            <div style={{ 
              background: '#f0fdf4', 
              border: '1px solid #86efac', 
              borderRadius: '8px', 
              padding: '16px',
              marginBottom: '20px'
            }}>
              <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '8px', color: '#166534' }}>
                评分规则统一
              </h3>
              <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8' }}>
                <div><strong>-2</strong>：非常差 / 高风险</div>
                <div><strong>-1</strong>：偏差</div>
                <div><strong>0</strong>：中性</div>
                <div><strong>+1</strong>：偏好</div>
                <div><strong>+2</strong>：非常好</div>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#d1fae5', borderBottom: '2px solid #10b981' }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: '#059669', border: '1px solid #86efac' }}>模块</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: '#059669', border: '1px solid #86efac' }}>指标</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: '#059669', border: '1px solid #86efac' }}>时间点</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: '#059669', border: '1px solid #86efac' }}>当前大致数据/状态</th>
                    <th style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#059669', border: '1px solid #86efac' }}>单项分数</th>
                  </tr>
                </thead>
                <tbody>
                  {/* 宏观增长 */}
                  <tr style={{ background: '#f9fafb' }}>
                    <td rowSpan={4} style={{ padding: '12px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', verticalAlign: 'top' }}>宏观增长</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>实质 GDP 增速（同比）</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>2025 Q3</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>约 2.3% 同比，温和扩张，高于衰退边缘 0–1%。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#059669', border: '1px solid #e5e7eb' }}>+1</td>
                  </tr>
                  <tr style={{ background: '#f9fafb' }}>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>失业率相对低点变化</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>2025-11</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>失业率约 4.6%，较疫情后低点抬升约 1 个百分点，明显降温。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#dc2626', border: '1px solid #e5e7eb' }}>-1</td>
                  </tr>
                  <tr style={{ background: '#f9fafb' }}>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>ISM 制造业（+服务）</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>2025-11</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>制造业约 48.2（连月&lt;50，收缩），服务在 50 上方，结构性偏弱。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#dc2626', border: '1px solid #e5e7eb' }}>-1</td>
                  </tr>
                  <tr style={{ background: '#fee2e2', borderTop: '2px solid #dc2626' }}>
                    <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb' }}>宏观小计</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}></td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>温和放缓，尚未到衰退。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#dc2626', border: '1px solid #e5e7eb' }}>-1</td>
                  </tr>

                  {/* 通胀&政策 */}
                  <tr>
                    <td rowSpan={3} style={{ padding: '12px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', verticalAlign: 'top' }}>通胀&政策</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>核心 PCE（同比）</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>2025（预估区间）</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>约 2.5–3%，明显低于高通胀期，但略高于 2% 目标，通胀基本受控未完全"安全"。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#6b7280', border: '1px solid #e5e7eb' }}>0</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>实际利率（联邦基金-核心PCE）</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>2025 Q4</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>名义利率约 4.75–5%，实际利率约 +1.5%，偏紧但不极端。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#6b7280', border: '1px solid #e5e7eb' }}>0</td>
                  </tr>
                  <tr style={{ background: '#f3f4f6', borderTop: '2px solid #6b7280' }}>
                    <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb' }}>通胀小计</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}></td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>通胀回落 + 实际利率为正，偏紧环境。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#6b7280', border: '1px solid #e5e7eb' }}>0</td>
                  </tr>

                  {/* 金融风险 */}
                  <tr style={{ background: '#f9fafb' }}>
                    <td rowSpan={4} style={{ padding: '12px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', verticalAlign: 'top' }}>金融风险</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>收益率曲线 10Y–2Y 利差</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>2025-12</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>接近 0%，从深度倒挂向趋平过渡，处在敏感阶段。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#dc2626', border: '1px solid #e5e7eb' }}>-1</td>
                  </tr>
                  <tr style={{ background: '#f9fafb' }}>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>银行整体 NPL 比率</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>2025-09</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>不良贷款约 1.5%，远低于 2008 高位 &gt;7%，系统性风险低。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#059669', border: '1px solid #e5e7eb' }}>+1</td>
                  </tr>
                  <tr style={{ background: '#f9fafb' }}>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>商业地产/消费坏账</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>2025 Q3 / 2025-11</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>CRE 逾期约 5.7–6.3%，明显高于疫情前；信用卡、汽车贷拖欠上升。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#dc2626', border: '1px solid #e5e7eb' }}>-1</td>
                  </tr>
                  <tr style={{ background: '#fee2e2', borderTop: '2px solid #dc2626' }}>
                    <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb' }}>金融小计</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}></td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>系统稳健、局部（CRE & 弱信用消费）压力较大。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#dc2626', border: '1px solid #e5e7eb' }}>-1</td>
                  </tr>

                  {/* 盈利&估值 */}
                  <tr>
                    <td rowSpan={4} style={{ padding: '12px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', verticalAlign: 'top' }}>盈利&估值</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>S&P 500 EPS 增速</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>2025 Q3</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>一致预期 2025 EPS 同比约 +10–12%，由 AI/科技权重股强力驱动。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#059669', border: '1px solid #e5e7eb' }}>+2</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>TTM / 前瞻 P/E 分位</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>2025-12</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>TTM 约 28–30 倍，前瞻 22–23 倍，明显高于 10–30 年历史中值，高位估值。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#dc2626', border: '1px solid #e5e7eb' }}>-1</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>CAPE（席勒市盈率）</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>2025-12</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>约 35–40，接近历史高位区间，长期回报隐含偏低。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#dc2626', border: '1px solid #e5e7eb' }}>-1</td>
                  </tr>
                  <tr style={{ background: '#f3f4f6', borderTop: '2px solid #6b7280' }}>
                    <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb' }}>盈利小计</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}></td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>盈利强但估值明显偏贵，整体互相抵消。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#6b7280', border: '1px solid #e5e7eb' }}>0</td>
                  </tr>

                  {/* 情绪&结构 */}
                  <tr style={{ background: '#f9fafb' }}>
                    <td rowSpan={6} style={{ padding: '12px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', verticalAlign: 'top' }}>情绪&结构</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>VIX</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>2025-12</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>约 14，低于长期均值 18–20，在高估值背景下偏自满。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#dc2626', border: '1px solid #e5e7eb' }}>-1</td>
                  </tr>
                  <tr style={{ background: '#f9fafb' }}>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>市场广度</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>2025 Q3–Q4</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>Great 8 对 EPS 和指数贡献极大，其余板块滞后，上涨高度集中。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#dc2626', border: '1px solid #e5e7eb' }}>-1</td>
                  </tr>
                  <tr style={{ background: '#f9fafb' }}>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>Put/Call 比</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>2025-12</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>中性偏乐观，没有明显恐慌对冲，偏"相信软着陆"。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#6b7280', border: '1px solid #e5e7eb' }}>0</td>
                  </tr>
                  <tr style={{ background: '#f9fafb' }}>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>股市占家庭金融资产比重</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>2025-09 左右</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>股票占家庭金融资产 &gt;50%，高于 2000 与 2021 高点，历史极高。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#991b1b', border: '1px solid #e5e7eb' }}>-2</td>
                  </tr>
                  <tr style={{ background: '#f9fafb' }}>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>保证金融资余额（同比）</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>2025-10</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>融资余额约 1.13 万亿美元，同比增约 38.5%，创历史新高且加速加杠杆。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#991b1b', border: '1px solid #e5e7eb' }}>-2</td>
                  </tr>
                  <tr style={{ background: '#fee2e2', borderTop: '2px solid #dc2626' }}>
                    <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb' }}>情绪小计（内部合计 -6，映射到 -2）</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}></td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>极度拥挤：家庭高配股权 + 高杠杆 + 低波动 + 头部抱团。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#991b1b', border: '1px solid #e5e7eb' }}>-2</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 汇总打分与解读 */}
          <div style={{ background: '#fffbeb', border: '2px solid #fbbf24', borderRadius: '12px', padding: '24px' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '20px', color: '#92400e', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '2rem' }}>📊</span>
              汇总打分与解读
            </h2>
            
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#1f2937' }}>各模块得分</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #fee2e2' }}>
                  <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '4px' }}>宏观增长</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#dc2626' }}>-1</div>
                </div>
                <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                  <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '4px' }}>通胀&政策</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#6b7280' }}>0</div>
                </div>
                <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #fee2e2' }}>
                  <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '4px' }}>金融风险</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#dc2626' }}>-1</div>
                </div>
                <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                  <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '4px' }}>盈利&估值</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#6b7280' }}>0</div>
                </div>
                <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #fee2e2' }}>
                  <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '4px' }}>情绪&结构</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#991b1b' }}>-2</div>
                </div>
              </div>
            </div>

            <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '2px solid #fbbf24', marginBottom: '20px' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#1f2937' }}>
                总分 = -1 + 0 -1 + 0 -2 = <strong style={{ fontSize: '1.5rem', color: '#dc2626' }}>-4</strong>
              </div>
              <div style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '16px' }}>
                （理论总区间为 -10 ～ +10）
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#1f2937' }}>简化区间解读</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '12px' }}>
                <div style={{ background: '#d1fae5', padding: '12px', borderRadius: '8px', border: '1px solid #86efac' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#166534', marginBottom: '4px' }}>+6 ～ +10</div>
                  <div style={{ fontSize: '0.8rem', color: '#374151' }}>景气偏高 + 估值不贵，适合偏多头</div>
                </div>
                <div style={{ background: '#dbeafe', padding: '12px', borderRadius: '8px', border: '1px solid #93c5fd' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#1e40af', marginBottom: '4px' }}>+1 ～ +5</div>
                  <div style={{ fontSize: '0.8rem', color: '#374151' }}>中性偏好，重择股与结构</div>
                </div>
                <div style={{ background: '#f3f4f6', padding: '12px', borderRadius: '8px', border: '1px solid #d1d5db' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#374151', marginBottom: '4px' }}>-1 ～ 0</div>
                  <div style={{ fontSize: '0.8rem', color: '#374151' }}>中性偏防守</div>
                </div>
                <div style={{ background: '#fee2e2', padding: '12px', borderRadius: '8px', border: '1px solid #fecaca' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#991b1b', marginBottom: '4px' }}>-5 ～ -2</div>
                  <div style={{ fontSize: '0.8rem', color: '#374151' }}>高风险晚周期，适合降风险/降杠杆</div>
                </div>
                <div style={{ background: '#fef2f2', padding: '12px', borderRadius: '8px', border: '1px solid #fecaca' }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#991b1b', marginBottom: '4px' }}>&lt; -5</div>
                  <div style={{ fontSize: '0.8rem', color: '#374151' }}>极高风险，通常对应衰退或泡沫尾声/危机前后</div>
                </div>
              </div>
            </div>

            <div style={{ background: '#fef2f2', padding: '20px', borderRadius: '8px', border: '2px solid #dc2626' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#991b1b' }}>
                当前约 -4，对应：
              </h3>
              <ul style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8', paddingLeft: '20px', margin: 0 }}>
                <li style={{ marginBottom: '8px' }}>
                  <strong>宏观：</strong>放缓但未崩（不像已在衰退）
                </li>
                <li style={{ marginBottom: '8px' }}>
                  <strong>通胀&政策：</strong>通胀可控但利率偏紧，对估值与边缘主体构成压制
                </li>
                <li style={{ marginBottom: '8px' }}>
                  <strong>金融：</strong>系统稳，局部（CRE+弱信用消费）有压力，是潜在放大器
                </li>
                <li>
                  <strong>美股：</strong>盈利好、估值贵、情绪乐观、家户与杠杆暴露极高，典型晚周期画像
                </li>
              </ul>
            </div>

            <div style={{ marginTop: '20px', padding: '16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '8px', color: '#1e40af' }}>
                💡 进一步量化建议
              </h3>
              <p style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.6', margin: 0 }}>
                如果你希望进一步量化，可以给每个模块设权重（例如宏观 25%，金融风险 25%，估值 25%，情绪&结构 25% 或你自定义），
                按权重计算加权总分，把这张表变成一个可回测/可更新的小模型。
              </p>
            </div>
          </div>
        </div>
      )}
      {activeSubTab === 'china-temperature' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* 中国周期温度总表 */}
          <div style={{ background: 'white', border: '2px solid #ef4444', borderRadius: '12px', padding: '24px' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '20px', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '2rem' }}>🌡️</span>
              中国周期温度总表（升级版，含新增杠杆/地产/两融）
            </h2>
            
            <div style={{ 
              background: '#fef2f2', 
              border: '1px solid #fecaca', 
              borderRadius: '8px', 
              padding: '16px',
              marginBottom: '20px'
            }}>
              <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '8px', color: '#991b1b' }}>
                评分规则统一
              </h3>
              <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8' }}>
                <div><strong>-2</strong>：非常差 / 高风险</div>
                <div><strong>-1</strong>：偏差</div>
                <div><strong>0</strong>：中性</div>
                <div><strong>+1</strong>：偏好</div>
                <div><strong>+2</strong>：非常好</div>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#fee2e2', borderBottom: '2px solid #ef4444' }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: '#dc2626', border: '1px solid #fecaca' }}>模块</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: '#dc2626', border: '1px solid #fecaca' }}>指标</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: '#dc2626', border: '1px solid #fecaca' }}>时间点</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: '#dc2626', border: '1px solid #fecaca' }}>当前大致数据/状态</th>
                    <th style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#dc2626', border: '1px solid #fecaca' }}>单项分数</th>
                  </tr>
                </thead>
                <tbody>
                  {/* 宏观增长 */}
                  <tr style={{ background: '#f9fafb' }}>
                    <td rowSpan={4} style={{ padding: '12px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', verticalAlign: 'top' }}>宏观增长</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>实质 GDP 增速（同比）</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>2025 Q3</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>同比约 4.8%，全年接近官方"5% 左右"目标，靠政策托底维持中高速。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#059669', border: '1px solid #e5e7eb' }}>+1</td>
                  </tr>
                  <tr style={{ background: '#f9fafb' }}>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>失业率（城镇调查）</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>2025-11</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>约 5.1%，略低于历史均值 5.24%，较年内高点 5.4% 有小幅回落，就业偏弱但未恶化失控。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#6b7280', border: '1px solid #e5e7eb' }}>0</td>
                  </tr>
                  <tr style={{ background: '#f9fafb' }}>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>制造业 PMI</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>2025-11</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>49.2，连续在 50 下方，略有改善但仍为收缩，高技术制造 PMI 在 50 上方。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#dc2626', border: '1px solid #e5e7eb' }}>-1</td>
                  </tr>
                  <tr style={{ background: '#f3f4f6', borderTop: '2px solid #6b7280' }}>
                    <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb' }}>宏观小计</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}></td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>增速尚可，就业稳定，但制造业偏弱，整体为"温和复苏、非高景气"。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#6b7280', border: '1px solid #e5e7eb' }}>0</td>
                  </tr>

                  {/* 通胀&政策 */}
                  <tr>
                    <td rowSpan={3} style={{ padding: '12px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', verticalAlign: 'top' }}>通胀&政策</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>核心 CPI（同比）</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>2025-11</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>核心 CPI 同比约 1.2%，通胀压力极低，略有通缩风险，但为宽松货币与财政政策提供空间。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#059669', border: '1px solid #e5e7eb' }}>+1</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>利率 & 实际利率（LPR vs 通胀）</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>2025-11</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>1 年期 LPR 约 3.0%，通胀约 0.7–1.2%，实际利率为正但不高，整体偏宽松。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#059669', border: '1px solid #e5e7eb' }}>+1</td>
                  </tr>
                  <tr style={{ background: '#d1fae5', borderTop: '2px solid #10b981' }}>
                    <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb' }}>通胀小计</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}></td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>通胀温和 + 利率不高，政策宽松空间充足，相比美国环境友好。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#059669', border: '1px solid #e5e7eb' }}>+2</td>
                  </tr>

                  {/* 制造业&利润 */}
                  <tr style={{ background: '#f9fafb' }}>
                    <td rowSpan={3} style={{ padding: '12px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', verticalAlign: 'top' }}>制造业&利润</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>规上工业营业收入利润率</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>2025 H1</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>利润率约 5.15%，较 2021 高位持续下滑，说明制造业盈利能力在低位徘徊。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#dc2626', border: '1px solid #e5e7eb' }}>-1</td>
                  </tr>
                  <tr style={{ background: '#f9fafb' }}>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>工业利润增速</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>2025-11（1–11 月）</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>2024 年下滑后，2025 年恢复小幅正增长，属于"低位修复"，远未回归高景气。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#6b7280', border: '1px solid #e5e7eb' }}>0</td>
                  </tr>
                  <tr style={{ background: '#fee2e2', borderTop: '2px solid #dc2626' }}>
                    <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb' }}>制造业小计</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}></td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>利润率连续几年走弱，目前是"低位企稳"，对整体经济是拖累而不是引擎。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#dc2626', border: '1px solid #e5e7eb' }}>-1</td>
                  </tr>

                  {/* 金融&信用 */}
                  <tr>
                    <td rowSpan={5} style={{ padding: '12px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', verticalAlign: 'top' }}>金融&信用</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>房地产投资/销售 & 库存（新增维度）</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>2025 Q1–Q3</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>房地产投资占 GDP 比例自 2014 年近 15% 降至 2024 年约 7.4%；新开工、销售面积持续同比负增长，库存创 2018 来新高。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#dc2626', border: '1px solid #e5e7eb' }}>-1</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>居民部门杠杆率（新增）</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>2025 Q3</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>居民债务/GDP 约 60.4%，接近 2024 年 62% 的历史高位，近一年略有回落但处高杠杆平台。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#dc2626', border: '1px solid #e5e7eb' }}>-1</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>整体非金融部门债务（新增）</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>2024 末</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>非金融部门债务约 312% GDP，高于多数新兴经济体，去杠杆与增长之间存在长期拉扯。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#dc2626', border: '1px solid #e5e7eb' }}>-1</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>银行体系稳定性（含地产风险）</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>2025</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>银行资本充足率尚可，通过展期、再融资等方式部分"软着陆"地产风险，未出现系统性挤兑/银行危机。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#6b7280', border: '1px solid #e5e7eb' }}>0</td>
                  </tr>
                  <tr style={{ background: '#fee2e2', borderTop: '2px solid #dc2626' }}>
                    <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb' }}>金融小计</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}></td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>高杠杆+地产深度调整，但通过行政和金融工具缓冲，系统性风险暂可控，属于"慢修复 + 高杠杆"。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#991b1b', border: '1px solid #e5e7eb' }}>-2</td>
                  </tr>

                  {/* 估值&股市 */}
                  <tr style={{ background: '#f9fafb' }}>
                    <td rowSpan={4} style={{ padding: '12px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', verticalAlign: 'top' }}>估值&股市</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>A 股估值：CSI 300 TTM P/E</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>2025-12</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>约 15.2 倍，接近或略低于近 10 年中值，远低于美股，属于"估值便宜至中性"。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#059669', border: '1px solid #e5e7eb' }}>+1</td>
                  </tr>
                  <tr style={{ background: '#f9fafb' }}>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>中小盘估值（中证 500/1000）（新增）</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>2025-12</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>中证 500/1000 P/E 普遍低于自身历史中枢，PB 多在 1 倍附近，体现出"深折价+情绪冷"。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#059669', border: '1px solid #e5e7eb' }}>+1</td>
                  </tr>
                  <tr style={{ background: '#f9fafb' }}>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>A 股盈利与 ROE</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>2025</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>指数层面盈利增速中低个位数，ROE 中枢不高，更多是"低估值补偿"而非高质量成长溢价。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#6b7280', border: '1px solid #e5e7eb' }}>0</td>
                  </tr>
                  <tr style={{ background: '#d1fae5', borderTop: '2px solid #10b981' }}>
                    <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb' }}>估值小计</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}></td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>整体估值不贵甚至偏便宜，尤其是中小盘与部分价值板块；盈利和 ROE 中枢一般。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#059669', border: '1px solid #e5e7eb' }}>+2</td>
                  </tr>

                  {/* 情绪&资金结构 */}
                  <tr>
                    <td rowSpan={4} style={{ padding: '12px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', verticalAlign: 'top' }}>情绪&资金结构</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>市场情绪（波动、成交）（定性）</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>2025</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>大部分时间波动率不高，成交偏低迷，居民入市热情不高，缺乏"全民炒股"特征。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#059669', border: '1px solid #e5e7eb' }}>+1</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>两融余额 / 杠杆水平（新增）</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>2025-08</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>融资融券余额约 2.01 万亿元，时隔多年首次重回 2 万亿以上，但相对总市值占比仍低于 2015 杠杆牛阶段。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#6b7280', border: '1px solid #e5e7eb' }}>0</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>居民直接持股/基金参与（新增，定性）</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>2025</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>居民财富主要仍集中在地产和理财，股权配置占比低于美国家庭资产结构，A 股并未高配到极端。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#059669', border: '1px solid #e5e7eb' }}>+1</td>
                  </tr>
                  <tr style={{ background: '#d1fae5', borderTop: '2px solid #10b981' }}>
                    <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb' }}>情绪小计</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}></td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>相对美股：情绪偏冷、杠杆适中、居民股权暴露不高，更像"低位磨底中的市场"。</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#059669', border: '1px solid #e5e7eb' }}>+2</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 汇总打分与解读 */}
          <div style={{ background: '#fffbeb', border: '2px solid #fbbf24', borderRadius: '12px', padding: '24px' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '20px', color: '#92400e', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '2rem' }}>📊</span>
              更新后中国"周期温度"综合评分
            </h2>
            
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#1f2937' }}>各模块得分</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                  <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '4px' }}>宏观增长</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#6b7280' }}>0</div>
                </div>
                <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #d1fae5' }}>
                  <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '4px' }}>通胀&政策</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#059669' }}>+2</div>
                </div>
                <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #fee2e2' }}>
                  <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '4px' }}>制造业&利润</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#dc2626' }}>-1</div>
                </div>
                <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #fee2e2' }}>
                  <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '4px' }}>金融&信用</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#991b1b' }}>-2</div>
                </div>
                <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #d1fae5' }}>
                  <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '4px' }}>估值&股市</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#059669' }}>+2</div>
                </div>
                <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #d1fae5' }}>
                  <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '4px' }}>情绪&资金结构</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#059669' }}>+2</div>
                </div>
              </div>
            </div>

            <div style={{ background: 'white', padding: '20px', borderRadius: '8px', border: '2px solid #fbbf24', marginBottom: '20px' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#1f2937' }}>
                总分 = 0 + 2 - 1 - 2 + 2 + 2 = <strong style={{ fontSize: '1.5rem', color: '#059669' }}>+3</strong>
              </div>
              <div style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '16px' }}>
                （理论总区间为 -10 ～ +10）
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#1f2937' }}>结构分析</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
                <div style={{ background: '#d1fae5', padding: '16px', borderRadius: '8px', border: '1px solid #86efac' }}>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: '600', color: '#166534', marginBottom: '8px' }}>✅ 正向支撑</h4>
                  <ul style={{ fontSize: '0.85rem', color: '#374151', lineHeight: '1.8', paddingLeft: '20px', margin: 0 }}>
                    <li>通胀低+政策空间大（+2）</li>
                    <li>A 股整体估值不贵/中小盘深折价（+2）</li>
                    <li>市场情绪偏冷+杠杆不高（+2）</li>
                  </ul>
                </div>
                <div style={{ background: '#fee2e2', padding: '16px', borderRadius: '8px', border: '1px solid #fecaca' }}>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: '600', color: '#991b1b', marginBottom: '8px' }}>⚠️ 负向拖累</h4>
                  <ul style={{ fontSize: '0.85rem', color: '#374151', lineHeight: '1.8', paddingLeft: '20px', margin: 0 }}>
                    <li>制造业利润率偏弱（-1）</li>
                    <li>高杠杆+地产长周期调整（-2）</li>
                  </ul>
                </div>
              </div>
            </div>

            <div style={{ background: '#eff6ff', padding: '20px', borderRadius: '8px', border: '2px solid #3b82f6', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#1e40af' }}>
                🌍 中美对比
              </h3>
              <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8' }}>
                <p style={{ marginBottom: '12px' }}>
                  <strong>美国（总分约 -4）：</strong>景气&gt;估值&gt;风险 —— 当前盈利不错，但估值贵、杠杆高、情绪偏乐观。
                </p>
                <p style={{ margin: 0 }}>
                  <strong>中国（总分约 +3）：</strong>估值/政策&gt;景气 —— 当前景气一般甚至偏弱，但估值低、情绪冷、政策空间大，杠杆/地产是主要"尾部风险来源"。
                </p>
              </div>
            </div>

            <div style={{ marginTop: '20px', padding: '16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: '600', marginBottom: '8px', color: '#166534' }}>
                💡 后续建议
              </h3>
              <p style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.6', margin: 0 }}>
                可以基于这两张表设定权重（例如更看重"金融&信用"和"估值&股市"），做一个"中美相对吸引力分数"，直接指导大类资产/地区的 Beta 配置。
              </p>
            </div>
          </div>
        </div>
      )}



      {activeSubTab === 'stages' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* 当前持仓与黄金分析 */}
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '24px' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '16px', color: '#92400e', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '2rem' }}>💰</span>
              当前持仓与黄金分析
            </h2>
            
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontSize: '0.95rem', lineHeight: '1.8', color: '#78350f', marginBottom: '12px' }}>
                您的组合包括 <strong>LLY、AXP、GOOGL、TSM、PAAS、RKLB、GOLD</strong>（黄金商品，假设为黄金相关资产如GLD ETF或Barrick Gold股票），每个约12.5%，加上现金12.5%。黄金部分（GOLD + PAAS）占约25%，提供通胀对冲和防御。
              </p>
              <p style={{ fontSize: '0.95rem', lineHeight: '1.8', color: '#78350f', marginBottom: '12px' }}>
                <strong>2025年黄金表现：</strong>金价从年初约$2450/盎司涨至年末约$3900/盎司（基于GLD代理），YTD +59%，受益于地缘不确定、中央银行购买和关税影响。然而，2025后期涨幅放缓（7-8月微跌），显示潜在峰值。
              </p>
            </div>

            <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #fde68a', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#1f2937' }}>黄金卖出时机</h3>
              <p style={{ fontSize: '0.9rem', color: '#374151', marginBottom: '8px' }}>不宜盲目持有。基于2025市场，卖出信号包括：</p>
              <ul style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8', paddingLeft: '20px' }}>
                <li><strong>宏观指标：</strong>利率上升（10年美债收益率&gt;4%），美元强势（DXY&gt;105），通胀回落（CPI&lt;2%），这些削弱黄金吸引力。</li>
                <li><strong>技术信号：</strong>金价回调&gt;10%从峰值，或金/道指比率接近1:1（当前约0.08，远未到）。银/金比率&lt;30:1也暗示过热。</li>
                <li><strong>市场周期：</strong>在权益牛市（如金屋行情）卖出，转入成长股；泡沫后期若VIX&gt;20，渐减。</li>
                <li><strong>个人规则：</strong>设定止盈（如+20% YTD卖1/3），或若相信2026继续涨（J.P. Morgan预测更高），持有。</li>
              </ul>
              <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '12px', fontStyle: 'italic' }}>
                当前（2025.12.27）：金价高位稳定，但若美联储加息信号强，考虑减仓5-10%。
              </p>
            </div>
          </div>

          {/* 优化后组合 */}
          <div style={{ background: 'white', border: '2px solid #10b981', borderRadius: '12px', padding: '24px' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '20px', color: '#059669', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '2rem' }}>📊</span>
              优化后组合（整合黄金卖出）
            </h2>
            <p style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '16px' }}>
              比例微调：保持黄金10-15%，但添加卖出阈值（如&gt; +20%卖部分）。
            </p>
            
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#d1fae5', borderBottom: '2px solid #10b981' }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: '#059669' }}>资产</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: '#059669' }}>优化比例</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: '#059669' }}>理由</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: '#059669' }}>当前YTD</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: '#059669' }}>Beta（约）</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937' }}>LLY</td>
                    <td style={{ padding: '12px', color: '#374151' }}>20%</td>
                    <td style={{ padding: '12px', color: '#374151' }}>制药增长</td>
                    <td style={{ padding: '12px', color: '#059669' }}>+0.79%</td>
                    <td style={{ padding: '12px', color: '#374151' }}>0.8</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937' }}>AXP</td>
                    <td style={{ padding: '12px', color: '#374151' }}>15%</td>
                    <td style={{ padding: '12px', color: '#374151' }}>金融稳定</td>
                    <td style={{ padding: '12px', color: '#059669' }}>+0.55%</td>
                    <td style={{ padding: '12px', color: '#374151' }}>1.4</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937' }}>GOOGL</td>
                    <td style={{ padding: '12px', color: '#374151' }}>15%</td>
                    <td style={{ padding: '12px', color: '#374151' }}>AI领导</td>
                    <td style={{ padding: '12px', color: '#059669' }}>+0.07%</td>
                    <td style={{ padding: '12px', color: '#374151' }}>1.1</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937' }}>TSM</td>
                    <td style={{ padding: '12px', color: '#374151' }}>20%</td>
                    <td style={{ padding: '12px', color: '#374151' }}>半导体核心</td>
                    <td style={{ padding: '12px', color: '#059669' }}>+2.07%</td>
                    <td style={{ padding: '12px', color: '#374151' }}>1.3</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937' }}>PAAS</td>
                    <td style={{ padding: '12px', color: '#374151' }}>10%</td>
                    <td style={{ padding: '12px', color: '#374151' }}>银矿对冲</td>
                    <td style={{ padding: '12px', color: '#059669' }}>+5.69%</td>
                    <td style={{ padding: '12px', color: '#374151' }}>1.5</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937' }}>RKLB</td>
                    <td style={{ padding: '12px', color: '#374151' }}>10%</td>
                    <td style={{ padding: '12px', color: '#374151' }}>航天潜力</td>
                    <td style={{ padding: '12px', color: '#dc2626' }}>-2.00%</td>
                    <td style={{ padding: '12px', color: '#374151' }}>2.0</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#fef3c7' }}>
                    <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937' }}>GOLD</td>
                    <td style={{ padding: '12px', color: '#374151' }}>10%</td>
                    <td style={{ padding: '12px', color: '#374151' }}>黄金商品；卖出若回调&gt;10%或利率升</td>
                    <td style={{ padding: '12px', color: '#059669' }}>+3.03%</td>
                    <td style={{ padding: '12px', color: '#374151' }}>0.9</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937' }}>现金/TLT</td>
                    <td style={{ padding: '12px', color: '#374151' }}>10%/5%</td>
                    <td style={{ padding: '12px', color: '#374151' }}>防御</td>
                    <td style={{ padding: '12px', color: '#6b7280' }}>N/A</td>
                    <td style={{ padding: '12px', color: '#374151' }}>低</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#fee2e2' }}>
                    <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937' }}>做空工具</td>
                    <td style={{ padding: '12px', color: '#374151' }}>&lt;5-10%</td>
                    <td style={{ padding: '12px', color: '#374151' }}>熊市对冲</td>
                    <td style={{ padding: '12px', color: '#6b7280' }}>N/A</td>
                    <td style={{ padding: '12px', color: '#374151' }}>高负</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 市场阶段与操作规则表格 */}
          <div style={{ background: 'white', border: '2px solid #3b82f6', borderRadius: '12px', padding: '24px' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '20px', color: '#1e40af', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '2rem' }}>📈</span>
              基于市场周期的动态策略（融入持仓+做空+黄金卖出）
            </h2>
            
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                <thead>
                  <tr style={{ background: '#eff6ff', borderBottom: '2px solid #3b82f6' }}>
                    <th style={{ padding: '10px', textAlign: 'left', fontWeight: '700', color: '#1e40af' }}>阶段</th>
                    <th style={{ padding: '10px', textAlign: 'left', fontWeight: '700', color: '#1e40af' }}>情绪与指标特征</th>
                    <th style={{ padding: '10px', textAlign: 'left', fontWeight: '700', color: '#1e40af' }}>仓位大致范围</th>
                    <th style={{ padding: '10px', textAlign: 'left', fontWeight: '700', color: '#1e40af' }}>分沽操作</th>
                    <th style={{ padding: '10px', textAlign: 'left', fontWeight: '700', color: '#1e40af' }}>基准操作</th>
                    <th style={{ padding: '10px', textAlign: 'left', fontWeight: '700', color: '#1e40af' }}>做空部分</th>
                    <th style={{ padding: '10px', textAlign: 'left', fontWeight: '700', color: '#1e40af' }}>黄金卖出规则</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f0fdf4' }}>
                    <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937' }}>金屋行情</td>
                    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>指数创新高，P/C &lt;0.7，VIX &lt;15</td>
                    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>权益70-80%，商品15-20%，现金5%</td>
                    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>持有LLY/TSM/GOOGL，加RKLB</td>
                    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>增科技，监控AI</td>
                    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>无</td>
                    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>持有GOLD/PAAS；若金价+20% YTD，卖1/3转权益（如TSM）</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#fff7ed' }}>
                    <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937' }}>泡沫初期</td>
                    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>指数高位，P/C 0.7-1.0，VIX 15-20</td>
                    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>权益60-70%，商品20-25%，现金10%</td>
                    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>减RKLB，转GOOGL</td>
                    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>加TLT；止盈&gt;10%</td>
                    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>1-3% SQQQ</td>
                    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>监控金价峰值；若美债&gt;4%，卖GOLD 20%，转现金</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#fef2f2' }}>
                    <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937' }}>泡沫后期</td>
                    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>指数急跌，Net GEX负大，VIX &gt;20</td>
                    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>权益40-50%，商品25-30%，现金20-30%</td>
                    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>只减不加；VIX PUT。止损-8%</td>
                    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>移仓PAAS/GOLD；限交易</td>
                    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>5-10% SQQQ/SPXS</td>
                    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>持有作为防御；但若美元&gt;105，卖GOLD 30%，避回调</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#fef2f2' }}>
                    <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937' }}>中期筑底</td>
                    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>Equity P/C &gt;1.2，VIX &lt;30回落</td>
                    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>权益30-40%，商品30%，现金30-40%</td>
                    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>1/8现金买PAAS/GOLD</td>
                    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>All in优质；增商品若CPI&gt;3%</td>
                    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>3-5% SPXS</td>
                    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>增持GOLD；卖出信号弱，观察通胀降&lt;2%再减</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f0fdf4' }}>
                    <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937' }}>熊市后期</td>
                    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>指数比跌，P/C 中性，VIX &lt;20</td>
                    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>权益60-70%，商品20-25%，现金10%</td>
                    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>增TSM/GOOGL</td>
                    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>再平衡，卖&lt; -5%</td>
                    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>5% short弱势</td>
                    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>若权益反弹，卖GOLD/PAAS 20%，转成长股；金/道指&gt;0.1持，否则卖</td>
                  </tr>
                  <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f0fdf4' }}>
                    <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937' }}>筑底回升</td>
                    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>指数止跌，P/C 中性，VIX &lt;15</td>
                    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>权益60-70%，商品20-25%，现金10-15%</td>
                    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>加LLY/AXP；止损-5%</td>
                    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>观察美联储，加权益</td>
                    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>&lt;3%局部</td>
                    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>渐减GOLD若价格稳定高位；卖若回调&gt;10%，或2026预测转弱</td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            <div style={{ marginTop: '20px', padding: '16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px' }}>
              <p style={{ fontSize: '0.85rem', color: '#1e40af', lineHeight: '1.6', marginBottom: '8px' }}>
                <strong>实施：</strong>每周查指标（如VIX、DXY），季度再平衡。回测显示添加卖出规则可减波动15%。
              </p>
              <p style={{ fontSize: '0.75rem', color: '#6b7280', fontStyle: 'italic' }}>
                非建议，咨询顾问。
              </p>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'execution' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* 市场情绪分析器 - 保留原有功能 */}
          <div style={{ 
            background: 'white', 
            border: '2px solid #3b82f6', 
            borderRadius: '12px', 
            padding: '24px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ 
              fontWeight: '700', 
              fontSize: '1.2rem', 
              marginBottom: '16px', 
              color: '#1f2937',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              borderBottom: '2px solid #3b82f6',
              paddingBottom: '12px'
            }}>
              <span style={{ fontSize: '1.5rem' }}>📈</span>
              市场情绪与崩盘信号分析器
            </h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* 数据获取部分 - 保留原有代码 */}
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                marginBottom: '12px',
                padding: '12px',
                background: '#eff6ff',
                borderRadius: '8px',
                flexWrap: 'wrap',
                gap: '8px'
              }}>
                <span style={{ fontSize: '0.9rem', fontWeight: '600', color: '#1e40af' }}>
                  📊 数据获取
                </span>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    onClick={handleFetchPCRatios}
                    disabled={loadingPCRatios}
                    style={{
                      padding: '8px 16px',
                      background: loadingPCRatios ? '#9ca3af' : '#3b82f6',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '0.85rem',
                      fontWeight: '500',
                      cursor: loadingPCRatios ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    {loadingPCRatios ? '⏳ 获取中...' : '🔄 自动获取 P/C Ratio'}
                  </button>
                  <button
                    onClick={() => window.open('https://www.cboe.com/us/options/market_statistics/daily/', '_blank')}
                    style={{
                      padding: '8px 16px',
                      background: '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '0.85rem',
                      fontWeight: '500',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    🔗 打开 CBOE 页面
                  </button>
                </div>
              </div>

              {/* 优先级排名和实战清单 */}
              <div style={{ 
                padding: '12px', 
                background: '#fef2f2', 
                border: '1px solid #fecaca',
                borderRadius: '8px', 
                fontSize: '0.85rem', 
                color: '#991b1b',
                lineHeight: '1.6',
                marginBottom: '12px'
              }}>
                <div style={{ fontWeight: '700', marginBottom: '10px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  🏆 指标优先级排名（实战有效性）
                </div>
                <div style={{ marginBottom: '8px', padding: '8px', background: 'rgba(255,255,255,0.5)', borderRadius: '6px' }}>
                  <div style={{ fontWeight: '600', marginBottom: '4px', color: '#dc2626' }}>🥇 第一名：Equity Put/Call Ratio（核心灵魂）</div>
                  <div style={{ fontSize: '0.8rem', paddingLeft: '8px' }}>散户情绪"体温计"，确认抄底时机。只有当它 &gt; 1.1 甚至冲向 1.3 时，才是 1/8 现金进场的安全红灯。</div>
                </div>
                <div style={{ marginBottom: '8px', padding: '8px', background: 'rgba(255,255,255,0.5)', borderRadius: '6px' }}>
                  <div style={{ fontWeight: '600', marginBottom: '4px', color: '#f59e0b' }}>🥈 第二名：Net GEX（波动引擎）</div>
                  <div style={{ fontSize: '0.8rem', paddingLeft: '8px' }}>预测崩盘速度。一旦转负，做市商会助跌，股价会快速下跌。判断"要不要再等更低点"的关键指标。</div>
                </div>
                <div style={{ marginBottom: '8px', padding: '8px', background: 'rgba(255,255,255,0.5)', borderRadius: '6px' }}>
                  <div style={{ fontWeight: '600', marginBottom: '4px', color: '#3b82f6' }}>🥉 第三名：SPX Put/Call Ratio（避雷针）</div>
                  <div style={{ fontSize: '0.8rem', paddingLeft: '8px' }}>机构的动作，预测鱼尾结束。如果跌破 0.9，说明"防弹衣"脱了，这是减仓 YINN/NVDA 的最高指令。</div>
                </div>
                <div style={{ marginBottom: '8px', padding: '8px', background: 'rgba(255,255,255,0.5)', borderRadius: '6px' }}>
                  <div style={{ fontWeight: '600', marginBottom: '4px' }}>4️⃣ 第四名：VIX 期限结构（预警哨兵）</div>
                  <div style={{ fontSize: '0.8rem', paddingLeft: '8px' }}>长线转折预警。一旦倒挂，立刻进入"临战模式"。</div>
                </div>
                <div style={{ marginBottom: '0', padding: '8px', background: 'rgba(255,255,255,0.5)', borderRadius: '6px' }}>
                  <div style={{ fontWeight: '600', marginBottom: '4px' }}>5️⃣ 第五名：金/银比（专项工具）</div>
                  <div style={{ fontSize: '0.8rem', paddingLeft: '8px' }}>专门针对 PAAS。如果冲到 85-90，就算大盘还在跌，也可以开始建仓 PAAS。</div>
                </div>
              </div>

              <div style={{ 
                padding: '12px', 
                background: '#f0fdf4', 
                border: '1px solid #86efac',
                borderRadius: '8px', 
                fontSize: '0.85rem', 
                color: '#166534',
                lineHeight: '1.6',
                marginBottom: '12px'
              }}>
                <div style={{ fontWeight: '700', marginBottom: '10px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  💡 2026 "三步走"实战清单
                </div>
                <div style={{ marginBottom: '8px', padding: '8px', background: 'rgba(255,255,255,0.5)', borderRadius: '6px' }}>
                  <div style={{ fontWeight: '600', marginBottom: '4px', color: '#dc2626' }}>1️⃣ 看"撤退信号"（看第 3、4 名）</div>
                  <div style={{ fontSize: '0.8rem', paddingLeft: '8px' }}>如果 SPX P/C 下跌 + VIX 期限结构开始收窄 = <strong>撤退 YINN/NVDA</strong>，准备现金。</div>
                </div>
                <div style={{ marginBottom: '8px', padding: '8px', background: 'rgba(255,255,255,0.5)', borderRadius: '6px' }}>
                  <div style={{ fontWeight: '600', marginBottom: '4px', color: '#f59e0b' }}>2️⃣ 看"崩盘速度"（看第 2 名）</div>
                  <div style={{ fontSize: '0.8rem', paddingLeft: '8px' }}>如果 GEX 转负 = <strong>耐心等待</strong>。不要在刚转负时接 RKLB，因为它会跌得很快，目标位稳稳能到。</div>
                </div>
                <div style={{ marginBottom: '0', padding: '8px', background: 'rgba(255,255,255,0.5)', borderRadius: '6px' }}>
                  <div style={{ fontWeight: '600', marginBottom: '4px', color: '#059669' }}>3️⃣ 看"抄底红灯"（看第 1、5 名）</div>
                  <div style={{ fontSize: '0.8rem', paddingLeft: '8px' }}>如果 Equity P/C &gt; 1.2 + 金银比 &gt; 85 = <strong>全线出击</strong>。买入 PAAS 和 RKLB。</div>
                </div>
              </div>

              <div style={{ 
                padding: '12px', 
                background: '#f0f9ff', 
                border: '1px solid #7dd3fc',
                borderRadius: '8px', 
                fontSize: '0.85rem', 
                color: '#0c4a6e',
                lineHeight: '1.6',
                marginBottom: '12px'
              }}>
                <div style={{ fontWeight: '700', marginBottom: '12px', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  📚 市场博弈逻辑：从"鱼尾行情"到"崩盘"再到"熊转牛"
                </div>
                <div style={{ marginBottom: '12px', padding: '8px', background: 'rgba(255,255,255,0.5)', borderRadius: '6px' }}>
                  <div style={{ fontWeight: '600', marginBottom: '8px', color: '#dc2626' }}>
                    📉 第一部分：熊市崩盘的三个阶段
                  </div>
                  <div style={{ marginBottom: '6px', paddingLeft: '8px' }}>
                    <strong>1. 诱多期（防弹衣剥落）：</strong>SPX 1.22 → 0.90。市场还在涨，但机构开始获利了结 Put 或不再购买昂贵的保险。散户的 Equity P/C 可能还在 0.6 以下（极度贪婪）。
                  </div>
                  <div style={{ marginBottom: '6px', paddingLeft: '8px' }}>
                    <strong>2. 踩踏期（无保护自由落体）：</strong>SPX &lt; 0.8 / Equity 0.6 → 1.0。导火索引爆，机构没有 Put 保护，开始砸盘抛售现货。散户开始慌乱买入 Put 避险。
                  </div>
                  <div style={{ marginBottom: '0', paddingLeft: '8px' }}>
                    <strong>3. 绝望期（终极洗盘）：</strong>Equity P/C &gt; 1.2。这是你等待的瞬间。大盘无差别暴跌，PAAS 和 RKLB 杀到你的预警位。这就是你的"第一笔 1/8 现金"入场点。
                  </div>
                </div>
                <div style={{ marginBottom: '0', padding: '8px', background: 'rgba(255,255,255,0.5)', borderRadius: '6px' }}>
                  <div style={{ fontWeight: '600', marginBottom: '8px', color: '#059669' }}>
                    📈 第二部分：熊转牛的"接力流程"
                  </div>
                  <div style={{ marginBottom: '6px', paddingLeft: '8px' }}>
                    <strong>第一步：</strong>SPX P/C 先行见顶回落（机构先嗅到转机）
                  </div>
                  <div style={{ marginBottom: '6px', paddingLeft: '8px' }}>
                    <strong>第二步：</strong>Equity P/C 出现"极致恐慌后的平复"（散户投降）
                  </div>
                  <div style={{ marginBottom: '6px', paddingLeft: '8px' }}>
                    <strong>第三步：</strong>VIX 确认（温度降下来）
                  </div>
                  <div style={{ marginBottom: '0', paddingLeft: '8px' }}>
                    <strong>第四步：</strong>散户回归（新的牛市开启）
                  </div>
                </div>
              </div>

              {/* 输入字段 */}
              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px', 
                  fontWeight: '600', 
                  color: '#374151',
                  fontSize: '0.95rem'
                }}>
                  Equity P/C Ratio (个股比例) - EQUITY PUT/CALL RATIO (个股看跌/看涨比)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={equityPC}
                  onChange={(e) => setEquityPC(e.target.value)}
                  placeholder="例如: 0.64"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    boxSizing: 'border-box'
                  }}
                />
                <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '6px', marginBottom: '4px' }}>
                  通常 0.7 以下为贪婪，1.1 以上为恐惧
                </div>
                <a 
                  href="https://www.cboe.com/us/options/market_statistics/daily/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{
                    fontSize: '0.75rem',
                    color: '#2563eb',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
                  onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
                >
                  🔗 查看 CBOE 数据
                  <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>↗</span>
                </a>
              </div>

              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px', 
                  fontWeight: '600', 
                  color: '#374151',
                  fontSize: '0.95rem'
                }}>
                  SPX P/C Ratio (标普指数比例) - SPX + SPXW PUT/CALL RATIO (标普指数看跌/看涨比)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={spxPC}
                  onChange={(e) => setSpxPC(e.target.value)}
                  placeholder="例如: 1.22"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '1rem',
                    boxSizing: 'border-box'
                  }}
                />
                <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '6px', marginBottom: '4px' }}>
                  1.2 以上代表机构对冲很强(安全垫)
                </div>
                <a 
                  href="https://www.cboe.com/us/options/market_statistics/daily/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{
                    fontSize: '0.75rem',
                    color: '#2563eb',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
                  onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
                >
                  🔗 查看 CBOE 数据
                  <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>↗</span>
                </a>
              </div>

              <div style={{ 
                padding: '12px', 
                background: '#f0f9ff', 
                border: '1px solid #7dd3fc',
                borderRadius: '8px', 
                fontSize: '0.85rem', 
                color: '#0c4a6e',
                lineHeight: '1.6',
                marginBottom: '12px'
              }}>
                <div style={{ fontWeight: '700', marginBottom: '8px', fontSize: '0.9rem' }}>
                  🔬 高阶参数（可选，提高判断胜率）
                </div>
                <div style={{ fontSize: '0.75rem', marginBottom: '12px', color: '#0369a1' }}>
                  这些参数比 P/C Ratio 更敏感，可以交叉验证市场状态
                </div>
              </div>

              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px', 
                  fontWeight: '600', 
                  color: '#374151',
                  fontSize: '0.9rem'
                }}>
                  VIX 近月（可选）
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={vixNear}
                  onChange={(e) => setVixNear(e.target.value)}
                  placeholder="例如: 15.5"
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box'
                  }}
                />
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px', marginBottom: '4px' }}>
                  VIX 期限结构：对比近月和远月，倒挂时是崩盘前兆
                </div>
                <a 
                  href="https://finance.yahoo.com/quote/%5EVIX" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{
                    fontSize: '0.75rem',
                    color: '#2563eb',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
                  onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
                >
                  🔗 查看 Yahoo Finance VIX
                  <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>↗</span>
                </a>
              </div>

              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px', 
                  fontWeight: '600', 
                  color: '#374151',
                  fontSize: '0.9rem'
                }}>
                  VIX 远月 / VXV（可选）
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={vixFar}
                  onChange={(e) => setVixFar(e.target.value)}
                  placeholder="例如: 18.2"
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box'
                  }}
                />
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px', marginBottom: '4px' }}>
                  三个月后的 VIX，正常应大于近月（Contango）
                </div>
                <a 
                  href="https://finance.yahoo.com/quote/%5EVXV" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{
                    fontSize: '0.75rem',
                    color: '#2563eb',
                    textDecoration: 'none',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
                  onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
                >
                  🔗 查看 Yahoo Finance VXV
                  <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>↗</span>
                </a>
              </div>

              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px', 
                  fontWeight: '600', 
                  color: '#374151',
                  fontSize: '0.9rem'
                }}>
                  Net GEX（可选）
                </label>
                <input
                  type="number"
                  step="1"
                  value={netGEX}
                  onChange={(e) => setNetGEX(e.target.value)}
                  placeholder="例如: -5000000000"
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box'
                  }}
                />
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px', marginBottom: '4px' }}>
                  净看涨期权敞口，负值时市场进入崩盘区
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <a 
                    href="https://tier1alpha.com/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{
                      fontSize: '0.75rem',
                      color: '#2563eb',
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
                    onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
                  >
                    🔗 Tier1Alpha
                    <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>↗</span>
                  </a>
                  <a 
                    href="https://spotgamma.com/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{
                      fontSize: '0.75rem',
                      color: '#2563eb',
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
                    onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
                  >
                    🔗 SpotGamma
                    <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>↗</span>
                  </a>
                </div>
              </div>

              <div>
                <label style={{ 
                  display: 'block', 
                  marginBottom: '8px', 
                  fontWeight: '600', 
                  color: '#374151',
                  fontSize: '0.9rem'
                }}>
                  金银比 Gold/Silver Ratio（可选）
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={goldSilverRatio}
                  onChange={(e) => setGoldSilverRatio(e.target.value)}
                  placeholder="例如: 85.5"
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box'
                  }}
                />
                <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px', marginBottom: '4px' }}>
                  ≥90 时白银极度便宜，是 PAAS 确定性最高的买入时刻
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <a 
                    href="https://finance.yahoo.com/quote/GC=F" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{
                      fontSize: '0.75rem',
                      color: '#2563eb',
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
                    onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
                  >
                    🔗 黄金价格
                    <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>↗</span>
                  </a>
                  <a 
                    href="https://finance.yahoo.com/quote/SI=F" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{
                      fontSize: '0.75rem',
                      color: '#2563eb',
                      textDecoration: 'none',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
                    onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
                  >
                    🔗 白银价格
                    <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>↗</span>
                  </a>
                </div>
              </div>

              <button
                onClick={analyzeMarket}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '1rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(59, 130, 246, 0.3)';
                }}
              >
                🔍 点击生成分析结果
              </button>

              {analysisResult && (
                <div
                  style={{
                    marginTop: '20px',
                    padding: '20px',
                    borderRadius: '8px',
                    borderLeft: `5px solid ${
                      analysisResult.status === 'safe' ? '#28a745' :
                      analysisResult.status === 'warning' ? '#ffc107' : '#dc3545'
                    }`,
                    background:
                      analysisResult.status === 'safe' ? '#d4edda' :
                      analysisResult.status === 'warning' ? '#fff3cd' : '#f8d7da',
                    color:
                      analysisResult.status === 'safe' ? '#155724' :
                      analysisResult.status === 'warning' ? '#856404' : '#721c24'
                  }}
                >
                  <div style={{ 
                    fontWeight: '700', 
                    fontSize: '1.1rem', 
                    marginBottom: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    {analysisResult.status === 'safe' ? '✅' :
                      analysisResult.status === 'warning' ? '⚠️' : '🚨'}
                    {analysisResult.title}
                  </div>
                  <div style={{
                    fontSize: '0.95rem',
                    lineHeight: '1.6',
                    marginBottom: '12px'
                  }}>
                    {analysisResult.content}
                  </div>
                  <div style={{
                    fontSize: '0.95rem',
                    fontWeight: '600',
                    padding: '12px',
                    background: 'rgba(255,255,255,0.5)',
                    borderRadius: '6px',
                    border: `1px solid ${
                      analysisResult.status === 'safe' ? '#28a745' :
                      analysisResult.status === 'warning' ? '#ffc107' : '#dc3545'
                    }`
                  }}>
                    💡 {analysisResult.action}
                  </div>
                  {analysisResult.advanced && (
                    <div style={{
                      marginTop: '16px',
                      padding: '16px',
                      background: '#eff6ff',
                      border: '1px solid #3b82f6',
                      borderRadius: '8px',
                      color: '#1e40af',
                      fontSize: '0.9rem',
                      lineHeight: '1.6',
                      whiteSpace: 'pre-line'
                    }}>
                      <div style={{ fontWeight: '700', marginBottom: '8px', fontSize: '0.95rem' }}>
                        🏆 优先级评估（按实战有效性）
                      </div>
                      <div style={{ fontSize: '0.85rem' }}>
                        {analysisResult.advanced}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 每日执行清单 */}
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '12px', padding: '24px' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '16px', color: '#166534', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '2rem' }}>✅</span>
              每日执行清单
            </h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #86efac' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#1f2937' }}>查看自选</h3>
                <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8' }}>
                  KRE、XHB、GDX/GLD、VIX、DXY、^TNX、BTC-USD、CNN Fear & Greed 指数
                </div>
              </div>
              
              <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #86efac' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#1f2937' }}>记录数据</h3>
                <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8' }}>
                  当天 Equity P/C、SPX P/C、Net GEX、金银比，以及自己给市场阶段打一个标签（鱼尾 / 诱多 / 崩盘 / 恐慌 / 筑底）
                </div>
              </div>
              
              <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #86efac' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#1f2937' }}>行动决策</h3>
                <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8' }}>
                  <div style={{ marginBottom: '8px' }}>• 若无阶段切换信号 → 不做大动作</div>
                  <div>• 若阶段变更 → 按上表调整仓位，不做超过两步的大幅改动</div>
                </div>
              </div>
            </div>
          </div>

          {/* 投资纪律 */}
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '24px' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '16px', color: '#92400e', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '2rem' }}>⚖️</span>
              投资纪律
            </h2>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ fontSize: '1rem', color: '#92400e', lineHeight: '1.8', fontStyle: 'italic' }}>
                • 现金是等待成本，也是买错的止损器。
              </div>
              <div style={{ fontSize: '1rem', color: '#92400e', lineHeight: '1.8', fontStyle: 'italic' }}>
                • 做空需要耐心，抄底需要勇气，二者都要有规则约束。
              </div>
              <div style={{ fontSize: '1rem', color: '#92400e', lineHeight: '1.8', fontStyle: 'italic' }}>
                • 宁可错过，不要做错；宁可慢一点，不要频繁大振幅改仓。
              </div>
            </div>
          </div>
        </div>
      )}

      {activeSubTab === 'us-monitor' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* 三色预警仪表盘 */}
          <div style={{ 
            background: 'white', 
            border: '2px solid #6366f1', 
            borderRadius: '12px', 
            padding: '24px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
          }}>
            <h2 style={{ 
              fontSize: '1.5rem', 
              fontWeight: '700', 
              marginBottom: '8px', 
              color: '#1f2937',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{ fontSize: '2rem' }}>📉</span>
              衰退确认仪表盘 (Recession Checklist)
            </h2>
            <p style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '24px', lineHeight: '1.6' }}>
              核心逻辑：<strong>不看预测，只看事实。</strong> 每月第一个周五（非农数据公布日）更新一次。
            </p>

            {/* 仪表盘表格 */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#f3f4f6', borderBottom: '2px solid #d1d5db' }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: '#1f2937', border: '1px solid #e5e7eb' }}>维度</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: '#1f2937', border: '1px solid #e5e7eb' }}>核心指标</th>
                    <th style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#059669', border: '1px solid #e5e7eb' }}>绿灯<br/>(正常)</th>
                    <th style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#f59e0b', border: '1px solid #e5e7eb' }}>黄灯<br/>(警示)</th>
                    <th style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#dc2626', border: '1px solid #e5e7eb' }}>红灯<br/>(衰退确认)</th>
                    <th style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#1f2937', border: '1px solid #e5e7eb' }}>当前状态</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ background: '#fef2f2' }}>
                    <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb' }}>劳动力</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>失业率 vs 12月低点</td>
                    <td style={{ padding: '12px', textAlign: 'center', color: '#059669', border: '1px solid #e5e7eb' }}>差值 &lt; 0.3%</td>
                    <td style={{ padding: '12px', textAlign: 'center', color: '#f59e0b', border: '1px solid #e5e7eb' }}>0.3% - 0.5%</td>
                    <td style={{ padding: '12px', textAlign: 'center', color: '#dc2626', fontWeight: '600', border: '1px solid #e5e7eb' }}>差值 &gt; 0.5%</td>
                    <td style={{ padding: '12px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                      <span style={{ 
                        display: 'inline-block', 
                        padding: '4px 12px', 
                        borderRadius: '6px', 
                        background: '#fee2e2', 
                        color: '#dc2626', 
                        fontWeight: '600',
                        fontSize: '0.8rem'
                      }}>🔴 红灯 (+1.0%)</span>
                    </td>
                  </tr>
                  <tr style={{ background: '#fffbeb' }}>
                    <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb' }}>流动性</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>10Y-2Y 利差</td>
                    <td style={{ padding: '12px', textAlign: 'center', color: '#059669', border: '1px solid #e5e7eb' }}>倒挂中 或 &gt; 0.5%</td>
                    <td style={{ padding: '12px', textAlign: 'center', color: '#f59e0b', fontWeight: '600', border: '1px solid #e5e7eb' }}>0% - 0.2% (趋平)</td>
                    <td style={{ padding: '12px', textAlign: 'center', color: '#dc2626', fontWeight: '600', border: '1px solid #e5e7eb' }}>由负转正并拉升</td>
                    <td style={{ padding: '12px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                      <span style={{ 
                        display: 'inline-block', 
                        padding: '4px 12px', 
                        borderRadius: '6px', 
                        background: '#fef3c7', 
                        color: '#f59e0b', 
                        fontWeight: '600',
                        fontSize: '0.8rem'
                      }}>🟡 黄灯 (接近 0%)</span>
                    </td>
                  </tr>
                  <tr style={{ background: '#fffbeb' }}>
                    <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb' }}>生产力</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>ISM 制造业 PMI</td>
                    <td style={{ padding: '12px', textAlign: 'center', color: '#059669', border: '1px solid #e5e7eb' }}>&gt; 50 (扩张)</td>
                    <td style={{ padding: '12px', textAlign: 'center', color: '#f59e0b', fontWeight: '600', border: '1px solid #e5e7eb' }}>48 - 50</td>
                    <td style={{ padding: '12px', textAlign: 'center', color: '#dc2626', fontWeight: '600', border: '1px solid #e5e7eb' }}>连续 3 个月 &lt; 48</td>
                    <td style={{ padding: '12px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                      <span style={{ 
                        display: 'inline-block', 
                        padding: '4px 12px', 
                        borderRadius: '6px', 
                        background: '#fef3c7', 
                        color: '#f59e0b', 
                        fontWeight: '600',
                        fontSize: '0.8rem'
                      }}>🟡 黄灯 (48.2)</span>
                    </td>
                  </tr>
                  <tr style={{ background: '#fef2f2' }}>
                    <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb' }}>杠杆率</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>融资余额同比增速</td>
                    <td style={{ padding: '12px', textAlign: 'center', color: '#059669', border: '1px solid #e5e7eb' }}>&lt; 15%</td>
                    <td style={{ padding: '12px', textAlign: 'center', color: '#f59e0b', border: '1px solid #e5e7eb' }}>15% - 30%</td>
                    <td style={{ padding: '12px', textAlign: 'center', color: '#dc2626', fontWeight: '600', border: '1px solid #e5e7eb' }}>&gt; 35% 或 突然掉头</td>
                    <td style={{ padding: '12px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                      <span style={{ 
                        display: 'inline-block', 
                        padding: '4px 12px', 
                        borderRadius: '6px', 
                        background: '#fee2e2', 
                        color: '#dc2626', 
                        fontWeight: '600',
                        fontSize: '0.8rem'
                      }}>🔴 红灯 (+38.5%)</span>
                    </td>
                  </tr>
                  <tr style={{ background: '#f0fdf4' }}>
                    <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb' }}>情绪面</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>VIX 指数 (月均)</td>
                    <td style={{ padding: '12px', textAlign: 'center', color: '#059669', fontWeight: '600', border: '1px solid #e5e7eb' }}>&lt; 18</td>
                    <td style={{ padding: '12px', textAlign: 'center', color: '#f59e0b', border: '1px solid #e5e7eb' }}>18 - 25</td>
                    <td style={{ padding: '12px', textAlign: 'center', color: '#dc2626', fontWeight: '600', border: '1px solid #e5e7eb' }}>持续站稳 25 以上</td>
                    <td style={{ padding: '12px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                      <span style={{ 
                        display: 'inline-block', 
                        padding: '4px 12px', 
                        borderRadius: '6px', 
                        background: '#d1fae5', 
                        color: '#059669', 
                        fontWeight: '600',
                        fontSize: '0.8rem'
                      }}>🟢 绿灯 (14)</span>
                    </td>
                  </tr>
                  <tr style={{ background: '#fef2f2' }}>
                    <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb' }}>信用面</td>
                    <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb' }}>商业地产逾期率</td>
                    <td style={{ padding: '12px', textAlign: 'center', color: '#059669', border: '1px solid #e5e7eb' }}>&lt; 3%</td>
                    <td style={{ padding: '12px', textAlign: 'center', color: '#f59e0b', border: '1px solid #e5e7eb' }}>3% - 5%</td>
                    <td style={{ padding: '12px', textAlign: 'center', color: '#dc2626', fontWeight: '600', border: '1px solid #e5e7eb' }}>&gt; 5% 且加速上升</td>
                    <td style={{ padding: '12px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                      <span style={{ 
                        display: 'inline-block', 
                        padding: '4px 12px', 
                        borderRadius: '6px', 
                        background: '#fee2e2', 
                        color: '#dc2626', 
                        fontWeight: '600',
                        fontSize: '0.8rem'
                      }}>🔴 红灯 (5.7%-6.3%)</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 解读与操作建议 */}
          <div style={{ 
            background: '#fef2f2', 
            border: '1px solid #fecaca', 
            borderRadius: '12px', 
            padding: '20px'
          }}>
            <h3 style={{ 
              fontSize: '1.2rem', 
              fontWeight: '700', 
              marginBottom: '16px', 
              color: '#991b1b',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{ fontSize: '1.5rem' }}>💡</span>
              当前状态解读
            </h3>
            <div style={{ 
              background: 'white', 
              padding: '16px', 
              borderRadius: '8px', 
              marginBottom: '16px',
              border: '1px solid #fecaca'
            }}>
              <div style={{ fontWeight: '700', marginBottom: '8px', color: '#dc2626', fontSize: '1rem' }}>
                "自满式"危机（当前状态）
              </div>
              <p style={{ fontSize: '0.9rem', lineHeight: '1.8', color: '#374151', marginBottom: '12px' }}>
                你的仪表盘出现了极其诡异的组合：<strong>基本面/杠杆（红灯）+ 情绪（绿灯）</strong>。
              </p>
              <p style={{ fontSize: '0.9rem', lineHeight: '1.8', color: '#374151' }}>
                这在历史上通常是"崩盘前夜"。因为数据已经烂了，但 VIX 依然很低，说明市场还没开始计价（Pricing-in）风险。这种"无声的雷"一旦爆了，威力最大。
              </p>
            </div>
          </div>

          {/* 关键信号 */}
          <div style={{ 
            background: '#eff6ff', 
            border: '1px solid #bfdbfe', 
            borderRadius: '12px', 
            padding: '20px'
          }}>
            <h3 style={{ 
              fontSize: '1.2rem', 
              fontWeight: '700', 
              marginBottom: '16px', 
              color: '#1e40af',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{ fontSize: '1.5rem' }}>⚠️</span>
              关键信号：10Y-2Y 利差转正
            </h3>
            <div style={{ fontSize: '0.9rem', lineHeight: '1.8', color: '#374151' }}>
              <p style={{ marginBottom: '12px' }}>
                <strong>核心规律：</strong> 倒挂是告诉你病了，而转正是告诉你该进 ICU 了。
              </p>
              <p style={{ marginBottom: '12px' }}>
                <strong>历史数据：</strong> 从曲线转正（回到 0 以上）到股市最终见底，通常有 <strong>3-12 个月</strong> 的时滞，且中间往往伴随着 <strong>20% 以上</strong> 的跌幅。
              </p>
              <div style={{ 
                background: 'white', 
                padding: '12px', 
                borderRadius: '8px', 
                marginTop: '12px',
                border: '1px solid #bfdbfe'
              }}>
                <div style={{ fontWeight: '600', marginBottom: '8px', color: '#1e40af' }}>观察顺序：</div>
                <ol style={{ paddingLeft: '20px', margin: 0, lineHeight: '2' }}>
                  <li>2 年期国债收益率快速下行（市场开始定价降息）</li>
                  <li>10Y-2Y 突破 0 轴（转正确认）</li>
                  <li>失业率确认破位</li>
                  <li>股市在高位停留极短时间后，开始出现 2% 以上的大阴线跌破 200 日线</li>
                </ol>
              </div>
            </div>
          </div>

          {/* 抄底时机 */}
          <div style={{ 
            background: '#f0fdf4', 
            border: '1px solid #86efac', 
            borderRadius: '12px', 
            padding: '20px'
          }}>
            <h3 style={{ 
              fontSize: '1.2rem', 
              fontWeight: '700', 
              marginBottom: '16px', 
              color: '#166534',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <span style={{ fontSize: '1.5rem' }}>🎯</span>
              抄底时机
            </h3>
            <p style={{ fontSize: '0.9rem', lineHeight: '1.8', color: '#374151', marginBottom: '12px' }}>
              <strong>不要在红灯刚亮时抄底。</strong> 要等到：
            </p>
            <ul style={{ paddingLeft: '20px', margin: 0, lineHeight: '2', fontSize: '0.9rem', color: '#374151' }}>
              <li><strong>融资余额同比增速</strong>从 +38% 暴跌到负数（杠杆清算完毕）</li>
              <li><strong>VIX</strong>出现一个极高的尖峰（如 &gt;40）后回落</li>
              <li>那才是买入 PAAS 或 RKLB 的"带血筹码"时机</li>
            </ul>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
