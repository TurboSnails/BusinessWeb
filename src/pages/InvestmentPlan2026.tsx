import React, { useState, useEffect } from 'react';
import { fetchCBOEPCRatios } from '../services/api';

const InvestmentPlan2026 = () => {
  const [activeTab, setActiveTab] = useState<'timeline' | 'checklist' | 'decision' | 'shorting' | 'monitor'>('timeline');
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});
  
  // 市场情绪分析器状态
  const [equityPC, setEquityPC] = useState<string>('');
  const [spxPC, setSpxPC] = useState<string>('');
  const [loadingPCRatios, setLoadingPCRatios] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{
    status: 'safe' | 'warning' | 'danger';
    title: string;
    content: string;
    action: string;
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

  const toggleCheck = (id: string) => {
    setCheckedItems(prev => ({...prev, [id]: !prev[id]}));
  };

  // 市场情绪分析函数
  const analyzeMarket = () => {
    const equity = parseFloat(equityPC);
    const spx = parseFloat(spxPC);
    
    if (isNaN(equity) || isNaN(spx)) {
      alert('请输入有效的数值');
      return;
    }

    let result: typeof analysisResult = null;

    // 核心逻辑分析
    if (equity < 0.7 && spx >= 1.2) {
      result = {
        status: 'safe',
        title: '当前状态：非理性繁荣（有保护）',
        content: '散户在狂欢，但机构买了大量保险。虽然看似危险，但由于对冲充足，短期内很难发生断崖式崩盘。',
        action: '针对 PAAS/RKLB 操作：还没到时候。继续持有现金，不要追高。'
      };
    } else if (equity < 0.7 && spx < 0.9) {
      result = {
        status: 'warning',
        title: '当前状态：裸奔时刻 (红色警报)',
        content: '个股极度贪婪，且机构撤走了对冲保护（或者对冲已经赔光）。这是崩盘前的最危险信号！',
        action: '针对 PAAS/RKLB 操作：握紧你的 1/8 现金，暴风雨可能在 2 周内到来。'
      };
    } else if (equity >= 1.1 && spx < 0.9) {
      result = {
        status: 'danger',
        title: '当前状态：极度恐慌 (崩盘中/末期)',
        content: '散户绝望割肉买入 Puts，而机构已经在低位撤走保险。这就是你要的"黄金坑"。',
        action: '针对 PAAS/RKLB 操作：检查股价！如果 PAAS 到了 $50-51，RKLB 到了 $55，这就是最佳分批建仓时刻。'
      };
    } else if (equity >= 1.1 && spx >= 1.1) {
      result = {
        status: 'warning',
        title: '当前状态：系统性风险爆发',
        content: '全市场都在买保险。虽然恐惧，但说明大家还没放弃抵抗。',
        action: '操作：等待 Equity 继续飙升或 SPX 开始回落（即机构开始投降或直接抛售现货）。'
      };
    } else {
      result = {
        status: 'safe',
        title: '当前状态：震荡修复期',
        content: '多空力量交织，没有明显的极端情绪。保持耐心。',
        action: '操作：继续观察，等待更明确的信号。'
      };
    }

    setAnalysisResult(result);
  };

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
          <span style={{ fontSize: '2.5rem' }}>📅</span>
          2026年美股投资计划
        </h1>
        <p style={{ margin: '8px 0 0', color: 'rgba(255,255,255,0.9)', fontSize: '0.95rem' }}>
          基于经济衰退预警的系统性风险管理方案
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
            {/* 市场情绪分析器 */}
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
                      {loadingPCRatios ? '⏳ 获取中...' : '🔄 自动获取'}
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
                <div style={{ 
                  padding: '12px', 
                  background: '#fffbeb', 
                  border: '1px solid #fde68a',
                  borderRadius: '8px', 
                  fontSize: '0.85rem', 
                  color: '#92400e',
                  lineHeight: '1.6',
                  marginBottom: '12px'
                }}>
                  <div style={{ fontWeight: '600', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    ⚠️ 为什么自动获取可能失败？
                  </div>
                  <div style={{ marginBottom: '10px', paddingLeft: '8px', borderLeft: '3px solid #f59e0b' }}>
                    <p style={{ marginBottom: '6px' }}>
                      <strong>技术原因：</strong>CBOE 页面使用 <strong>JavaScript 动态加载</strong>数据：
                    </p>
                    <ol style={{ marginLeft: '20px', marginBottom: '6px' }}>
                      <li>初始 HTML 是空壳，不包含数据</li>
                      <li>数据通过 JavaScript 异步请求加载</li>
                      <li>我们的方法只能获取静态 HTML，无法执行 JavaScript</li>
                      <li>因此解析不到数据 ❌</li>
                    </ol>
                    <p style={{ marginBottom: '6px', fontSize: '0.8rem', color: '#78350f' }}>
                      💡 <strong>查找结果：</strong>CBOE 没有提供公开的免费 API，第三方数据服务需要付费订阅。
                    </p>
                  </div>
                  <div style={{ fontWeight: '600', marginBottom: '6px', marginTop: '12px' }}>
                    ✅ 解决方案（推荐）：
                  </div>
                  <ol style={{ marginLeft: '20px', marginBottom: '0' }}>
                    <li>点击 <strong>"打开 CBOE 页面"</strong> 按钮</li>
                    <li>等待页面加载完成（约 3-5 秒）</li>
                    <li>在表格中查找以下数据：
                      <ul style={{ marginTop: '4px', marginBottom: '4px' }}>
                        <li><strong>EQUITY PUT/CALL RATIO</strong> (个股看跌/看涨比)</li>
                        <li><strong>SPX + SPXW PUT/CALL RATIO</strong> (标普指数看跌/看涨比)</li>
                      </ul>
                    </li>
                    <li>将数值输入到下方输入框</li>
                  </ol>
                </div>

                <div>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '8px', 
                    fontWeight: '600', 
                    color: '#374151',
                    fontSize: '0.95rem'
                  }}>
                    Equity P/C Ratio (个股比例)
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
                  <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '6px' }}>
                    通常 0.7 以下为贪婪，1.1 以上为恐惧
                  </div>
                </div>

                <div>
                  <label style={{ 
                    display: 'block', 
                    marginBottom: '8px', 
                    fontWeight: '600', 
                    color: '#374151',
                    fontSize: '0.95rem'
                  }}>
                    SPX P/C Ratio (标普指数比例)
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
                  <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '6px' }}>
                    1.2 以上代表机构对冲很强(安全垫)
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
                  </div>
                )}
              </div>
            </div>

            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '16px', marginBottom: '8px' }}>
              <h3 style={{ fontWeight: '700', fontSize: '1.1rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.2rem' }}>👁️</span>
                每日监控自选列表
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#374151' }}>
                建议每天查看这些关键指标，及时捕捉市场信号
              </p>
            </div>

            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
              gap: '16px' 
            }}>
              {monitorList.map((item, index) => (
                <div
                  key={index}
                  style={{
                    border: `2px solid ${item.color}`,
                    background: item.bgColor,
                    borderRadius: '12px',
                    padding: '20px',
                    transition: 'transform 0.2s, box-shadow 0.2s',
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = 'translateY(-4px)';
                    e.currentTarget.style.boxShadow = '0 8px 16px rgba(0,0,0,0.15)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '2rem' }}>{item.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ 
                        fontSize: '1.5rem', 
                        fontWeight: '700', 
                        color: item.color,
                        marginBottom: '4px'
                      }}>
                        {item.code}
                      </div>
                      <div style={{ 
                        fontSize: '1rem', 
                        fontWeight: '600', 
                        color: '#1f2937'
                      }}>
                        {item.name}
                      </div>
                    </div>
                  </div>
                  <div style={{ 
                    fontSize: '0.9rem', 
                    color: '#4b5563',
                    lineHeight: '1.5',
                    paddingTop: '12px',
                    borderTop: `1px solid ${item.color}40`
                  }}>
                    {item.description}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ background: '#e0f2fe', border: '1px solid #7dd3fc', borderRadius: '8px', padding: '16px', marginTop: '8px' }}>
              <h4 style={{ fontWeight: '700', marginBottom: '12px', color: '#0c4a6e', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.2rem' }}>📅</span>
                重要经济数据日历
              </h4>
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', 
                gap: '12px' 
              }}>
                {economicCalendar.map((item, index) => {
                  const bgColor = item.importance === 'critical' ? '#fef2f2' : item.importance === 'high' ? '#fff7ed' : '#f0fdf4';
                  const borderColor = item.importance === 'critical' ? '#fecaca' : item.importance === 'high' ? '#fed7aa' : '#bbf7d0';
                  const textColor = item.importance === 'critical' ? '#991b1b' : item.importance === 'high' ? '#92400e' : '#166534';
                  
                  return (
                    <div
                      key={index}
                      style={{
                        background: bgColor,
                        border: `1px solid ${borderColor}`,
                        borderRadius: '8px',
                        padding: '12px',
                        fontSize: '0.85rem'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <span style={{ fontSize: '1.2rem' }}>{item.icon}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '700', color: textColor, marginBottom: '2px' }}>
                            {item.event}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                            {item.frequency} • {item.time}
                          </div>
                        </div>
                      </div>
                      <div style={{ color: '#4b5563', fontSize: '0.8rem', lineHeight: '1.4' }}>
                        {item.description}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '8px', padding: '16px', marginTop: '8px' }}>
              <h4 style={{ fontWeight: '700', marginBottom: '8px', color: '#92400e', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.2rem' }}>💡</span>
                监控要点
              </h4>
              <div style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '8px', color: '#374151' }}>
                <div><strong>KRE:</strong> 关注是否跌破关键支撑位，区域银行是地产风险的先行指标</div>
                <div><strong>XHB:</strong> 建筑商持续走弱可能预示地产周期下行</div>
                <div><strong>GDX/GLD:</strong> 避险资金流入黄金通常意味着市场风险偏好下降</div>
                <div><strong>VIX:</strong> 持续在25以上表明市场从"阴跌"转为"恐慌跌"，需要高度警惕</div>
                <div><strong>DXY:</strong> 美元指数&gt;105通常压制风险资产，&lt;100可能利好新兴市场</div>
                <div><strong>10年期美债:</strong> 收益率&gt;4.5%可能吸引资金从股市流出，倒挂持续需警惕衰退</div>
                <div><strong>BTC:</strong> 比特币上涨通常反映风险偏好上升，下跌可能预示避险情绪</div>
                <div><strong>恐慌贪婪指数:</strong> &lt;20极度恐慌（抄底机会），&gt;80极度贪婪（减仓信号）</div>
              </div>
            </div>

            <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '16px', marginTop: '8px' }}>
              <h4 style={{ fontWeight: '700', marginBottom: '12px', color: '#166534', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.2rem' }}>🔗</span>
                常用资源
              </h4>
              <div style={{ fontSize: '0.9rem', display: 'flex', flexDirection: 'column', gap: '8px', color: '#374151' }}>
                <div style={{ marginBottom: '8px', fontWeight: '600', color: '#1f2937' }}>📊 股票/ETF</div>
                <a 
                  href="https://finance.yahoo.com/quote/NAVI/" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{
                    color: '#2563eb',
                    textDecoration: 'none',
                    padding: '8px 12px',
                    background: 'white',
                    borderRadius: '6px',
                    border: '1px solid #bfdbfe',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    transition: 'all 0.2s',
                    maxWidth: 'fit-content',
                    marginBottom: '8px'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#eff6ff';
                    e.currentTarget.style.borderColor = '#3b82f6';
                    e.currentTarget.style.textDecoration = 'underline';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'white';
                    e.currentTarget.style.borderColor = '#bfdbfe';
                    e.currentTarget.style.textDecoration = 'none';
                  }}
                >
                  <span>📊</span>
                  <span>Yahoo Finance - NAVI</span>
                  <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>↗</span>
                </a>
                
                <div style={{ marginTop: '12px', marginBottom: '8px', fontWeight: '600', color: '#1f2937' }}>🏛️ 官方数据源</div>
                {[
                  { name: '美联储官网 (FOMC)', url: 'https://www.federalreserve.gov/', icon: '🏦' },
                  { name: '美国劳工统计局 (BLS)', url: 'https://www.bls.gov/', icon: '📈' },
                  { name: '美国经济分析局 (BEA)', url: 'https://www.bea.gov/', icon: '📊' },
                  { name: '美国财政部', url: 'https://home.treasury.gov/', icon: '💰' }
                ].map((link, idx) => (
                  <a 
                    key={idx}
                    href={link.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{
                      color: '#2563eb',
                      textDecoration: 'none',
                      padding: '8px 12px',
                      background: 'white',
                      borderRadius: '6px',
                      border: '1px solid #bfdbfe',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'all 0.2s',
                      maxWidth: 'fit-content',
                      marginBottom: '8px'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#eff6ff';
                      e.currentTarget.style.borderColor = '#3b82f6';
                      e.currentTarget.style.textDecoration = 'underline';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'white';
                      e.currentTarget.style.borderColor = '#bfdbfe';
                      e.currentTarget.style.textDecoration = 'none';
                    }}
                  >
                    <span>{link.icon}</span>
                    <span>{link.name}</span>
                    <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>↗</span>
                  </a>
                ))}
                
                <div style={{ marginTop: '12px', marginBottom: '8px', fontWeight: '600', color: '#1f2937' }}>📰 财经新闻</div>
                {[
                  { name: 'Bloomberg', url: 'https://www.bloomberg.com/', icon: '📰' },
                  { name: 'Reuters', url: 'https://www.reuters.com/', icon: '📰' },
                  { name: 'WSJ (华尔街日报)', url: 'https://www.wsj.com/', icon: '📰' },
                  { name: 'CNBC', url: 'https://www.cnbc.com/', icon: '📺' },
                  { name: 'MarketWatch', url: 'https://www.marketwatch.com/', icon: '📊' }
                ].map((link, idx) => (
                  <a 
                    key={idx}
                    href={link.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{
                      color: '#2563eb',
                      textDecoration: 'none',
                      padding: '8px 12px',
                      background: 'white',
                      borderRadius: '6px',
                      border: '1px solid #bfdbfe',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'all 0.2s',
                      maxWidth: 'fit-content',
                      marginBottom: '8px'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#eff6ff';
                      e.currentTarget.style.borderColor = '#3b82f6';
                      e.currentTarget.style.textDecoration = 'underline';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'white';
                      e.currentTarget.style.borderColor = '#bfdbfe';
                      e.currentTarget.style.textDecoration = 'none';
                    }}
                  >
                    <span>{link.icon}</span>
                    <span>{link.name}</span>
                    <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>↗</span>
                  </a>
                ))}
                
                <div style={{ marginTop: '12px', marginBottom: '8px', fontWeight: '600', color: '#1f2937' }}>📅 数据日历</div>
                {[
                  { name: 'Investing.com 经济日历', url: 'https://www.investing.com/economic-calendar/', icon: '📅' },
                  { name: 'Trading Economics', url: 'https://tradingeconomics.com/calendar', icon: '📅' },
                  { name: 'CNN 恐慌贪婪指数', url: 'https://www.cnn.com/markets/fear-and-greed', icon: '😱' }
                ].map((link, idx) => (
                  <a 
                    key={idx}
                    href={link.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    style={{
                      color: '#2563eb',
                      textDecoration: 'none',
                      padding: '8px 12px',
                      background: 'white',
                      borderRadius: '6px',
                      border: '1px solid #bfdbfe',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'all 0.2s',
                      maxWidth: 'fit-content',
                      marginBottom: '8px'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#eff6ff';
                      e.currentTarget.style.borderColor = '#3b82f6';
                      e.currentTarget.style.textDecoration = 'underline';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'white';
                      e.currentTarget.style.borderColor = '#bfdbfe';
                      e.currentTarget.style.textDecoration = 'none';
                    }}
                  >
                    <span>{link.icon}</span>
                    <span>{link.name}</span>
                    <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>↗</span>
                  </a>
                ))}
              </div>
            </div>
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
