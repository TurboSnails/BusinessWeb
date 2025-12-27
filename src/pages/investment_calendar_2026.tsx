import React, { useState } from 'react';
import { Calendar, AlertCircle, TrendingDown, TrendingUp, DollarSign, Bell } from 'lucide-react';

const InvestmentCalendar2026 = () => {
  const [activeTab, setActiveTab] = useState('timeline');
  const [checkedItems, setCheckedItems] = useState({});

  const toggleCheck = (id) => {
    setCheckedItems(prev => ({...prev, [id]: !prev[id]}));
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

  return (
    <div className="w-full max-w-6xl mx-auto p-4 bg-gray-50">
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 rounded-t-lg">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <span className="text-4xl">📅</span>
          2026年美股投资计划
        </h1>
        <p className="mt-2 text-blue-100">基于经济衰退预警的系统性风险管理方案</p>
      </div>

      <div className="bg-white border-x border-gray-200">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('timeline')}
            className={`flex-1 py-3 px-4 font-medium transition-colors ${
              activeTab === 'timeline'
                ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            时间轴
          </button>
          <button
            onClick={() => setActiveTab('checklist')}
            className={`flex-1 py-3 px-4 font-medium transition-colors ${
              activeTab === 'checklist'
                ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            执行清单
          </button>
          <button
            onClick={() => setActiveTab('decision')}
            className={`flex-1 py-3 px-4 font-medium transition-colors ${
              activeTab === 'decision'
                ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            决策矩阵
          </button>
          <button
            onClick={() => setActiveTab('shorting')}
            className={`flex-1 py-3 px-4 font-medium transition-colors ${
              activeTab === 'shorting'
                ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            做空条件
          </button>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-b-lg p-6">
        {activeTab === 'timeline' && (
          <div className="space-y-6">
            {timelineData.map((item, index) => (
              <div
                key={index}
                className={`border-l-4 pl-4 py-3 ${
                  item.priority === 'critical'
                    ? 'border-red-500 bg-red-50'
                    : item.priority === 'high'
                    ? 'border-orange-500 bg-orange-50'
                    : 'border-blue-500 bg-blue-50'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-bold text-lg">{item.date}</span>
                      <span className="text-sm text-gray-600">{item.day}</span>
                      {item.time && (
                        <span className="text-sm bg-white px-2 py-1 rounded">
                          {item.time}
                        </span>
                      )}
                    </div>
                    <h3 className="text-xl font-semibold text-gray-800 mb-2">
                      {item.event}
                    </h3>
                    <div className="space-y-1 mb-3">
                      {item.actions.map((action) => (
                        <div key={action.id} className="flex items-start gap-2">
                          <input
                            type="checkbox"
                            id={action.id}
                            checked={checkedItems[action.id] || false}
                            onChange={() => toggleCheck(action.id)}
                            className="mt-1 w-4 h-4 text-blue-600"
                          />
                          <label
                            htmlFor={action.id}
                            className={`text-sm ${
                              checkedItems[action.id]
                                ? 'line-through text-gray-500'
                                : 'text-gray-700'
                            }`}
                          >
                            {action.text}
                          </label>
                        </div>
                      ))}
                    </div>
                    <div className="flex items-start gap-2 text-sm text-gray-600 bg-white bg-opacity-70 p-2 rounded">
                      <span className="text-base">⚠️</span>
                      <span>{item.notes}</span>
                    </div>
                  </div>
                  {item.priority === 'critical' && (
                    <span className="text-2xl flex-shrink-0 ml-4">🔔</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'checklist' && (
          <div className="space-y-6">
            {checklistData.map((section, index) => (
              <div key={index} className="border border-gray-200 rounded-lg p-4">
                <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center gap-2">
                  <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold">
                    {index + 1}
                  </div>
                  {section.category}
                </h3>
                <div className="space-y-2">
                  {section.items.map((item) => (
                    <div key={item.id} className="flex items-start gap-3 p-2 hover:bg-gray-50 rounded">
                      <input
                        type="checkbox"
                        id={item.id}
                        checked={checkedItems[item.id] || false}
                        onChange={() => toggleCheck(item.id)}
                        className="mt-1 w-5 h-5 text-blue-600"
                      />
                      <label
                        htmlFor={item.id}
                        className={`flex-1 cursor-pointer ${
                          checkedItems[item.id]
                            ? 'line-through text-gray-500'
                            : 'text-gray-700'
                        }`}
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
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
                <span className="text-xl">⚠️</span>
                1月20日决策矩阵
              </h3>
              <p className="text-sm text-gray-700">
                根据1月9日失业率报告 + 1月12-16日银行计提数据综合判断
              </p>
            </div>
            {decisionMatrix.map((item, index) => (
              <div
                key={index}
                className="border-2 border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">{item.signal.split(' ')[0]}</span>
                      <span className="font-bold text-gray-800">
                        {item.signal.split(' ')[1]}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600 mb-3">
                      <strong>场景:</strong> {item.scenario}
                    </div>
                    <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-2">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xl">📉</span>
                        <strong className="text-gray-800">操作:</strong>
                      </div>
                      <div className="text-lg font-bold text-orange-600">
                        {item.action}
                      </div>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xl">💰</span>
                        <strong className="text-gray-800">资金配置:</strong>
                      </div>
                      <div className="text-sm text-gray-700">{item.allocation}</div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'shorting' && (
          <div className="space-y-6">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
                <span className="text-xl">📉</span>
                4月底做空入场条件检查表
              </h3>
              <p className="text-sm text-gray-700 mb-4">
                必须同时满足前3个条件才能开始做空,后2个为加强信号
              </p>
              <div className="space-y-3">
                {shortingConditions.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 bg-white p-3 rounded border border-gray-200"
                  >
                    <input
                      type="checkbox"
                      id={item.id}
                      checked={checkedItems[item.id] || false}
                      onChange={() => toggleCheck(item.id)}
                      className="mt-1 w-5 h-5 text-red-600"
                    />
                    <div className="flex-1">
                      <label
                        htmlFor={item.id}
                        className="font-medium text-gray-800 cursor-pointer"
                      >
                        {item.condition}
                      </label>
                      <div className="text-sm text-gray-600 mt-1">
                        {item.weight}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border border-orange-200 bg-orange-50 rounded-lg p-4">
                <h4 className="font-bold mb-2 text-orange-800">激进策略</h4>
                <div className="text-sm space-y-1">
                  <div>60% PSQ (2倍反向纳指)</div>
                  <div>40% TLT (博降息)</div>
                </div>
              </div>
              <div className="border border-blue-200 bg-blue-50 rounded-lg p-4">
                <h4 className="font-bold mb-2 text-blue-800">稳健策略</h4>
                <div className="text-sm space-y-1">
                  <div>40% PSQ</div>
                  <div>40% SH (1倍反向标普)</div>
                  <div>20% TLT</div>
                </div>
              </div>
              <div className="border border-green-200 bg-green-50 rounded-lg p-4">
                <h4 className="font-bold mb-2 text-green-800">保守策略</h4>
                <div className="text-sm space-y-1">
                  <div>30% PSQ</div>
                  <div>70% 现金观望</div>
                  <div className="text-xs text-gray-600">(等待更明确信号)</div>
                </div>
              </div>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
              <h4 className="font-bold mb-2 text-yellow-800">分批入场节奏</h4>
              <div className="text-sm space-y-2">
                <div>• 4月20日: 投入30%资金 (试探性)</div>
                <div>• 4月25日: 如纳指跌破16000，追加30%</div>
                <div>• 5月初: 如出现恐慌性下跌，追加40%</div>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mt-4">
              <h4 className="font-bold mb-2 text-red-800 flex items-center gap-2">
                <span className="text-xl">⚠️</span>
                止损线设置
              </h4>
              <div className="text-sm space-y-2">
                <div>• PSQ仓位: 如纳指反弹+10%，先减仓30%</div>
                <div>• 纳指跌幅达25%时，可兑现30%利润</div>
                <div>• 剩余70%持有至8-9月寻找抄底机会</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-gray-100 border-t border-gray-200 p-4 rounded-b-lg mt-6">
        <div className="text-center text-sm text-gray-600">
          <p className="font-semibold mb-2">💡 核心投资纪律</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-3">
            <div className="bg-white p-2 rounded">
              现金不是垃圾，是等待的成本
            </div>
            <div className="bg-white p-2 rounded">
              做空需要耐心，抄底需要勇气
            </div>
            <div className="bg-white p-2 rounded">
              宁可错过，不要做错
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvestmentPlan2026;