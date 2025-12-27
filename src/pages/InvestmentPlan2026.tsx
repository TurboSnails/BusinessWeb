import React, { useState, useEffect } from 'react';
import { fetchCBOEPCRatios } from '../services/api';

const InvestmentPlan2026 = () => {
  const [activeTab, setActiveTab] = useState<'timeline' | 'checklist' | 'decision' | 'shorting' | 'monitor'>('timeline');
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'assumptions' | 'indicators' | 'stages' | 'execution'>('overview');
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  
  const toggleCheck = (id: string) => {
    setCheckedItems(prev => ({...prev, [id]: !prev[id]}));
  };
  
  // 市场情绪分析器状态
  const [equityPC, setEquityPC] = useState<string>('');
  const [spxPC, setSpxPC] = useState<string>('');
  const [vixNear, setVixNear] = useState<string>(''); // VIX 近月
  const [vixFar, setVixFar] = useState<string>(''); // VIX 远月 (VXV)
  const [netGEX, setNetGEX] = useState<string>(''); // Net GEX
  const [goldSilverRatio, setGoldSilverRatio] = useState<string>(''); // 金银比
  const [loadingPCRatios, setLoadingPCRatios] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{
    status: 'safe' | 'warning' | 'danger';
    title: string;
    content: string;
    action: string;
    advanced?: string; // 高阶参数分析
  } | null>(null);

  // 自动获取 P/C Ratio 数据
  const handleFetchPCRatios = async () => {
    setLoadingPCRatios(true);
    try {
      console.log('开始获取 CBOE P/C Ratio 数据...');
      const data = await fetchCBOEPCRatios();
      console.log('获取到的数据:', data);
      
      let successCount = 0;
      if (data.equityPC !== null) {
        setEquityPC(data.equityPC.toFixed(2));
        successCount++;
      }
      if (data.spxPC !== null) {
        setSpxPC(data.spxPC.toFixed(2));
        successCount++;
      }
      
      if (successCount === 0) {
        // 提供更友好的提示和快速打开 CBOE 页面的选项
        const openCBOE = confirm('⚠️ 无法自动获取数据\n\nCBOE 页面使用动态加载，无法直接解析。\n\n是否在新窗口打开 CBOE 页面？\n\n（打开后，请查找 "Equity Put/Call Ratio" 和 "SPX Put/Call Ratio" 数据）');
        if (openCBOE) {
          window.open('https://www.cboe.com/us/options/market_statistics/daily/', '_blank');
        }
      } else if (successCount === 1) {
        const missing = [];
        if (data.equityPC === null) missing.push('Equity P/C Ratio');
        if (data.spxPC === null) missing.push('SPX P/C Ratio');
        const openCBOE = confirm(`✅ 已获取部分数据\n\n缺失：${missing.join('、')}\n\n是否打开 CBOE 页面补充缺失数据？`);
        if (openCBOE) {
          window.open('https://www.cboe.com/us/options/market_statistics/daily/', '_blank');
        }
      } else {
        // 两个数据都获取成功，显示成功提示
        alert('✅ 数据获取成功！');
      }
    } catch (error) {
      console.error('Failed to fetch P/C Ratios:', error);
      const openCBOE = confirm('❌ 获取数据失败\n\nCBOE 页面使用动态加载，无法直接解析。\n\n是否在新窗口打开 CBOE 页面手动获取？');
      if (openCBOE) {
        window.open('https://www.cboe.com/us/options/market_statistics/daily/', '_blank');
      }
    } finally {
      setLoadingPCRatios(false);
    }
  };

  // 恢复之前的数据结构
  const timelineData = [
    {
      date: '2026年1月9日',
      day: '周五',
      event: '12月失业率报告',
      time: '美东8:30',
      priority: 'critical',
      actions: [
        { id: 'jan9-1', text: '失业率 ≥ 4.8% → 立即清仓50% YINN' },
        { id: 'jan9-2', text: '失业率 4.6-4.7% → 减仓30% YINN' },
        { id: 'jan9-3', text: '失业率 ≤ 4.5% → 暂缓操作,继续观察' }
      ],
      notes: '第一道防线:确认经济是否加速恶化'
    },
    {
      date: '2026年1月12-16日',
      day: '周一至周五',
      event: '大型银行年报季',
      time: '盘后发布',
      priority: 'critical',
      actions: [
        { id: 'jan12-1', text: '关注JPM、BAC、WFC、C的财报' },
        { id: 'jan12-2', text: '重点看"贷款损失拨备(Provision)"金额' },
        { id: 'jan12-3', text: 'JPM计提<25亿→经济强劲; 30-40亿→放缓; >50亿→危机' }
      ],
      notes: '银行是经济的神经末梢,他们的预警最准确'
    },
    {
      date: '2026年1月17日',
      day: '周六',
      event: '周末决策日',
      time: '全天',
      priority: 'high',
      actions: [
        { id: 'jan17-1', text: '综合失业率+银行计提数据做最终判断' },
        { id: 'jan17-2', text: '如两个信号都亮红灯→准备1/20清仓75%' },
        { id: 'jan17-3', text: '如只有一个红灯→清仓50%' },
        { id: 'jan17-4', text: '如都正常→仅清仓25%,设置止损' }
      ],
      notes: '周末冷静思考,避免周一情绪化操作'
    },
    {
      date: '2026年1月20日',
      day: '周二',
      event: '原定执行日(弹性调整)',
      time: '开盘后',
      priority: 'critical',
      actions: [
        { id: 'jan20-1', text: '根据17日决策执行卖出YINN' },
        { id: 'jan20-2', text: '卖出后:50%货币基金+25%黄金+15%短期美债+10%观察仓' },
        { id: 'jan20-3', text: '不要因为当天上涨而犹豫' }
      ],
      notes: '注意:1/19是马丁·路德·金纪念日,美股休市'
    },
    {
      date: '2026年1月26日-2月10日',
      day: '财报季',
      event: '科技股Q4财报+2026指引',
      time: '盘后',
      priority: 'high',
      actions: [
        { id: 'jan26-1', text: '1/26-28: 特斯拉、微软财报' },
        { id: 'jan26-2', text: '1/29-31: Meta、苹果财报' },
        { id: 'jan26-3', text: '2/3-5: 谷歌、亚马逊财报' },
        { id: 'jan26-4', text: '2/20-25: 英伟达财报(最关键)' },
        { id: 'jan26-5', text: '如3家以上超预期→AI续命; 2家踩雷→科技见顶' }
      ],
      notes: '判断AI故事能否继续,关系到衰退时间'
    },
    {
      date: '2026年2月6日',
      day: '周五',
      event: '1月失业率报告',
      time: '美东8:30',
      priority: 'critical',
      actions: [
        { id: 'feb6-1', text: '如连续两月上升→启动"衰退确认模式"' },
        { id: 'feb6-2', text: '立即清仓所有剩余YINN(如有)' },
        { id: 'feb6-3', text: '现金占比提升至70%,黄金20%' },
        { id: 'feb6-4', text: '准备4月做空窗口期' }
      ],
      notes: '二次确认,这是最后的撤退机会'
    },
    {
      date: '2026年3月全月',
      day: '观察期',
      event: '可能出现假反弹',
      time: '持续观察',
      priority: 'medium',
      actions: [
        { id: 'mar-1', text: '❌ 不要在3月任何时候抄底' },
        { id: 'mar-2', text: '❌ 不要被"V型反转"迷惑' },
        { id: 'mar-3', text: '✅ 持有70%现金,享受4.5%收益' },
        { id: 'mar-4', text: '✅ 每周监控KRE(区域银行ETF)走势' }
      ],
      notes: '历史上危机初期常有15-20%假反弹,耐心等待'
    },
    {
      date: '2026年4月15-30日',
      day: '关键月',
      event: 'Q1财报季+做空窗口期',
      time: '盘后',
      priority: 'critical',
      actions: [
        { id: 'apr-1', text: '4/20-25: 特斯拉、Netflix财报(看消费意愿)' },
        { id: 'apr-2', text: '4/27-30: 微软、谷歌、Meta(看AI投入产出)' },
        { id: 'apr-3', text: '重点关注富国银行商业地产计提' },
        { id: 'apr-4', text: '观察KRE是否跌破2023年低点($40)' },
        { id: 'apr-5', text: '4月初关注3月失业率,如≥5.0%→萨姆规则触发' }
      ],
      notes: '做空入场的黄金时机,必须满足3个条件'
    },
    {
      date: '2026年4月底',
      day: '决策点',
      event: '做空入场判断',
      time: '财报季后',
      priority: 'critical',
      actions: [
        { id: 'apr-end-1', text: '✅条件1: 失业率≥5.0%' },
        { id: 'apr-end-2', text: '✅条件2: 银行Q1计提>50亿' },
        { id: 'apr-end-3', text: '✅条件3: 科技股财报指引向下' },
        { id: 'apr-end-4', text: '三个全满足→买入PSQ; 仅两个→继续观察' },
        { id: 'apr-end-5', text: '分批入场: 4/20投30%,4/25追加30%,5月初追加40%' }
      ],
      notes: '做空工具: 激进60%PSQ+40%TLT; 稳健40%PSQ+40%SH+20%TLT'
    },
    {
      date: '2026年5月初',
      day: '财报尾声',
      event: '苹果、亚马逊、英伟达财报',
      time: '盘后',
      priority: 'high',
      actions: [
        { id: 'may-1', text: '苹果:全球供应链健康度' },
        { id: 'may-2', text: '亚马逊:消费者支出数据' },
        { id: 'may-3', text: '英伟达(5/20左右):AI最终审判日' },
        { id: 'may-4', text: '如出现恐慌性下跌→追加做空仓位' }
      ],
      notes: '英伟达因财年不同,总是最后出场'
    },
    {
      date: '2026年6-7月',
      day: '危机爆发期',
      event: '商业地产雷集中引爆',
      time: '持续观察',
      priority: 'high',
      actions: [
        { id: 'jun-1', text: '2016-2019年商业地产贷款集中到期' },
        { id: 'jun-2', text: '关注中小房企违约新闻' },
        { id: 'jun-3', text: '关注区域银行是否出现"挤兑"' },
        { id: 'jun-4', text: '✅ 继续持有PSQ,不因短期反弹止损' },
        { id: 'jun-5', text: '如纳指跌幅达25%,可兑现30%利润' }
      ],
      notes: '信贷市场可能冻结,失业率冲向6%'
    },
    {
      date: '2026年8-9月',
      day: '抄底准备期',
      event: '寻找市场底部',
      time: '持续观察',
      priority: 'high',
      actions: [
        { id: 'aug-1', text: '✅ 标普500从高点回撤>30%' },
        { id: 'aug-2', text: '✅ 美联储紧急降息至2%以下' },
        { id: 'aug-3', text: '✅ 政府推出万亿级刺激' },
        { id: 'aug-4', text: '✅ VIX从50+回落至35以下' },
        { id: 'aug-5', text: '✅ 信贷数据连续两周正增长' },
        { id: 'aug-6', text: '五个条件全满足→开始分三批抄底' }
      ],
      notes: '抄底资金: 50%现金+30%PSQ获利+20%黄金减仓'
    }
  ];

  const checklistData = [
    {
      category: '2025年12月(本月立即执行)',
      items: [
        { id: 'dec-1', text: '开设货币基金账户(4.5%年化收益)' },
        { id: 'dec-2', text: '计算并存好12个月生活费应急资金' },
        { id: 'dec-3', text: '研究PSQ、SH、TLT的交易规则和费率' },
        { id: 'dec-4', text: '设置股票交易App的价格提醒和止损功能' },
        { id: 'dec-5', text: '列出当前所有持仓清单和成本价' }
      ]
    },
    {
      category: '2026年1月',
      items: [
        { id: 'jan-1', text: '1月9日早8:30盯失业率报告(设闹钟)' },
        { id: 'jan-2', text: '1月12-16日每天查看银行财报(JPM/BAC/WFC/C)' },
        { id: 'jan-3', text: '1月17日周末做最终决策,写下决策理由' },
        { id: 'jan-4', text: '1月20日按计划执行清仓(不要犹豫)' },
        { id: 'jan-5', text: '1月底关注科技股财报,判断AI趋势' }
      ]
    },
    {
      category: '2026年2月',
      items: [
        { id: 'feb-1', text: '2月6日确认失业率是否连续上升' },
        { id: 'feb-2', text: '2月10日前完成所有仓位调整' },
        { id: 'feb-3', text: '开始每周一、三、五监控KRE走势' },
        { id: 'feb-4', text: '检查货币基金收益是否到账' }
      ]
    },
    {
      category: '2026年3-4月',
      items: [
        { id: 'mar-apr-1', text: '忍住3月抄底冲动,不看短期涨跌' },
        { id: 'mar-apr-2', text: '准备做空资金(30-40%现金)' },
        { id: 'mar-apr-3', text: '4月1日查看3月失业率报告' },
        { id: 'mar-apr-4', text: '4月15日开始每天关注银行财报' },
        { id: 'mar-apr-5', text: '4月27日重点关注微软、谷歌财报和指引' },
        { id: 'mar-apr-6', text: '4月底评估是否满足3个做空条件' }
      ]
    },
    {
      category: '2026年5-9月',
      items: [
        { id: 'may-sep-1', text: '持有做空仓位,设置止盈点(纳指-25%)' },
        { id: 'may-sep-2', text: '每月1日评估是否满足抄底条件' },
        { id: 'may-sep-3', text: '关注商业地产违约新闻' },
        { id: 'may-sep-4', text: '关注美联储降息动态' },
        { id: 'may-sep-5', text: '准备Q3-Q4抄底资金(不要提前动用)' }
      ]
    }
  ];

  const decisionMatrix = [
    {
      scenario: '失业率≥4.8% 且 银行计提>50亿',
      signal: '🔴 双重红灯',
      action: '清仓75% YINN',
      allocation: '50%现金 + 25%黄金 + 15%美债 + 10%观察仓'
    },
    {
      scenario: '失业率4.6-4.7% 或 银行计提30-50亿',
      signal: '🟡 单一警告',
      action: '清仓50% YINN',
      allocation: '40%现金 + 20%黄金 + 15%美债 + 25%观察仓'
    },
    {
      scenario: '失业率<4.5% 且 银行计提<25亿',
      signal: '🟢 暂时安全',
      action: '仅清仓25% YINN',
      allocation: '25%现金 + 10%黄金 + 10%美债 + 55%保留仓位'
    },
    {
      scenario: '科技股财报3家以上超预期',
      signal: '🟢 AI续命',
      action: '取消做空计划',
      allocation: '可考虑2月底重新买入YINN'
    }
  ];

  const shortingConditions = [
    { id: 'short-1', condition: '失业率 ≥ 5.0% (萨姆规则触发)', weight: '必要条件1' },
    { id: 'short-2', condition: '银行Q1计提 > 50亿美元', weight: '必要条件2' },
    { id: 'short-3', condition: '科技股Q1财报集体指引向下', weight: '必要条件3' },
    { id: 'short-4', condition: 'KRE跌破2023年低点($40)', weight: '加强信号' },
    { id: 'short-5', condition: '出现首个中型银行限制提款', weight: '加强信号' }
  ];

  const monitorList = [
    {
      code: 'KRE',
      name: '区域银行',
      description: '看地产雷什么时候炸',
      icon: '🏦',
      color: '#ef4444',
      bgColor: '#fef2f2'
    },
    {
      code: 'XHB',
      name: '建筑商',
      description: '确认地产板块是否持续走弱',
      icon: '🏗️',
      color: '#f97316',
      bgColor: '#fff7ed'
    },
    {
      code: 'GDX / GLD',
      name: '黄金相关',
      description: '确认避险资金流向',
      icon: '🥇',
      color: '#eab308',
      bgColor: '#fefce8'
    },
    {
      code: 'VIX',
      name: '恐慌指数',
      description: '如果 VIX 持续站稳在 25 以上，说明"阴跌"转为"恐慌跌"',
      icon: '📊',
      color: '#8b5cf6',
      bgColor: '#faf5ff'
    },
    {
      code: 'DXY',
      name: '美元指数',
      description: '美元强弱反映全球资金流向，强势美元通常压制风险资产',
      icon: '💵',
      color: '#3b82f6',
      bgColor: '#eff6ff'
    },
    {
      code: '^TNX',
      name: '10年期美债收益率',
      description: '收益率倒挂（2年>10年）是衰退预警信号，持续倒挂需警惕',
      icon: '📈',
      color: '#10b981',
      bgColor: '#f0fdf4'
    },
    {
      code: 'BTC-USD',
      name: '比特币',
      description: '风险偏好指标，BTC上涨通常意味着市场风险偏好上升',
      icon: '₿',
      color: '#f59e0b',
      bgColor: '#fffbeb'
    },
    {
      code: 'Fear & Greed',
      name: '恐慌贪婪指数',
      description: 'CNN恐慌贪婪指数，<20极度恐慌（抄底信号），>80极度贪婪（减仓信号）',
      icon: '😱',
      color: '#ec4899',
      bgColor: '#fdf2f8'
    }
  ];

  const economicCalendar = [
    {
      event: 'FOMC利率决议',
      frequency: '每6-8周一次',
      time: '美东14:00',
      importance: 'critical',
      description: '美联储货币政策决定，直接影响市场',
      icon: '🏦'
    },
    {
      event: '非农就业数据 (NFP)',
      frequency: '每月第一个周五',
      time: '美东8:30',
      importance: 'critical',
      description: '就业市场健康度，影响美联储政策预期',
      icon: '👔'
    },
    {
      event: 'CPI通胀数据',
      frequency: '每月中旬',
      time: '美东8:30',
      importance: 'high',
      description: '通胀水平，影响利率预期',
      icon: '📈'
    },
    {
      event: 'PPI生产者价格指数',
      frequency: '每月中旬',
      time: '美东8:30',
      importance: 'high',
      description: '上游通胀压力，CPI先行指标',
      icon: '🏭'
    },
    {
      event: 'GDP初值/终值',
      frequency: '每季度',
      time: '美东8:30',
      importance: 'high',
      description: '经济增长速度，衰退预警指标',
      icon: '📊'
    },
    {
      event: '消费者信心指数',
      frequency: '每月',
      time: '美东10:00',
      importance: 'medium',
      description: '消费意愿，影响经济预期',
      icon: '🛒'
    },
    {
      event: 'ISM制造业PMI',
      frequency: '每月第一个工作日',
      time: '美东10:00',
      importance: 'high',
      description: '制造业景气度，<50表示收缩',
      icon: '🏭'
    },
    {
      event: '失业率报告',
      frequency: '每月第一个周五',
      time: '美东8:30',
      importance: 'critical',
      description: '萨姆规则触发条件（失业率≥5.0%）',
      icon: '📉'
    }
  ];

  // 市场情绪分析函数
  const analyzeMarket = () => {
    const equity = parseFloat(equityPC);
    const spx = parseFloat(spxPC);
    const vixN = parseFloat(vixNear);
    const vixF = parseFloat(vixFar);
    const gex = parseFloat(netGEX);
    const gsRatio = parseFloat(goldSilverRatio);
    
    if (isNaN(equity) || isNaN(spx)) {
      alert('请输入 Equity P/C 和 SPX P/C 的数值');
      return;
    }

    // 高阶参数分析
    let advancedAnalysis = '';
    const hasAdvanced = !isNaN(vixN) && !isNaN(vixF) || !isNaN(gex) || !isNaN(gsRatio);
    
    if (hasAdvanced) {
      const advParts: string[] = [];
      
      // VIX 期限结构分析
      if (!isNaN(vixN) && !isNaN(vixF)) {
        if (vixN > vixF) {
          advParts.push('⚠️ VIX 期限结构倒挂（近期 > 远期）：这是崩盘前兆，即使大盘还在涨也要警惕！');
        } else if (vixN >= vixF * 0.9) {
          advParts.push('⚠️ VIX 期限结构接近倒挂：近期急速逼近远期，需要密切关注。');
        } else {
          advParts.push('✅ VIX 期限结构正常（远期 > 近期）：市场情绪相对稳定。');
        }
      }
      
      // Net GEX 分析
      if (!isNaN(gex)) {
        if (gex < 0) {
          advParts.push('🚨 Net GEX 为负值：市场进入崩盘区，做市商对冲行为会"越跌越卖"，价格可能自由落体！');
        } else if (gex < 10) {
          advParts.push('⚠️ Net GEX 接近零轴：市场稳定性下降，波动可能加剧。');
        } else {
          advParts.push('✅ Net GEX 为高正值：市场处于安全区，做市商会"越涨越卖，越跌越买"，波动较小。');
        }
      }
      
      // 金银比分析
      if (!isNaN(gsRatio)) {
        if (gsRatio >= 90) {
          advParts.push('💰 金银比 ≥ 90：白银极度便宜，这是确定性最高的 PAAS 买入时刻！');
        } else if (gsRatio >= 85) {
          advParts.push('💰 金银比 ≥ 85：白银相对便宜，接近 PAAS 的买入区间。');
        } else if (gsRatio < 70) {
          advParts.push('⚠️ 金银比 < 70：白银猛涨（PAAS 冲高），可能是鱼尾行情末端。');
        } else {
          advParts.push('✅ 金银比正常（70-85）：金属市场相对平衡。');
        }
      }
      
      if (advParts.length > 0) {
        advancedAnalysis = advParts.join('\n\n');
      }
    }

    let result: typeof analysisResult = null;

    // 完善的分析逻辑 - 根据市场博弈流程
    // 1. 鱼尾行情（目前状态）
    if (equity < 0.7 && spx >= 1.2) {
      result = {
        status: 'safe',
        title: '当前状态：鱼尾行情（非理性繁荣，有保护）',
        content: '散户在狂欢，但机构买了大量保险。虽然看似危险，但由于对冲充足，短期内很难发生断崖式崩盘。市场可能还在涨，甚至创新高。',
        action: '资产状态：持有 YINN, NVDA | 操作：持仓不动，不加仓。继续持有现金，不要追高。'
      };
    }
    // 2. 诱多末期（防弹衣剥落）
    else if (equity < 0.7 && spx >= 0.85 && spx < 1.2) {
      result = {
        status: 'warning',
        title: '当前状态：诱多末期（防弹衣剥落）',
        content: 'SPX 比例从 1.22 降到 0.9 以下。市场可能还在涨，但机构的"防弹衣"没了。机构开始获利了结 Put 或不再购买昂贵的保险。散户的 Equity P/C 可能还在 0.6 以下（极度贪婪）。',
        action: '资产状态：极度危险 | 操作：考虑对 YINN 进行止盈。握紧你的 1/8 现金，暴风雨可能在 2 周内到来。'
      };
    }
    // 3. 裸奔时刻（无保护自由落体）
    else if (equity < 0.7 && spx < 0.85) {
      result = {
        status: 'warning',
        title: '当前状态：裸奔时刻（无保护自由落体）',
        content: '个股极度贪婪，且机构撤走了对冲保护（或者对冲已经赔光）。这是崩盘前的最危险信号！导火索（如经济数据）可能即将引爆。',
        action: '资产状态：极度危险 | 操作：握紧你的 1/8 现金，暴风雨可能在 2 周内到来。'
      };
    }
    // 4. 踩踏期（无保护自由落体）
    else if (equity >= 0.7 && equity < 1.0 && spx < 0.8) {
      result = {
        status: 'warning',
        title: '当前状态：踩踏期（无保护自由落体）',
        content: '导火索已引爆。因为机构没有 Put 保护，为了自保，他们开始在大盘直接砸盘抛售现货。散户开始意识到不对劲，个股跌破关键位，散户开始慌乱买入 Put 避险，Equity P/C 快速拉升。',
        action: '资产状态：账户回撤 | 操作：忍耐，手握现金。等待 Equity P/C 继续飙升。'
      };
    }
    // 5. 极度恐惧（黄金坑）
    else if (equity >= 1.2 && spx >= 0.9 && spx < 1.1) {
      result = {
        status: 'danger',
        title: '当前状态：极度恐惧（黄金坑 - 第一笔买入点）',
        content: '这是你等待的瞬间。大盘无差别暴跌，PAAS 和 RKLB 杀到你的预警位。市场上所有人都认为还要跌。散户不再买 Call，全部在割肉或买 Put 保命。',
        action: '资产状态：买入点！| 操作：1/8 现金抄底 PAAS 和 RKLB。检查股价！如果 PAAS 到了 $50-51，RKLB 到了 $55，这就是最佳分批建仓时刻。'
      };
    }
    // 6. 系统性风险爆发
    else if (equity >= 1.1 && spx >= 1.1) {
      result = {
        status: 'warning',
        title: '当前状态：系统性风险爆发',
        content: '全市场都在买保险。虽然恐惧，但说明大家还没放弃抵抗。',
        action: '操作：等待 Equity 继续飙升或 SPX 开始回落（即机构开始投降或直接抛售现货）。'
      };
    }
    // 7. 筑底回升（熊转牛开始）
    else if (equity >= 0.8 && equity < 1.0 && spx >= 0.9 && spx < 1.0) {
      result = {
        status: 'safe',
        title: '当前状态：筑底回升（熊转牛开始）',
        content: 'SPX P/C 先行见顶回落，机构不再恐慌性买入指数保险。Equity P/C 出现"极致恐慌后的平复"，想卖的人都已经卖完了。这是量价背离，说明空头动能耗尽，市场开始筑底。',
        action: '资产状态：盈利中 | 操作：持股待涨。PAAS 和 RKLB 应该在底部横盘。'
      };
    }
    // 8. 散户回归（新牛市开启）
    else if (equity < 0.7 && spx >= 0.9 && spx < 1.2) {
      result = {
        status: 'safe',
        title: '当前状态：散户回归（新牛市开启）',
        content: '踏空的人开始追高。Equity P/C 重新跌回 0.7 以下。此时 PAAS 已经从底部回升，你的仓位已经安全盈利。',
        action: '资产状态：盈利中 | 操作：持股待涨，享受牛市。'
      };
    }
    // 9. 其他情况（震荡修复期）
    else {
      result = {
        status: 'safe',
        title: '当前状态：震荡修复期',
        content: '多空力量交织，没有明显的极端情绪。保持耐心。',
        action: '操作：继续观察，等待更明确的信号。'
      };
    }

    // 添加优先级评估
    if (result) {
      let priorityAnalysis = '';
      const priorityParts: string[] = [];
      
      // 第一名：Equity P/C Ratio 评估
      if (equity < 0.55) {
        priorityParts.push('🥇 Equity P/C (0.64)：进入疯狂末端，极度贪婪！这是最危险的信号。');
      } else if (equity < 0.7) {
        priorityParts.push('🥇 Equity P/C (0.64)：贪婪状态，但还没到疯狂。继续享受鱼尾行情，但绝不加仓。');
      } else if (equity >= 0.7 && equity < 1.1) {
        priorityParts.push('🥇 Equity P/C：贪婪开始消退，市场情绪转向。密切关注，准备撤退。');
      } else if (equity >= 1.1 && equity < 1.2) {
        priorityParts.push('🥇 Equity P/C：恐惧加剧，接近抄底区间。准备资金，等待突破 1.2。');
      } else if (equity >= 1.2) {
        priorityParts.push('🥇 Equity P/C：极度恐惧！这是确定性最高的抄底时刻！1/8 现金可以进场。');
      }
      
      // 第三名：SPX P/C Ratio 评估
      if (spx >= 1.2) {
        priorityParts.push('🥉 SPX P/C (1.22)：安全垫充足，机构对冲很强。可以继续持仓 YINN/NVDA。');
      } else if (spx >= 0.9 && spx < 1.2) {
        priorityParts.push('🥉 SPX P/C：防弹衣开始剥落，需要警惕。考虑减仓 YINN/NVDA。');
      } else if (spx < 0.9) {
        priorityParts.push('🥉 SPX P/C：防弹衣已脱！这是撤退 YINN/NVDA 的最高指令！');
      }
      
      // 第二名：Net GEX 评估（如果有输入）
      if (!isNaN(gex)) {
        if (gex < 0) {
          priorityParts.push('🥈 Net GEX：负值！市场进入崩盘区，价格会自由落体。不要在刚转负时接 RKLB，耐心等待更低点。');
        } else if (gex < 10) {
          priorityParts.push('🥈 Net GEX：接近零轴，市场稳定性下降。波动可能加剧，需要谨慎。');
        } else {
          priorityParts.push('🥈 Net GEX：高正值，市场处于安全区。波动较小，可以继续持仓。');
        }
      }
      
      // 第四名：VIX 期限结构评估（如果有输入）
      if (!isNaN(vixN) && !isNaN(vixF)) {
        if (vixN > vixF) {
          priorityParts.push('4️⃣ VIX 期限结构：倒挂！这是崩盘前兆，立刻进入"临战模式"。');
        } else if (vixN >= vixF * 0.9) {
          priorityParts.push('4️⃣ VIX 期限结构：接近倒挂，近期急速逼近远期。需要密切关注。');
        } else {
          priorityParts.push('4️⃣ VIX 期限结构：正常（远期 > 近期）。可以继续在 YINN 的鱼尾行情里博弈。');
        }
      }
      
      // 第五名：金银比评估（如果有输入）
      if (!isNaN(gsRatio)) {
        if (gsRatio >= 90) {
          priorityParts.push('5️⃣ 金银比：≥ 90！白银极度便宜，这是确定性最高的 PAAS 买入时刻！');
        } else if (gsRatio >= 85) {
          priorityParts.push('5️⃣ 金银比：≥ 85，白银相对便宜。接近 PAAS 的买入区间。');
        } else if (gsRatio < 70) {
          priorityParts.push('5️⃣ 金银比：< 70，白银猛涨（PAAS 冲高）。可能是鱼尾行情末端。');
        } else {
          priorityParts.push('5️⃣ 金银比：正常（70-85），金属市场相对平衡。');
        }
      }
      
      if (priorityParts.length > 0) {
        priorityAnalysis = priorityParts.join('\n\n');
      }
      
      // 合并优先级分析和高阶参数分析
      if (priorityAnalysis && advancedAnalysis) {
        result.advanced = priorityAnalysis + '\n\n' + advancedAnalysis;
      } else if (priorityAnalysis) {
        result.advanced = priorityAnalysis;
      } else if (advancedAnalysis) {
        result.advanced = advancedAnalysis;
      }
    }

    setAnalysisResult(result);
  };

  return (
    <div style={{ width: '100%', maxWidth: '1200px', margin: '0 auto', padding: '16px', background: '#f9fafb', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ 
        background: 'linear-gradient(135deg, #2563eb, #9333ea)', 
        color: 'white', 
        padding: '24px', 
        borderRadius: '12px 12px 0 0',
        marginBottom: 0
      }}>
        <h1 style={{ fontSize: '2rem', fontWeight: '700', margin: 0, display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '2.5rem' }}>📊</span>
          2026年美股投资计划
        </h1>
        <p style={{ margin: '8px 0 0', color: 'rgba(255,255,255,0.9)', fontSize: '0.95rem' }}>
          系统性风险管理与阶段化操作手册
        </p>
      </div>

      {/* Tabs */}
      <div style={{ background: 'white', borderLeft: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', flexWrap: 'wrap' }}>
          {(['timeline', 'checklist', 'decision', 'shorting', 'monitor'] as const).map((tab) => {
            const labels: Record<typeof tab, string> = {
              timeline: '时间轴',
              checklist: '执行清单',
              decision: '决策矩阵',
              shorting: '做空条件',
              monitor: '每日监控'
            };
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
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
                    e.currentTarget.style.background = '#f9fafb';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent';
                  }
                }}
              >
                {labels[tab]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: '0 0 12px 12px', padding: '24px' }}>
        {activeTab === 'timeline' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {timelineData.map((item, index) => {
              const borderColor = item.priority === 'critical' ? '#ef4444' : item.priority === 'high' ? '#f97316' : '#3b82f6';
              const bgColor = item.priority === 'critical' ? '#fef2f2' : item.priority === 'high' ? '#fff7ed' : '#eff6ff';
              
              return (
                <div
                  key={index}
                  style={{
                    borderLeft: `4px solid ${borderColor}`,
                    paddingLeft: '16px',
                    padding: '12px 12px 12px 16px',
                    background: bgColor,
                    borderRadius: '8px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: '700', fontSize: '1.1rem' }}>{item.date}</span>
                        <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>{item.day}</span>
                        {item.time && (
                          <span style={{ 
                            fontSize: '0.8rem', 
                            background: 'white', 
                            padding: '4px 8px', 
                            borderRadius: '4px',
                            color: '#4b5563'
                          }}>
                            {item.time}
                          </span>
                        )}
                      </div>
                      <h3 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#1f2937', margin: '8px 0' }}>
                        {item.event}
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px' }}>
                        {item.actions.map((action) => (
                          <div key={action.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                            <input
                              type="checkbox"
                              id={action.id}
                              checked={checkedItems[action.id] || false}
                              onChange={() => toggleCheck(action.id)}
                              style={{ marginTop: '4px', width: '16px', height: '16px', cursor: 'pointer' }}
                            />
                            <label
                              htmlFor={action.id}
                              style={{
                                fontSize: '0.9rem',
                                textDecoration: checkedItems[action.id] ? 'line-through' : 'none',
                                color: checkedItems[action.id] ? '#9ca3af' : '#374151',
                                cursor: 'pointer',
                                flex: 1
                              }}
                            >
                              {action.text}
                            </label>
                          </div>
                        ))}
                      </div>
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'flex-start', 
                        gap: '8px', 
                        fontSize: '0.85rem', 
                        color: '#4b5563', 
                        background: 'rgba(255,255,255,0.7)', 
                        padding: '8px', 
                        borderRadius: '6px',
                        marginTop: '8px'
                      }}>
                        <span style={{ fontSize: '1rem' }}>⚠️</span>
                        <span>{item.notes}</span>
                      </div>
                    </div>
                    {item.priority === 'critical' && (
                      <span style={{ fontSize: '1.5rem', marginLeft: '16px', flexShrink: 0 }}>🔔</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'checklist' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {checklistData.map((section, index) => (
              <div key={index} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px' }}>
                <h3 style={{ 
                  fontSize: '1.1rem', 
                  fontWeight: '700', 
                  color: '#1f2937', 
                  marginBottom: '12px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '8px' 
                }}>
                  <div style={{ 
                    width: '32px', 
                    height: '32px', 
                    background: '#dbeafe', 
                    color: '#2563eb', 
                    borderRadius: '50%', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center', 
                    fontWeight: '700',
                    fontSize: '0.9rem'
                  }}>
                    {index + 1}
                  </div>
                  {section.category}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {section.items.map((item) => (
                    <div key={item.id} style={{ 
                      display: 'flex', 
                      alignItems: 'flex-start', 
                      gap: '12px', 
                      padding: '8px',
                      borderRadius: '6px',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#f9fafb' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <input
                        type="checkbox"
                        id={item.id}
                        checked={checkedItems[item.id] || false}
                        onChange={() => toggleCheck(item.id)}
                        style={{ marginTop: '2px', width: '20px', height: '20px', cursor: 'pointer' }}
                      />
                      <label
                        htmlFor={item.id}
                        style={{
                          flex: 1,
                          cursor: 'pointer',
                          textDecoration: checkedItems[item.id] ? 'line-through' : 'none',
                          color: checkedItems[item.id] ? '#9ca3af' : '#374151',
                          fontSize: '0.9rem'
                        }}
                      >
                        {item.text}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'decision' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
              <h3 style={{ fontWeight: '700', fontSize: '1.1rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.2rem' }}>⚠️</span>
                1月20日决策矩阵
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#374151' }}>
                根据1月9日失业率报告 + 1月12-16日银行计提数据综合判断
              </p>
            </div>
            {decisionMatrix.map((item, index) => (
              <div
                key={index}
                style={{
                  border: '2px solid #e5e7eb',
                  borderRadius: '8px',
                  padding: '16px',
                  transition: 'box-shadow 0.2s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)' }}
                onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <span style={{ fontSize: '1.5rem' }}>{item.signal.split(' ')[0]}</span>
                      <span style={{ fontWeight: '700', color: '#1f2937', fontSize: '1rem' }}>
                        {item.signal.split(' ')[1]}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.85rem', color: '#4b5563', marginBottom: '12px' }}>
                      <strong>场景:</strong> {item.scenario}
                    </div>
                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '12px', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '1.2rem' }}>📉</span>
                        <strong style={{ color: '#1f2937' }}>操作:</strong>
                      </div>
                      <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#ea580c' }}>
                        {item.action}
                      </div>
                    </div>
                    <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '1.2rem' }}>💰</span>
                        <strong style={{ color: '#1f2937' }}>资金配置:</strong>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#374151' }}>{item.allocation}</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'shorting' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '16px' }}>
              <h3 style={{ fontWeight: '700', fontSize: '1.1rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.2rem' }}>📉</span>
                4月底做空入场条件检查表
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#374151', marginBottom: '16px' }}>
                必须同时满足前3个条件才能开始做空,后2个为加强信号
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {shortingConditions.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      background: 'white',
                      padding: '12px',
                      borderRadius: '6px',
                      border: '1px solid #e5e7eb'
                    }}
                  >
                    <input
                      type="checkbox"
                      id={item.id}
                      checked={checkedItems[item.id] || false}
                      onChange={() => toggleCheck(item.id)}
                      style={{ marginTop: '2px', width: '20px', height: '20px', cursor: 'pointer' }}
                    />
                    <div style={{ flex: 1 }}>
                      <label
                        htmlFor={item.id}
                        style={{
                          fontWeight: '500',
                          color: '#1f2937',
                          cursor: 'pointer',
                          fontSize: '0.9rem',
                          display: 'block'
                        }}
                      >
                        {item.condition}
                      </label>
                      <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '4px' }}>
                        {item.weight}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
              gap: '16px' 
            }}>
              <div style={{ border: '1px solid #fed7aa', background: '#fff7ed', borderRadius: '8px', padding: '16px' }}>
                <h4 style={{ fontWeight: '700', marginBottom: '8px', color: '#9a3412' }}>激进策略</h4>
                <div style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '4px', color: '#374151' }}>
                  <div>60% PSQ (2倍反向纳指)</div>
                  <div>40% TLT (博降息)</div>
                </div>
              </div>
              <div style={{ border: '1px solid #bfdbfe', background: '#eff6ff', borderRadius: '8px', padding: '16px' }}>
                <h4 style={{ fontWeight: '700', marginBottom: '8px', color: '#1e40af' }}>稳健策略</h4>
                <div style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '4px', color: '#374151' }}>
                  <div>40% PSQ</div>
                  <div>40% SH (1倍反向标普)</div>
                  <div>20% TLT</div>
                </div>
              </div>
              <div style={{ border: '1px solid #bbf7d0', background: '#f0fdf4', borderRadius: '8px', padding: '16px' }}>
                <h4 style={{ fontWeight: '700', marginBottom: '8px', color: '#166534' }}>保守策略</h4>
                <div style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '4px', color: '#374151' }}>
                  <div>30% PSQ</div>
                  <div>70% 现金观望</div>
                  <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>(等待更明确信号)</div>
                </div>
              </div>
            </div>

            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '16px' }}>
              <h4 style={{ fontWeight: '700', marginBottom: '8px', color: '#92400e' }}>分批入场节奏</h4>
              <div style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '8px', color: '#374151' }}>
                <div>• 4月20日: 投入30%资金 (试探性)</div>
                <div>• 4月25日: 如纳指跌破16000，追加30%</div>
                <div>• 5月初: 如出现恐慌性下跌，追加40%</div>
              </div>
            </div>

            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '16px' }}>
              <h4 style={{ fontWeight: '700', marginBottom: '8px', color: '#991b1b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.2rem' }}>⚠️</span>
                止损线设置
              </h4>
              <div style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '8px', color: '#374151' }}>
                <div>• PSQ仓位: 如纳指反弹+10%，先减仓30%</div>
                <div>• 纳指跌幅达25%时，可兑现30%利润</div>
                <div>• 剩余70%持有至8-9月寻找抄底机会</div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'monitor' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* 子Tab导航 */}
            <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {(['overview', 'assumptions', 'indicators', 'stages', 'execution'] as const).map((subTab) => {
                const subLabels: Record<typeof subTab, string> = {
                  overview: '投资总纲',
                  assumptions: '宏观假设',
                  indicators: '指标体系',
                  stages: '阶段划分',
                  execution: '日常执行'
                };
                const isActive = activeSubTab === subTab;
                return (
                  <button
                    key={subTab}
                    onClick={() => setActiveSubTab(subTab)}
                    style={{
                      padding: '8px 16px',
                      fontWeight: '500',
                      background: isActive ? '#3b82f6' : 'white',
                      color: isActive ? 'white' : '#4b5563',
                      border: '1px solid #e5e7eb',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      fontSize: '0.85rem'
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = '#f3f4f6';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.background = 'white';
                      }
                    }}
                  >
                    {subLabels[subTab]}
                  </button>
                );
              })}
            </div>

            {/* 子Tab内容 */}
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

                {/* 优先级排名和实战清单 - 从monitor tab复制完整代码 */}
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
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ 
        background: '#f3f4f6', 
        borderTop: '1px solid #e5e7eb', 
        padding: '16px', 
        borderRadius: '0 0 12px 12px', 
        marginTop: '24px' 
      }}>
        <div style={{ textAlign: 'center', fontSize: '0.85rem', color: '#6b7280' }}>
          <p style={{ fontWeight: '600', marginBottom: '8px' }}>💡 核心投资纪律</p>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
            gap: '8px', 
            marginTop: '12px' 
          }}>
            <div style={{ background: 'white', padding: '8px', borderRadius: '6px', fontSize: '0.8rem' }}>
              现金不是垃圾，是等待的成本
            </div>
            <div style={{ background: 'white', padding: '8px', borderRadius: '6px', fontSize: '0.8rem' }}>
              做空需要耐心，抄底需要勇气
            </div>
            <div style={{ background: 'white', padding: '8px', borderRadius: '6px', fontSize: '0.8rem' }}>
              宁可错过，不要做错
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvestmentPlan2026;
