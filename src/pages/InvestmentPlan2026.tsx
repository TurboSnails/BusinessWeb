import React, { useState, useEffect } from 'react';
import { fetchCBOEPCRatios, fetchEarningsCalendar, type EarningsCalendarItem } from '../services/api';
import {
  Calendar,
  ListTodo,
  Activity,
  CircleDollarSign,
  ClipboardCheck,
  TrendingDown,
  Target,
  ShieldCheck,
  AlertTriangle,
  TrendingUp,
  BarChart2,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  Briefcase,
  Wallet,
  Coins,
  ArrowRight,
  Info,
  Shield,
  Zap,
  Cpu,
  FileText,
  Building2,
  Construction,
  Trophy,
  DollarSign,
  AlertCircle,
  ChevronUp,
  ChevronDown,
  Users,
  CreditCard,
  Skull
} from 'lucide-react';
import {
  tableWrapperStyle,
  tableStyle,
  thStyle,
  tdStyle,
  getTrStyle,
  contentStyle
} from '../components/TableStyles';

const StatusBadge: React.FC<{ type: 'red' | 'orange' | 'green' | 'blue', text: string }> = ({ type, text }) => {
  const styles = {
    red: { bg: 'var(--system-red-light)', color: 'var(--system-red)', border: 'rgba(255, 59, 48, 0.2)' },
    orange: { bg: 'rgba(255, 149, 0, 0.1)', color: 'var(--system-orange)', border: 'rgba(255, 149, 0, 0.2)' },
    green: { bg: 'var(--system-green-light)', color: 'var(--system-green)', border: 'rgba(52, 199, 89, 0.2)' },
    blue: { bg: 'var(--system-blue-light)', color: 'var(--system-blue)', border: 'rgba(0, 122, 255, 0.2)' }
  }
  const current = styles[type]
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '6px 12px',
      borderRadius: '8px',
      background: current.bg,
      color: current.color,
      fontWeight: '700',
      fontSize: '0.8rem',
      whiteSpace: 'nowrap',
      border: `1px solid ${current.border}`
    }}>
      <div style={{
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: current.color,
        boxShadow: `0 0 6px ${current.color}`
      }} />
      {text}
    </div>
  )
}

const InvestmentPlan2026 = () => {
  const [activeTab, setActiveTab] = useState<'timeline' | 'checklist' | 'macro' | 'earnings' | 'shorting' | 'profit-taking' | 'macro-risk'>('timeline');
  const [activeSubTab, setActiveSubTab] = useState<'overview' | 'assumptions' | 'indicators' | 'stages' | 'execution'>('overview');
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean>>({});

  // 页面加载时滚动到顶部
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const toggleCheck = (id: string) => {
    setCheckedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // 市场情绪分析器状态
  const [equityPC, setEquityPC] = useState<string>('');
  const [spxPC, setSpxPC] = useState<string>('');
  const [vixNear, setVixNear] = useState<string>(''); // VIX 近月
  const [vixFar, setVixFar] = useState<string>(''); // VIX 远月 (VXV)
  const [netGEX, setNetGEX] = useState<string>(''); // Net GEX
  const [goldSilverRatio, setGoldSilverRatio] = useState<string>(''); // 金银比
  const [loadingPCRatios, setLoadingPCRatios] = useState(false);
  // 财报日历状态
  const [earningsData, setEarningsData] = useState<EarningsCalendarItem[]>([]);
  const [loadingEarnings, setLoadingEarnings] = useState(false);

  // 宏观风险评分数据 (2026年1月基准)
  const [macroRiskScores] = useState({
    // 就业维度 (0-10)
    employment_official: 4,  // 非农回修+失业率尚可
    employment_market: 6,    // 利差开始走阔
    employment_alt: 7,       // 岗位投放下降明显

    // 消费信用维度 (0-10)
    credit_official: 6,      // 储蓄率低位、信贷余额高
    credit_market: 7,        // 次级ABS利差扩大
    credit_alt: 8,           // 刷卡数据转弱、车贷逾期极值

    // 银行流动性维度 (0-10)
    bank_official: 5,        // 拨备增加但未暴雷
    bank_market: 6,          // 区域银行股承压
    bank_alt: 5,             // 货币基金流入温和
  });
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

  // 自动加载财报日历数据
  useEffect(() => {
    if (activeTab === 'earnings' && earningsData.length === 0 && !loadingEarnings) {
      setLoadingEarnings(true);
      fetchEarningsCalendar(7)
        .then(data => {
          console.log('获取到财报数据:', data.length, '条');
          setEarningsData(data);
        })
        .catch(error => {
          console.error('Failed to fetch earnings calendar:', error);
          setEarningsData([]);
        })
        .finally(() => {
          setLoadingEarnings(false);
        });
    }
  }, [activeTab]);

  // 恢复之前的数据结构
  const timelineData = [
    {
      date: '2026年1月9日',
      day: '周五',
      event: '12月非农就业报告',
      time: '美东8:30',
      priority: 'critical',
      completed: true,
      isTable: true,
      actions: [
        { id: 'jan9-alert', text: '🎯 **核心结论：劳动力市场降温但稳定，软着陆确认 → 市场反应积极，AI生产力叙事推动科技股**', isAlert: true },
        { id: 'jan9-header-1', text: '## 📊 关键数据一览', isHeader: true },
        { id: 'jan9-table-1', text: '**新增非农**|5万|16.8万|⚠️ 远低于预期', isTableRow: true },
        { id: 'jan9-table-2', text: '**失业率**|4.4%|4.5%|✅ 好于预期（前值4.6%）', isTableRow: true },
        { id: 'jan9-table-3', text: '**平均时薪**|$37.02|+3.8%同比|⚠️ 通胀顽固信号', isTableRow: true },
        { id: 'jan9-table-4', text: '**11月修正**|5.6万|-|⚠️ 前值下修', isTableRow: true },
        { id: 'jan9-table-5', text: '**10月修正**|-17.3万|-|⚠️ 两月合计下修7.6万', isTableRow: true },
        { id: 'jan9-divider-1', text: '---', isHeader: true },
        { id: 'jan9-header-2', text: '## 🔍 核心经济信号', isHeader: true },
        { id: 'jan9-1', text: '📉 **就业增长放缓**：月均增长降至4.9万，全年仅58.4万（2003年来最低）' },
        { id: 'jan9-2', text: '🤖 **AI驱动裁员**：科技巨头AI驱动裁员影响超18万岗位' },
        { id: 'jan9-3', text: '🔄 **结构性转移**：科技→服务/医疗业，参与率下滑掩盖失业压力' },
        { id: 'jan9-4', text: '✅ **无衰退迹象**：招聘疲软而非裁员潮' },
        { id: 'jan9-divider-2', text: '---', isHeader: true },
        { id: 'jan9-header-3', text: '## 🏦 美联储政策含义', isHeader: true },
        { id: 'jan9-5', text: '💰 **通胀顽固**：时薪涨3.8%显示通胀顽固，强化高利率维持' },
        { id: 'jan9-6', text: '📊 **降息概率**：1月降息概率<5%' },
        { id: 'jan9-7', text: '🎯 **市场解读**："软着陆"确认——招聘疲软而非裁员潮，支持观望而非紧急行动' },
        { id: 'jan9-divider-3', text: '---', isHeader: true },
        { id: 'jan9-header-4', text: '## 📈 市场即时反应', isHeader: true },
        { id: 'jan9-8', text: '🟢 **道指**：+0.48%' },
        { id: 'jan9-9', text: '🟢 **标普**：+0.65%' },
        { id: 'jan9-10', text: '🟢 **纳指**：+0.81%（创纪录）' },
        { id: 'jan9-11', text: '💡 **投资者情绪**：视AI重塑生产力为利好，消退衰退担忧，转向韧性叙事和板块轮动' }
      ],
      notes: '数据解读：美国12月非农就业数据显示新增岗位仅5万（远低于预期），失业率意外降至4.4%，前值大幅下修，反映劳动力市场降温但稳定。核心信号是就业增长放缓但无衰退迹象，结构性转移明显（科技→服务/医疗）。美联储政策立场强化，1月降息概率极低。市场反应积极，视为"软着陆"确认，AI生产力叙事推动科技股上涨。'
    },
    {
      date: '2026年1月11日',
      day: '周四',
      event: '12月CPI通胀数据',
      time: '美东8:30',
      priority: 'critical',
      completed: true,
      isTable: true,
      actions: [
        { id: 'jan11-alert', text: '🎯 **核心结论：软着陆确认，但通胀仍顽固 → 维持中性偏防御配置（75-80%仓位）**', isAlert: true },
        { id: 'jan11-header-1', text: '## 📊 关键数据一览', isHeader: true },
        { id: 'jan11-table-1', text: '**核心CPI环比**|+0.2%|+0.3%|✅ 低于预期', isTableRow: true },
        { id: 'jan11-table-2', text: '**核心CPI同比**|+2.6%|+3.0%|✅ 低于预期', isTableRow: true },
        { id: 'jan11-table-3', text: '**超级核心通胀**|<0.4%环比|-|✅ 温和', isTableRow: true },
        { id: 'jan11-table-4', text: '**时薪同比**|+3.8%|<3.8%|⚠️ 触及阈值', isTableRow: true },
        { id: 'jan11-table-5', text: '**非农新增**|5万|16.8万|⚠️ 显著低于预期', isTableRow: true },
        { id: 'jan11-divider-1', text: '---', isHeader: true },
        { id: 'jan11-header-2', text: '## 📋 详细数据解读', isHeader: true },
        { id: 'jan11-1', text: '📊 **整体CPI**：核心CPI环比+0.2%（预期+0.3%，✅低于预期），同比+2.6%（预期+3.0%，✅低于预期），通胀压力缓解' },
        { id: 'jan11-2', text: '🎯 **核心CPI（剔除食品和能源）**：重点关注服务通胀（住房、医疗、教育等），这是Fed最关心的指标，本次数据温和' },
        { id: 'jan11-3', text: '💰 **住房成本（Shelter）**：占CPI权重约1/3，观察是否继续放缓（11月环比+0.3%，同比+5.2%）' },
        { id: 'jan11-4', text: '📈 **超级核心通胀（Supercore，剔除住房）**：环比<0.4%（✅温和），反映服务需求未失控' },
        { id: 'jan11-divider-2', text: '---', isHeader: true },
        { id: 'jan11-header-3', text: '## 🏦 Fed政策含义', isHeader: true },
        { id: 'jan11-5', text: '📅 **降息时间**：核心CPI+0.2%环比 → 降息可能延后至Q2（6月），1月暂停几乎确定' },
        { id: 'jan11-6', text: '⚠️ **制约因素**：时薪3.8%仍高 → Fed不会激进降息' },
        { id: 'jan11-7', text: '📊 **与就业数据结合**：时薪+3.8%（⚠️触及阈值）+ CPI符合预期 → 软着陆确认；劳动力市场冷却（非农仅5万）+ 通胀降温' },
        { id: 'jan11-divider-3', text: '---', isHeader: true },
        { id: 'jan11-header-4', text: '## 🔍 市场反应', isHeader: true },
        { id: 'jan11-8', text: '📈 CPI符合/低于预期 → 风险资产获支撑（SPY创新高）但上行受限，降息预期升温' },
        { id: 'jan11-divider-4', text: '---', isHeader: true },
        { id: 'jan11-header-5', text: '## ⚠️ 关键阈值与操作建议', isHeader: true },
        { id: 'jan11-9', text: '🔴 **立即减仓至70%**：核心CPI环比>0.4%' },
        { id: 'jan11-10', text: '🟢 **可考虑加仓至80%**：核心CPI环比<0.1%' },
        { id: 'jan11-11', text: '⚠️ **警惕工资-物价螺旋**：时薪>3.8%' },
        { id: 'jan11-12', text: '📈 **观察指标**：PCE平减指数（Fed更偏好，但滞后1个月）、CPI分项（交通、医疗、教育服务）' },
        { id: 'jan11-13', text: '💡 **操作建议**：数据发布后30分钟内观察市场反应，若VIX>20且SPY跌>1% → 触发防御模式，增持现金和国债' },
        { id: 'jan11-divider-5', text: '---', isHeader: true },
        { id: 'jan11-header-6', text: '## 💡 下次数据防御触发条件', isHeader: true },
        { id: 'jan11-14', text: '🔴 **减仓至70%**：1月CPI环比>0.3% 且 时薪>4%' },
        { id: 'jan11-15', text: '🟢 **加仓至85%**：1月CPI环比<0.2% 且 非农反弹>10万' }
      ],
      notes: '数据解读：CPI温和+非农疲软确认软着陆，但时薪3.8%临界阈值警示通胀未死。重点观察：1月PCE数据（Fed首选通胀指标）、2月非农（1月就业数据）、Fed 1月会议纪要（暂停降息确认）'
    },
    {
      date: '2026年1月12-16日',
      day: '周一至周五',
      event: '📊 信贷拐点速查表',
      time: '盘后发布',
      priority: 'critical',
      completed: true, // 速查表内容，不需要勾选框
      isTable: true, // 标记为表格类型，使用特殊渲染
      actions: [
        { id: 'jan12-header-1', text: '## 一、关键数据监控（每周更新）', isHeader: true },
        { id: 'jan12-table-1', text: '**HY OAS**|~270bps|~260bps|>320bps|🟢', isTableRow: true },
        { id: 'jan12-table-2', text: '**IG OAS**|~80bps|~85bps|>150bps|🟢', isTableRow: true },
        { id: 'jan12-table-3', text: '**VIX**|14-15|13-14|>20|🟢', isTableRow: true },
        { id: 'jan12-table-4', text: '**XLF跑输SPY**|1周|0周|≥4周|🟡', isTableRow: true },
        { id: 'jan12-table-5', text: '**JPM 拨备**|$46.6bn (+77%)|$35bn (+32%)|连续2季>+30%|🟡', isTableRow: true },
        { id: 'jan12-table-6', text: '**BAC 拨备**|$13-14bn (-10%)|$15bn (+18%)|连续2季>+30%|🟢', isTableRow: true },
        { id: 'jan12-table-7', text: '**WFC 拨备**|$10.4bn (-5%)|$11bn (负)|连续2季>+30%|🟢', isTableRow: true },
        { id: 'jan12-table-8', text: '**C 拨备**|$22bn (-14%)|$18bn (+22%)|连续2季>+30%|🟢', isTableRow: true },
        { id: 'jan12-table-9', text: '**信用卡违约**|2.1-2.3%|2.0-2.2%|>3.5%|🟢', isTableRow: true },
        { id: 'jan12-table-10', text: '**CRE违约**|~1.2%|~1.1%|>2.5%|🟢', isTableRow: true },
        { id: 'jan12-table-11', text: '**SLOOS 消费贷**|+2~+4|+3~+5|>+10|🟢', isTableRow: true },
        { id: 'jan12-table-12', text: '**SLOOS 商业贷**|~+5|~+6|>+15|🟢', isTableRow: true },
        { id: 'jan12-stage', text: '**当前阶段：🟡 Stage 1 - 预警期**\n**数据更新日期：2026-01-23**', isHeader: true },
        { id: 'jan12-divider', text: '---', isHeader: true },
        { id: 'jan12-header-2', text: '## 二、银行与市场数据深度分析', isHeader: true },
        { id: 'jan12-alert', text: '> **综合评估：市场流动性充裕，银行拨备谨慎但可控，信用质量整体稳定 → 维持Stage 1防守配置**' },
        { id: 'jan12-data-1', text: '📊 **VIX (恐慌指数)**：最新15.73（1/22），1/21收盘20.09 → 处于低至中等水平，市场恐慌情绪整体温和，未触发>20阈值' },
        { id: 'jan12-data-2', text: '💰 **HY OAS (高收益债利差)**：2.73%（极窄），处于历史低位 → 市场风险溢价被极度压缩，资金环境宽松' },
        { id: 'jan12-data-3', text: '📈 **IG OAS (投资级债利差)**：约0.76%，处于历史低位 → 企业融资成本相对国债溢价极小' },
        { id: 'jan12-data-4', text: '🏦 **XLF vs SPY**：XLF YTD -0.95%，最新$54.44 → 金融板块表现相对大盘略显疲弱，需关注' },
        { id: 'jan12-data-5', text: '🔴 **JPM拨备**：$46.6亿（Q4），同比+77%，净冲销$25.1亿（+5%）→ ⚠️包含~$22亿Apple Card储备，2026信用卡冲销率指引3.4%' },
        { id: 'jan12-data-6', text: '🟢 **BAC拨备**：$13.1亿（Q4），低于预期$1.9亿，净冲销$13亿（环比-$1亿，同比-$2亿）→ 信用质量稳定' },
        { id: 'jan12-data-7', text: '🟢 **WFC拨备**：$10.4亿（Q4），净冲销-13% → 虽净冲销下降，但银行增加储备应对潜在放缓' },
        { id: 'jan12-data-8', text: '🟡 **C拨备**：$22.2亿（Q4），零售服务净信用损失率5.73%，总储备>$210亿 → 主要来自美国信用卡净损失' },
        { id: 'jan12-data-9', text: '💳 **信用卡违约**：行业层面Q3冲销率3.92%（环比↓），逾期率2.98%（稳定↓）→ 四大行Q4整体稳定或改善，无显著恶化' },
        { id: 'jan12-data-10', text: '🏢 **CRE违约（商业地产）**：Q4未见大幅上升，四大行CRE暴露整体可控，无重大违约爆发信号' },
        { id: 'jan12-data-11', text: '📋 **SLOOS消费贷**（10月调查）：信用卡标准基本不变，汽车贷款标准有所放松 → 整体消费贷标准未显著收紧' },
        { id: 'jan12-data-12', text: '📋 **SLOOS商业贷**（10月调查）：部分银行C&I贷款标准收紧，商业地产标准和需求大多不变 → 商业贷款仍有谨慎收紧迹象' },
        { id: 'jan12-divider-2', text: '---', isHeader: true },
        { id: 'jan12-header-3', text: '## 三、关键信号与操作建议', isHeader: true },
        { id: 'jan12-signal', text: '⚠️ **关键信号**：除JPM因Apple Card特殊交易大幅增加拨备外，其他银行保持温和或下降；金融板块XLF短期弱势反映监管和政策不确定性' },
        { id: 'jan12-action', text: '💡 **操作建议**：维持Stage 1防守配置（总仓位70-75%），密切关注下一期SLOOS（2026年2月初发布），若HY OAS升至>300bps或XLF连续跑输≥4周则考虑升级防御' },
        { id: 'jan12-principle', text: '> **当前数据支持「降仓+防守」  \n> 不支持「方向性做空」  \n> 等市场用钱投票**' }
      ],
      notes: '数据来源：四大行2025年Q4财报（1/13-14发布）、SLOOS 2025年10月调查（11/3发布）。下一期SLOOS（2026年1月调查）预计2026年2月初发布。'
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
        { id: 'feb6-1', text: '📊 如失业率连续3个月上升且合计≥0.5个百分点 → 启动"衰退确认模式"' },
        { id: 'feb6-2', text: '🚨 立即清仓所有剩余YINN(如有),强制止损:标普回撤10%且VIX>25' },
        { id: 'feb6-3', text: '💼 现金占比提升至60-70%,黄金15-20%,保留10-15%优质防御资产' },
        { id: 'feb6-4', text: '📈 观察技术面:纳指/标普200日均线,VIX水平,信用利差(IG/HY)' },
        { id: 'feb6-5', text: '准备4月做空窗口期,研究PSQ/SH+TLT交易规则和仓位上限' }
      ],
      notes: '二次确认:从单月点位改为趋势判断,增加技术面和情绪指标辅助'
    },
    {
      date: '2026年3月全月',
      day: '观察期',
      event: '可能出现假反弹',
      time: '持续观察',
      priority: 'medium',
      actions: [
        { id: 'mar-1', text: '❌ 不要在3月任何时候抄底,等待多条件确认' },
        { id: 'mar-2', text: '❌ 不要被"V型反转"迷惑,观察技术面是否真正突破200日均线' },
        { id: 'mar-3', text: '✅ 持有60-70%现金,享受4.5%收益,保留10-20%优质资产' },
        { id: 'mar-4', text: '📊 每周监控:KRE(区域银行ETF)、VIX、信用利差、技术面指标' },
        { id: 'mar-5', text: '⚠️ 如出现反弹,观察是否伴随成交量放大和情绪指标改善(VIX回落)' }
      ],
      notes: '历史上危机初期常有15-20%假反弹:增加技术面和情绪指标验证,避免过早入场'
    },
    {
      date: '2026年3月18日',
      day: '周三',
      event: 'FOMC会议+点阵图（做空关键触发点）',
      time: '美东14:00',
      priority: 'critical',
      actions: [
        { id: 'mar18-1', text: '📊 核心监控:2026年降息次数预期（点阵图）' },
        { id: 'mar18-2', text: '🚨 如果点阵图显示<2次降息 → 股债双杀信号，立即准备第一批做空20%' },
        { id: 'mar18-3', text: '⚠️ 这是做空的最关键触发点，不要等到4月底' },
        { id: 'mar18-4', text: '📈 同时观察:VIX水平、10年期美债收益率、黄金/纳指比' }
      ],
      notes: '修正:3月18日FOMC会议是真正的做空触发点，而非4月底。如果<2次降息，市场会立即反应，这是最高效的做空窗口。'
    },
    {
      date: '2026年3月末-4月初',
      day: '关键窗口',
      event: '基于3月就业数据做空建仓',
      time: '4月初公布3月数据',
      priority: 'critical',
      actions: [
        { id: 'mar-end-1', text: '📊 4月初关注3月失业率趋势:连续3个月上升且合计≥0.5个百分点' },
        { id: 'mar-end-2', text: '✅ 如果失业率趋势恶化 → 第二批做空30%（基于3月数据，而非等到4月数据）' },
        { id: 'mar-end-3', text: '⚠️ 注意:4月公布的失业数据反映3月情况，此时宏观预期已在3月18日被确认' },
        { id: 'mar-end-4', text: '📈 同时观察:银行拨备趋势、科技股财报指引、技术面破位' }
      ],
      notes: '修正:基于3月就业数据（4月初公布）进行第二批建仓，不要等到4月数据。失业率数据有滞后性，需要提前布局。'
    },
    {
      date: '2026年4月15-30日',
      day: '关键月',
      event: 'Q1财报季+做空补充建仓',
      time: '盘后',
      priority: 'high',
      actions: [
        { id: 'apr-1', text: '4/20-25: 特斯拉、Netflix财报(看消费意愿)' },
        { id: 'apr-2', text: '4/27-30: 微软、谷歌、Meta(看AI投入产出)' },
        { id: 'apr-3', text: '📊 重点关注富国银行商业地产计提趋势(同比增速和分位)' },
        { id: 'apr-4', text: '📈 观察KRE是否跌破2023年低点($40),技术面确认' },
        { id: 'apr-5', text: '💼 4月20日:第三批做空20%（补充机会，如果前两批未完全建仓）' },
        { id: 'apr-6', text: '📈 情绪指标:VIX水平、信用利差(IG/HY)是否恶化' }
      ],
      notes: '修正:4月是补充建仓期，而非首次建仓期。主要建仓应在3月18日后和3月末-4月初完成。'
    },
    {
      date: '2026年5月初',
      day: '风险释放期',
      event: 'Fed主席换届+财报尾声',
      time: '全天',
      priority: 'critical',
      actions: [
        { id: 'may-1', text: '🚨 5月Fed主席换届: Powell离任，新主席上任，VIX可能飙升至30+' },
        { id: 'may-2', text: '⚠️ 关键策略:只保留10%做空仓位应对黑天鹅，不继续建仓' },
        { id: 'may-3', text: '📊 如果已建仓70%以上，5月初减仓至10%，避免极端波动清仓' },
        { id: 'may-4', text: '📈 财报:苹果、亚马逊、英伟达(5/20左右) - AI最终审判日' },
        { id: 'may-5', text: '❌ 不要因为恐慌性下跌而追加做空仓位，5月是风险释放期而非建仓期' }
      ],
      notes: '修正:5月Fed换届是风险释放期而非建仓期。此时做空容易被极端波动清仓，应在5月前完成主要建仓。'
    },
    {
      date: '2026年6-7月',
      day: '危机爆发期',
      event: '商业地产雷集中引爆',
      time: '持续观察',
      priority: 'high',
      actions: [
        { id: 'jun-1', text: '📊 2016-2019年商业地产贷款集中到期,观察违约率和展期情况' },
        { id: 'jun-2', text: '关注中小房企违约新闻,但避免过度时间前瞻(路径高度不确定)' },
        { id: 'jun-3', text: '关注区域银行是否出现"挤兑",KRE走势' },
        { id: 'jun-4', text: '✅ 继续持有PSQ,但设置客观止损:如组合回撤15%必须减仓30%' },
        { id: 'jun-5', text: '📈 如纳指跌幅达25%且技术面确认(破位+VIX高位),可兑现30%利润' },
        { id: 'jun-6', text: '📊 持续监控:VIX、信用利差、技术面指标,为抄底做准备' }
      ],
      notes: '危机爆发期:避免过度剧本化,增加客观风控规则,持续观察多指标'
    },
    {
      date: '2026年8-9月',
      day: '抄底准备期',
      event: '寻找市场底部',
      time: '持续观察',
      priority: 'high',
      actions: [
        { id: 'aug-1', text: '✅ 条件1: 标普500从高点回撤>30% + 技术面确认(200日均线附近或突破)' },
        { id: 'aug-2', text: '✅ 条件2: 美联储紧急降息至2%以下' },
        { id: 'aug-3', text: '✅ 条件3: 政府推出万亿级刺激' },
        { id: 'aug-4', text: '✅ 条件4: VIX从50+回落至35以下(情绪指标改善)' },
        { id: 'aug-5', text: '✅ 条件5: 信贷数据连续两周正增长 + 信用利差收窄' },
        { id: 'aug-6', text: '📊 五条件全满足→三批抄底:30%/35%/35%' },
        { id: 'aug-7', text: '⚠️ 只满足3-4个条件→减少首批投入:20%/30%/50%,时间拉长,留更多弹药' },
        { id: 'aug-8', text: '💼 抄底结构(优先级):1)优质债 2)盈利稳定蓝筹 3)高贝塔成长(最后加仓)' },
        { id: 'aug-9', text: '📈 技术面辅助:观察是否真正突破200日均线,成交量是否放大' },
        { id: 'aug-10', text: '🛡️ 风控:如抄底后组合回撤10%,暂停后续批次,重新评估' }
      ],
      notes: '抄底准备期:从全满足改为分级响应,增加资产优先级和风控规则,避免过早或过度抄底 | 资金:50%现金+30%PSQ获利+20%黄金减仓'
    }
  ];

  const checklistData = [
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
        { id: 'mar-apr-6', text: '3月18日FOMC会议后评估是否满足做空条件，开始第一批建仓' },
        { id: 'mar-apr-7', text: '3月末-4月初基于3月就业数据评估第二批建仓' }
      ]
    },
    {
      category: '2026年5-9月 - 止盈与减仓规则（量化标准）',
      items: [
        {
          id: 'may-sep-1',
          text: '📊 基准点：以2026年纳指高点为基准（记录具体点位）',
          detail: '例如：纳指2026年高点为18,000点，以此为基准计算回撤'
        },
        {
          id: 'may-sep-2',
          text: '💰 纳指从高点回撤20%：止盈空头仓位30%',
          detail: '触发条件：纳指跌至14,400点（假设高点18,000）。执行：卖出30% PSQ/SH仓位，锁定利润'
        },
        {
          id: 'may-sep-3',
          text: '💰 纳指从高点回撤30%：再止盈空头仓位30%',
          detail: '触发条件：纳指跌至12,600点。执行：再卖出30%空头仓位，累计已止盈60%'
        },
        {
          id: 'may-sep-4',
          text: '💰 纳指从高点回撤40%：择机平掉大部分空头',
          detail: '触发条件：纳指跌至10,800点。执行：平掉剩余空头的70-80%，保留10-20%作为对冲'
        },
        {
          id: 'may-sep-5',
          text: '⚠️ 恐慌加速规则：VIX>40 或信用利差(IG/HY)极度走阔时，加快平仓节奏',
          detail: '触发条件：VIX>40 或 IG信用利差>200bp / HY利差>800bp。执行：在达到上述回撤点位时，提前5-10%止盈'
        }
      ]
    },
    {
      category: '2026年5-9月 - 每月1日评估表（量化Checklist）',
      items: [
        {
          id: 'may-sep-6',
          text: '✅ 失业率评估：是否连续3个月上升且合计≥0.5个百分点？',
          detail: '数据源：BLS每月第一个周五8:30发布。阈值：连续上升+合计≥0.5% = 满足'
        },
        {
          id: 'may-sep-7',
          text: '银行拨备评估：拨备增速是否连续两季>30%或相对历史分位>75%？',
          detail: '数据源：JPM/BAC/WFC/C季度财报。阈值：连续两季>30%或分位>75% = 满足'
        },
        {
          id: 'may-sep-8',
          text: '✅ 科技指引评估：3家以上科技龙头指引是否继续下修？',
          detail: '数据源：MSFT/GOOGL/META/AAPL季度指引。阈值：≥3家下修 = 满足'
        },
        {
          id: 'may-sep-9',
          text: '✅ 信用利差评估：IG/HY信用利差是否继续走阔？',
          detail: '数据源：Bloomberg/FRED。阈值：IG>150bp或HY>600bp且继续上升 = 满足'
        },
        {
          id: 'may-sep-10',
          text: '📊 综合判断：满足≥3项 = 危机仍在演化，空头不大幅减仓；满足≤2项 = 逐步锁定利润',
          detail: '执行规则：≥3项满足→保持空头仓位；≤2项满足→开始分批止盈，每月减仓10-15%'
        }
      ]
    },
    {
      category: '2026年5-9月 - 商业地产与美联储联动规则',
      items: [
        {
          id: 'may-sep-11',
          text: '🚨 商业地产危机信号：大型REIT/区域银行被迫救助或破产 + 信贷紧缩',
          detail: '数据源：每日监控KRE ETF、区域银行新闻、商业地产REIT财报。触发动作：出现上述情况→将空头止盈节奏前移10%，同时更积极准备债券和优质股抄底名单'
        },
        {
          id: 'may-sep-12',
          text: '📉 美联储连续降息信号：2次以上降息但股指暂未大跌',
          detail: '数据源：FOMC会议声明（每6-8周一次）。触发动作：连续2次降息但纳指跌幅<15%→减少新开空头，更多等待抄底机会，将抄底资金准备比例提升至70%'
        },
        {
          id: 'may-sep-13',
          text: '📊 信息跟踪频率：每周一、三、五监控KRE走势；每月1日评估上述指标；FOMC会议日重点关注',
          detail: '数据源清单：KRE ETF（Yahoo Finance）、银行财报（公司官网）、FOMC声明（Fed官网）、信用利差（FRED/Bloomberg）'
        }
      ]
    },
    {
      category: '2026年5-9月 - 抄底资金管理（量化规则）',
      items: [
        {
          id: 'may-sep-14',
          text: '💰 锁仓比例：Q3-Q4抄底资金至少保留60%，除非抄底条件满足≥4条才可以动用超过一半资金',
          detail: '抄底条件（需满足≥4条）：1)标普回撤>30% 2)美联储降息至2%以下 3)政府万亿级刺激 4)VIX从50+回落至35以下 5)信贷数据连续两周正增长 6)信用利差收窄'
        },
        {
          id: 'may-sep-15',
          text: '📊 资金分配规则：满足≥4条→可动用60-80%抄底资金；满足3条→可动用30-50%；满足≤2条→仅动用10-20%',
          detail: '执行：分批抄底，每批间隔1-2周，观察市场反应后再决定下一批'
        },
        {
          id: 'may-sep-16',
          text: '⚠️ 提前动用条件：仅在出现"极端恐慌"信号时可提前动用部分资金（不超过30%）',
          detail: '极端恐慌定义：Equity P/C>1.3 + VIX>50 + 标普单日跌幅>5%。满足后可提前动用30%资金买入优质债和蓝筹股'
        }
      ]
    }
  ];

  // 宏观风险时间表
  const macroRiskTimeline = [
    {
      period: '2026 Q1-Q2',
      phase: '缓冲消耗加速期',
      keySignals: [
        '非农连续3个月下修',
        '次级车贷逾期>6.5%',
        '401k困难提取率>6%',
        '兼职困境人数创新高'
      ],
      investment: '逐步减持风险资产,增配短债/现金',
      probability: 60
    },
    {
      period: '2026 Q3',
      phase: '传导临界期',
      keySignals: [
        '信用卡中产逾期>5%',
        '401k提取同比+15%',
        '区域银行存款流出加速',
        'CRE逾期率>8%'
      ],
      investment: '增配黄金/抗通胀资产,保留50%+现金',
      probability: 45
    },
    {
      period: '2026 Q4-2027 Q1',
      phase: '螺旋向下期',
      keySignals: [
        'Sahm Rule触发(>0.5)',
        '初请失业金>30万/周',
        'HY-IG利差>500bp',
        '银行CDS飙升'
      ],
      investment: '持币观望,等待资产暴跌后抄底',
      probability: 30
    },
    {
      period: '2027 H1后',
      phase: '政策重置期',
      keySignals: [
        '美联储扩表/降息至零',
        '财政大规模刺激',
        '债务货币化启动',
        '通胀回升'
      ],
      investment: '低位配置AI/ETH/黄金等核心资产',
      probability: 25
    }
  ];


  const shortingConditions = [
    { id: 'short-1', condition: '3月18日FOMC会议：2026年降息预期 < 2次', weight: '核心触发条件1（股债双杀信号）' },
    { id: 'short-2', condition: '失业率连续3个月上升且合计≥0.5个百分点', weight: '核心触发条件2（趋势判断，非单月点位）' },
    { id: 'short-3', condition: '银行拨备增速连续两季>30%或相对历史分位>75%', weight: '核心触发条件3' },
    { id: 'short-4', condition: '科技股Q1财报集体指引向下（3家以上）', weight: '加强信号' },
    { id: 'short-5', condition: 'KRE跌破2023年低点($40)或出现中型银行限制提款', weight: '加强信号' }
  ];

  const monitorList = [
    {
      code: 'KRE',
      name: '区域银行',
      description: '看地产雷什么时候炸',
      icon: <Building2 size={20} />,
      color: '#ef4444',
      bgColor: '#fef2f2'
    },
    {
      code: 'XHB',
      name: '建筑商',
      description: '确认地产板块是否持续走弱',
      icon: <Construction size={20} />,
      color: '#f97316',
      bgColor: '#fff7ed'
    },
    {
      code: 'GDX / GLD',
      name: '黄金相关',
      description: '确认避险资金流向',
      icon: <Trophy size={20} />,
      color: '#eab308',
      bgColor: '#fefce8'
    },
    {
      code: 'VIX',
      name: '恐慌指数',
      description: '如果 VIX 持续站稳在 25 以上，说明"阴跌"转为"恐慌跌"',
      icon: <Activity size={20} />,
      color: '#8b5cf6',
      bgColor: '#faf5ff'
    },
    {
      code: 'DXY',
      name: '美元指数',
      description: '美元强弱反映全球资金流向，强势美元通常压制风险资产',
      icon: <DollarSign size={20} />,
      color: '#3b82f6',
      bgColor: '#eff6ff'
    },
    {
      code: '^TNX',
      name: '10年期美债收益率',
      description: '收益率倒挂（2年>10年）是衰退预警信号，持续倒挂需警惕',
      icon: <TrendingUp size={20} />,
      color: '#10b981',
      bgColor: '#f0fdf4'
    },
    {
      code: 'BTC-USD',
      name: '比特币',
      description: '风险偏好指标，BTC上涨通常意味着市场风险偏好上升',
      icon: <Zap size={20} />,
      color: '#f59e0b',
      bgColor: '#fffbeb'
    },
    {
      code: 'Fear & Greed',
      name: '恐慌贪婪指数',
      description: 'CNN恐慌贪婪指数，<20极度恐慌（抄底信号），>80极度贪婪（减仓信号）',
      icon: <AlertCircle size={20} />,
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
      icon: <Building2 size={20} />
    },
    {
      event: '非农就业数据 (NFP)',
      frequency: '每月第一个周五',
      time: '美东8:30',
      importance: 'critical',
      description: '就业市场健康度，影响美联储政策预期',
      icon: <Briefcase size={20} />
    },
    {
      event: 'CPI通胀数据',
      frequency: '每月中旬',
      time: '美东8:30',
      importance: 'high',
      description: '通胀水平，影响利率预期',
      icon: <Activity size={20} />
    },
    {
      event: 'PPI生产者价格指数',
      frequency: '每月中旬',
      time: '美东8:30',
      importance: 'high',
      description: '上游通胀压力，CPI先行指标',
      icon: <Construction size={20} />
    },
    {
      event: 'GDP初值/终值',
      frequency: '每季度',
      time: '美东8:30',
      importance: 'high',
      description: '经济增长速度，衰退预警指标',
      icon: <BarChart2 size={20} />
    },
    {
      event: '消费者信心指数',
      frequency: '每月',
      time: '美东10:00',
      importance: 'medium',
      description: '消费意愿，影响经济预期',
      icon: <Wallet size={20} />
    },
    {
      event: 'ISM制造业PMI',
      frequency: '每月第一个工作日',
      time: '美东10:00',
      importance: 'high',
      description: '制造业景气度，<50表示收缩',
      icon: <Cpu size={20} />
    },
    {
      event: '失业率报告',
      frequency: '每月第一个周五',
      time: '美东8:30',
      importance: 'critical',
      description: '萨姆规则触发条件（失业率≥5.0%）',
      icon: <TrendingDown size={20} />
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
    <div style={{
      width: '100%',
      maxWidth: '1200px',
      margin: '0 auto',
      padding: '24px 16px',
      background: 'var(--bg-primary)',
      minHeight: '100vh',
      fontFamily: 'var(--font-family)'
    }}>
      {/* 页面标题 */}
      <div className="glass-panel" style={{
        padding: '32px 24px',
        borderRadius: 'var(--radius-lg)',
        marginBottom: '32px',
        background: 'linear-gradient(135deg, var(--system-blue) 0%, var(--system-indigo) 100%)',
        color: 'white',
        boxShadow: 'var(--shadow-lg)',
        border: '1px solid rgba(255,255,255,0.2)'
      }}>
        <h1 style={{
          fontSize: '2.25rem',
          fontWeight: '800',
          margin: '0 0 12px 0',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          letterSpacing: '-0.02em'
        }}>
          <Target size={40} />
          2026 投资作战计划书
        </h1>
        <p style={{ margin: 0, opacity: 0.9, fontSize: '1.1rem', fontWeight: '500' }}>
          基于宏观流动性与萨姆规则的确定性交易框架
        </p>
      </div>

      {/* Tabs - 升级为苹果风格的分段选择器 - 悬浮在顶部导航栏下方 */}
      <div className="glass-panel" style={{
        position: 'sticky',
        top: '60px',
        zIndex: 100,
        padding: '6px',
        borderRadius: '16px',
        marginBottom: '32px',
        display: 'flex',
        gap: '6px',
        background: 'rgba(255, 255, 255, 0.95)',
        backdropFilter: 'blur(20px) saturate(180%)',
        WebkitBackdropFilter: 'blur(20px) saturate(180%)',
        border: '1px solid var(--border-subtle)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.08)',
        overflowX: 'auto',
        whiteSpace: 'nowrap',
        msOverflowStyle: 'none',
        scrollbarWidth: 'none'
      }}>
        {[
          { id: 'timeline', label: '作战时间轴', icon: <Calendar size={18} /> },
          { id: 'checklist', label: '执行清单', icon: <ListTodo size={18} /> },
          { id: 'macro', label: '宏观时间', icon: <Clock size={18} /> },
          { id: 'earnings', label: '财报日历', icon: <Activity size={18} /> },
          { id: 'shorting', label: '做空条件', icon: <Shield size={18} /> },
          { id: 'profit-taking', label: '止盈策略', icon: <TrendingUp size={18} /> },
          { id: 'macro-risk', label: '宏观风险', icon: <AlertTriangle size={18} /> }
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                borderRadius: '12px',
                border: 'none',
                background: isActive ? 'white' : 'transparent',
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                fontSize: '0.95rem',
                fontWeight: isActive ? '700' : '500',
                cursor: 'pointer',
                transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.1)' : 'none',
                flexShrink: 0
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = 'var(--text-primary)';
                  e.currentTarget.style.background = 'rgba(255,255,255,0.4)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.color = 'var(--text-secondary)';
                  e.currentTarget.style.background = 'transparent';
                }
              }}
            >
              <span style={{ display: 'flex' }}>{tab.icon}</span>
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* 内容区域 */}
      <div className="card" style={{
        background: 'var(--bg-card)',
        padding: '32px',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-md)',
        border: '1px solid var(--glass-border)',
        minHeight: '600px'
      }}>
        {activeTab === 'timeline' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* 标题 */}
            <div className="glass-panel" style={{
              background: 'linear-gradient(135deg, var(--system-indigo) 0%, var(--system-blue) 100%)',
              borderRadius: 'var(--radius-md)',
              padding: '24px 20px',
              color: 'white',
              boxShadow: 'var(--shadow-lg)',
              border: '1px solid rgba(255,255,255,0.2)'
            }}>
              <h1 style={{ fontSize: '1.6rem', fontWeight: '800', marginBottom: '8px', letterSpacing: '-0.02em' }}>
                📅 2026 实战作战时间轴
              </h1>
              <p style={{ fontSize: '0.95rem', opacity: 0.9, fontWeight: '500' }}>
                关键窗口对齐 • 核心事件驱动 • 行动路线安排
              </p>
            </div>

            {timelineData.map((item, index) => {
              const borderColor = item.priority === 'critical' ? 'var(--system-red)' : item.priority === 'high' ? 'var(--system-orange)' : 'var(--system-blue)';
              // Use standard card background, subtle colored tint only if critical
              const bgColor = item.priority === 'critical' ? 'var(--system-red-light)' : 'var(--bg-card)';
              const cardBorder = item.priority === 'critical' ? '1px solid rgba(255, 59, 48, 0.2)' : '1px solid var(--glass-border)';

              return (
                <div
                  key={index}
                  className="card"
                  style={{
                    padding: '20px',
                    background: bgColor,
                    border: cardBorder,
                    borderRadius: 'var(--radius-lg)',
                    borderLeft: `6px solid ${borderColor}`,
                    boxShadow: 'var(--shadow-sm)'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: '800', fontSize: '1rem', color: 'var(--text-primary)' }}>{item.date}</span>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', fontWeight: '500' }}>{item.day}</span>
                        {item.time && (
                          <span style={{
                            fontSize: '0.75rem',
                            background: 'var(--system-gray6)',
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-sm)',
                            color: 'var(--text-secondary)',
                            fontWeight: '600'
                          }}>
                            {item.time}
                          </span>
                        )}
                        <StatusBadge
                          text={item.priority.toUpperCase()}
                          type={item.priority === 'critical' ? 'red' : item.priority === 'high' ? 'orange' : 'blue'}
                        />
                      </div>
                      <h3 style={{ fontSize: '1.3rem', fontWeight: '800', color: 'var(--text-primary)', margin: '0 0 16px 0', letterSpacing: '-0.01em' }}>
                        {item.event}
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', marginBottom: '8px' }}>
                        {item.isTable ? (
                          // 表格类型特殊渲染
                          (() => {
                            if (!item.actions || item.actions.length === 0) {
                              return null
                            }

                            let tableHeaderAdded = false
                            const tableRows = item.actions.filter(a => a.isTableRow)
                            const lastTableRowIndex = tableRows.length - 1
                            let currentTableRowIndex = -1

                            // 渲染文本内容（支持粗体）
                            const renderText = (text: string | undefined | null): React.ReactNode => {
                              if (!text || typeof text !== 'string') return <span></span>
                              const parts = text.split(/(\*\*.*?\*\*)/g).filter(p => p && p.length > 0)
                              if (parts.length === 0) return <span></span>
                              return parts.map((part, i) => {
                                if (part.startsWith('**') && part.endsWith('**')) {
                                  return <strong key={i}>{part.slice(2, -2)}</strong>
                                }
                                return <span key={i}>{part}</span>
                              })
                            }

                            const renderedItems: React.ReactElement[] = []

                            item.actions.forEach((action) => {
                              if (!action || !action.id) return

                              // 表格行
                              if (action.isTableRow && action.text && typeof action.text === 'string') {
                                currentTableRowIndex++
                                const parts = action.text.split('|').map(p => String(p || '').trim()).filter(p => p.length > 0)

                                if (parts.length >= 5) {
                                  // 添加表头
                                  if (!tableHeaderAdded) {
                                    tableHeaderAdded = true
                                    renderedItems.push(
                                      <div key={`table-header-${action.id}`} style={{
                                        display: 'grid',
                                        gridTemplateColumns: '1.5fr 1fr 1fr 1.2fr 0.5fr',
                                        gap: '8px',
                                        padding: '10px 12px',
                                        fontSize: '0.75rem',
                                        fontWeight: '800',
                                        background: 'var(--system-gray6)',
                                        color: 'var(--text-secondary)',
                                        borderRadius: 'var(--radius-md) var(--radius-md) 0 0',
                                        marginTop: '12px',
                                        border: '1px solid var(--system-gray5)',
                                        borderBottom: 'none'
                                      }}>
                                        <div>指标</div>
                                        <div>当前值</div>
                                        <div>Q3参考</div>
                                        <div>风险阈值</div>
                                        <div style={{ textAlign: 'center' }}>警示</div>
                                      </div>
                                    )
                                  }

                                  const isLastRow = currentTableRowIndex === lastTableRowIndex
                                  // 检查是否是拨备相关的行（需要淡蓝色背景）
                                  const isProvisionRow = ['jan12-table-5', 'jan12-table-6', 'jan12-table-7', 'jan12-table-8'].includes(action.id)
                                  const backgroundColor = isProvisionRow
                                    ? 'rgba(0, 122, 255, 0.05)' // Subtle System Blue
                                    : (currentTableRowIndex % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.01)')

                                  renderedItems.push(
                                    <div key={action.id} style={{
                                      display: 'grid',
                                      gridTemplateColumns: `repeat(${parts.length}, 1fr)`,
                                      gap: '4px',
                                      padding: '6px 10px',
                                      fontSize: '0.8rem',
                                      background: backgroundColor,
                                      border: '1px solid var(--system-gray5)',
                                      borderTop: 'none',
                                      borderRadius: isLastRow ? `0 0 var(--radius-md) var(--radius-md)` : '0',
                                      alignItems: 'center',
                                      transition: 'background 0.2s ease',
                                      color: 'var(--text-primary)'
                                    }}>
                                      {parts.map((col, colIdx) => (
                                        <div key={colIdx} style={{
                                          fontWeight: colIdx === 0 ? '700' : '500',
                                          textAlign: colIdx === parts.length - 1 ? 'center' : 'left'
                                        }}>
                                          {renderText(col)}
                                        </div>
                                      ))}
                                    </div>
                                  )
                                }
                                return
                              }

                              // 标题
                              if (action.isHeader && action.text && typeof action.text === 'string') {
                                const text = action.text.trim()

                                // 分隔线
                                if (text === '---') {
                                  renderedItems.push(
                                    <div key={action.id} style={{
                                      height: '1px',
                                      background: 'linear-gradient(to right, transparent, var(--system-gray4), transparent)',
                                      margin: '8px 0',
                                      width: '100%'
                                    }} />
                                  )
                                  return
                                }

                                // Markdown 标题
                                if (text.startsWith('## ')) {
                                  renderedItems.push(
                                    <h2 key={action.id} style={{
                                      marginTop: action.id.includes('header-1') ? '0' : '12px',
                                      marginBottom: '6px',
                                      fontSize: '1.15rem',
                                      fontWeight: '800',
                                      color: 'var(--text-primary)',
                                      borderBottom: '1.5px solid var(--system-gray5)',
                                      paddingBottom: '4px'
                                    }}>
                                      {renderText(text.replace('## ', ''))}
                                    </h2>
                                  )
                                  return
                                }

                                if (text.startsWith('### ')) {
                                  renderedItems.push(
                                    <h3 key={action.id} style={{
                                      marginTop: '10px',
                                      marginBottom: '6px',
                                      fontSize: '1rem',
                                      fontWeight: '700',
                                      color: 'var(--text-secondary)'
                                    }}>
                                      {renderText(text.replace('### ', ''))}
                                    </h3>
                                  )
                                  return
                                }

                                // 普通标题
                                renderedItems.push(
                                  <div key={action.id} style={{
                                    marginTop: action.id.includes('header-1') ? '0' : '16px',
                                    marginBottom: '8px',
                                    fontSize: '1rem',
                                    fontWeight: '600',
                                    color: '#1f2937',
                                    whiteSpace: 'pre-line',
                                    lineHeight: '1.6',
                                    background: action.id.includes('stage') ? 'linear-gradient(90deg, #fef3c7 0%, #ffffff 100%)' : 'transparent',
                                    padding: action.id.includes('stage') ? '12px 16px' : '0',
                                    borderRadius: action.id.includes('stage') ? '8px' : '0',
                                    border: action.id.includes('stage') ? '1px solid #fcd34d' : 'none'
                                  }}>
                                    {renderText(text)}
                                  </div>
                                )
                                return
                              }

                              // 代码块
                              if (action.text && typeof action.text === 'string' && action.text.trim().startsWith('```')) {
                                const codeContent = action.text.trim().replace(/^```\n?/, '').replace(/\n?```$/, '')
                                renderedItems.push(
                                  <div key={action.id} style={{
                                    background: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)',
                                    color: '#f3f4f6',
                                    padding: '8px 12px',
                                    borderRadius: '6px',
                                    fontSize: '0.8rem',
                                    fontFamily: 'Monaco, "Courier New", monospace',
                                    lineHeight: '1.6',
                                    margin: '4px 0',
                                    overflowX: 'auto',
                                    whiteSpace: 'pre',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                    border: '1px solid #374151'
                                  }}>
                                    {String(codeContent)}
                                  </div>
                                )
                                return
                              }

                              // 引用块
                              if (action.text && typeof action.text === 'string' && action.text.trim().startsWith('>')) {
                                const quoteContent = action.text.trim().replace(/^>\s*\*\*/, '**').replace(/\n>\s*/g, '\n')
                                renderedItems.push(
                                  <div key={action.id} style={{
                                    borderLeft: '4px solid var(--system-blue)',
                                    background: 'linear-gradient(90deg, var(--system-blue-light) 0%, transparent 100%)',
                                    padding: '8px 12px',
                                    margin: '6px 0',
                                    borderRadius: '6px',
                                    fontSize: '0.9rem',
                                    color: 'var(--text-primary)',
                                    fontWeight: '500',
                                    lineHeight: '1.6',
                                    whiteSpace: 'pre-line',
                                    boxShadow: '0 2px 8px rgba(0, 122, 255, 0.05)'
                                  }}>
                                    {renderText(quoteContent)}
                                  </div>
                                )
                                return
                              }

                              // 警示框（isAlert）
                              if ((action as any).isAlert && action.text && typeof action.text === 'string') {
                                renderedItems.push(
                                  <div key={action.id} style={{
                                    background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                                    border: '2px solid #f59e0b',
                                    borderRadius: '10px',
                                    padding: '12px 16px',
                                    marginBottom: '16px',
                                    fontSize: '0.95rem',
                                    fontWeight: '600',
                                    color: '#92400e',
                                    lineHeight: '1.6',
                                    boxShadow: '0 4px 12px rgba(245, 158, 11, 0.2)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                  }}>
                                    {renderText(action.text)}
                                  </div>
                                )
                                return
                              }

                              // 复选框
                              if (action.text && typeof action.text === 'string' && action.text.trim().startsWith('- [ ]')) {
                                renderedItems.push(
                                  <div key={action.id} style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '8px',
                                    fontSize: '0.9rem',
                                    color: '#374151',
                                    padding: '6px 0',
                                    marginLeft: '8px'
                                  }}>
                                    <span style={{ fontSize: '1rem', marginRight: '4px' }}>☐</span>
                                    <span>{renderText(action.text.replace('- [ ]', '').trim())}</span>
                                  </div>
                                )
                                return
                              }

                              // 普通文本
                              if (action.text && typeof action.text === 'string') {
                                renderedItems.push(
                                  <div key={action.id} style={{
                                    display: 'flex',
                                    alignItems: 'flex-start',
                                    gap: '8px',
                                    fontSize: '0.9rem',
                                    color: '#374151',
                                    padding: '4px 0',
                                    lineHeight: '1.6'
                                  }}>
                                    {renderText(action.text)}
                                  </div>
                                )
                              }
                            })

                            // 如果没有任何内容被渲染，可能是数据格式问题
                            if (renderedItems.length === 0) {
                              console.warn('没有渲染任何内容，actions:', item.actions?.length, item.actions)
                              return null
                            }

                            return <>{renderedItems}</>
                          })()
                        ) : (
                          // 普通类型渲染
                          item.actions.map((action) => (
                            <div key={action.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                              {!item.completed && (
                                <input
                                  type="checkbox"
                                  id={action.id}
                                  checked={checkedItems[action.id] || false}
                                  onChange={() => toggleCheck(action.id)}
                                  style={{ marginTop: '4px', width: '16px', height: '16px', cursor: 'pointer' }}
                                />
                              )}
                              <label
                                htmlFor={item.completed ? undefined : action.id}
                                style={{
                                  fontSize: '0.9rem',
                                  textDecoration: checkedItems[action.id] ? 'line-through' : 'none',
                                  color: item.completed ? '#374151' : (checkedItems[action.id] ? '#9ca3af' : '#374151'),
                                  cursor: item.completed ? 'default' : 'pointer',
                                  flex: 1
                                }}
                              >
                                {typeof action.text === 'string' ? action.text : String(action.text)}
                              </label>
                            </div>
                          ))
                        )}
                      </div>
                      <div style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '8px',
                        fontSize: '0.85rem',
                        color: 'var(--text-secondary)',
                        background: 'var(--system-gray6)',
                        padding: '12px 16px',
                        borderRadius: 'var(--radius-sm)',
                        marginTop: '16px',
                        border: '1px solid var(--system-gray5)',
                        lineHeight: '1.5'
                      }}>
                        <span style={{ fontSize: '1.1rem' }}>⚠️</span>
                        <span style={{ fontWeight: '500' }}>{item.notes}</span>
                      </div>
                    </div>
                    {item.priority === 'critical' && (
                      <div style={{
                        background: 'var(--system-red)',
                        color: 'white',
                        padding: '8px',
                        borderRadius: '999px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginLeft: '16px',
                        flexShrink: 0,
                        boxShadow: '0 4px 12px rgba(255, 59, 48, 0.3)'
                      }}>
                        <AlertTriangle size={20} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'macro' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* 标题 */}
            <div className="glass-panel" style={{
              background: 'linear-gradient(135deg, var(--system-indigo) 0%, var(--system-purple) 100%)',
              borderRadius: 'var(--radius-md)',
              padding: '24px 20px',
              color: 'white',
              boxShadow: 'var(--shadow-lg)',
              border: '1px solid rgba(255,255,255,0.2)'
            }}>
              <h1 style={{ fontSize: '1.6rem', fontWeight: '800', marginBottom: '8px', letterSpacing: '-0.02em' }}>
                🎯 2026 宏观作战地图
              </h1>
              <p style={{ fontSize: '0.95rem', opacity: 0.9, fontWeight: '500' }}>
                宏观数据现状 • 逻辑深度推演 • 实战对冲策略 (更新至：2026年1月22日)
              </p>
            </div>

            {/* 第一层：核心宏观数据现状 */}
            <div className="card" style={{
              padding: '20px',
              background: 'var(--bg-card)',
              border: '1px solid var(--glass-border)',
              borderRadius: 'var(--radius-lg)'
            }}>
              <h2 style={{
                fontSize: '1.35rem',
                fontWeight: '800',
                marginBottom: '16px',
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                borderBottom: '1px solid var(--system-gray5)',
                paddingBottom: '12px'
              }}>
                <span style={{ color: 'var(--system-blue)' }}><DollarSign size={24} /></span>
                第一层：核心宏观数据现状
              </h2>

              {/* 联储政策 */}
              <div style={{ marginBottom: '16px' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '800', marginBottom: '12px', color: 'var(--system-blue)' }}>
                  💰 联储政策：已接近中性利率
                </h3>
                <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-md)', border: '1px solid var(--system-gray5)', background: 'rgba(255,255,255,0.3)' }}>
                  <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                    <thead>
                      <tr style={{ background: 'var(--system-gray6)' }}>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '700', fontSize: '0.8rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--system-gray5)' }}>指标</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '700', fontSize: '0.8rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--system-gray5)' }}>当前值</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '700', fontSize: '0.8rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--system-gray5)' }}>市场预期</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '700', fontSize: '0.8rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--system-gray5)' }}>关键解读</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', fontWeight: '700', color: 'var(--text-primary)', fontSize: '0.85rem' }}>联邦基金利率</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', color: 'var(--text-primary)', fontSize: '0.85rem' }}>4.25-4.50%</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>-</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)' }}><StatusBadge type="orange" text="Fed已暂停降息" /></td>
                      </tr>
                      <tr style={{ background: 'rgba(0,0,0,0.02)' }}>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', fontWeight: '700', color: 'var(--text-primary)', fontSize: '0.85rem' }}>2026降息预期</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', color: 'var(--text-primary)', fontSize: '0.85rem' }}>1-2次（共50bp）</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>CBO预计年底3.4%</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', color: 'var(--text-primary)', fontSize: '0.8rem' }}>市场押注4月或6月首次降息</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', fontWeight: '700', color: 'var(--text-primary)', fontSize: '0.85rem' }}>中性利率估计</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', color: 'var(--text-primary)', fontSize: '0.85rem' }}>2.5-3.0%</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>实际+通胀≈4.5-5%</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', fontWeight: '700', color: 'var(--system-blue)', fontSize: '0.8rem' }}>已非常接近中性</td>
                      </tr>
                      <tr style={{ background: 'var(--system-red-light)' }}>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', fontWeight: '700', color: 'var(--system-red)', fontSize: '0.85rem' }}>Fed内部分歧</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', color: 'var(--text-primary)', fontSize: '0.85rem' }}>极度分裂</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>特朗普任命Miran主张降息150bp</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)' }}><StatusBadge type="red" text="罕见政治化" /></td>
                      </tr>
                      <tr style={{ borderBottom: 'none', background: 'var(--system-red-light)' }}>
                        <td style={{ padding: '10px 12px', fontWeight: '700', color: 'var(--system-red)', fontSize: '0.85rem' }}>Powell任期</td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-primary)', fontSize: '0.85rem' }}>2026年5月到期</td>
                        <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>新主席上任</td>
                        <td style={{ padding: '10px 12px' }}><StatusBadge type="red" text="最大不确定性" /></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div style={{
                  marginTop: '16px',
                  padding: '16px 20px',
                  background: 'rgba(255, 149, 0, 0.05)',
                  border: '1px solid rgba(255, 149, 0, 0.2)',
                  borderRadius: 'var(--radius-md)'
                }}>
                  <p style={{ fontSize: '0.95rem', color: 'var(--system-orange)', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <Info size={18} /> 核心研判
                  </p>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.8' }}>
                    <li>国会预算办公室（CBO）预计Fed将在2026年降息，关键利率到2028年将降至3.4%左右</li>
                    <li>Fed理事Stephen Miran主张2026年降息150个基点，但大多数官员支持审慎态度</li>
                    <li>市场预期4月有45%概率降息，9月再次降息</li>
                    <li><strong>5月Fed主席换届是2026年最大的系统性不确定性点</strong></li>
                  </ul>
                </div>
              </div>

              {/* AI Capex */}
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '800', marginBottom: '12px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <BarChart2 size={24} style={{ color: 'var(--system-purple)' }} /> AI Capex：已进入验证期
                </h3>
                <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-md)', border: '1px solid var(--system-gray5)', background: 'rgba(255,255,255,0.3)' }}>
                  <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                    <thead>
                      <tr style={{ background: 'var(--system-gray6)' }}>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '700', fontSize: '0.8rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--system-gray5)' }}>公司</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '700', fontSize: '0.8rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--system-gray5)' }}>2025年Capex</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '700', fontSize: '0.8rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--system-gray5)' }}>YoY增速</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '700', fontSize: '0.8rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--system-gray5)' }}>2026年指引</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '700', fontSize: '0.8rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--system-gray5)' }}>关键信号</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', fontWeight: '700', color: 'var(--text-primary)', fontSize: '0.85rem' }}>Amazon</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', color: 'var(--text-primary)', fontSize: '0.85rem' }}>$125B</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', color: 'var(--text-primary)', fontSize: '0.85rem' }}>+83%</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', color: 'var(--text-primary)', fontSize: '0.85rem' }}>&gt;$125B持续增长</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>ROI已严重稀释，折旧加速</td>
                      </tr>
                      <tr style={{ background: 'rgba(0,0,0,0.02)' }}>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', fontWeight: '700', color: 'var(--text-primary)', fontSize: '0.85rem' }}>Google</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', color: 'var(--text-primary)', fontSize: '0.85rem' }}>$91-93B</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', color: 'var(--text-primary)', fontSize: '0.85rem' }}>+57%</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', color: 'var(--text-primary)', fontSize: '0.85rem' }}>持续高位</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>上调指引至 910-930 亿美元</td>
                      </tr>
                      <tr>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', fontWeight: '700', color: 'var(--text-primary)', fontSize: '0.85rem' }}>Microsoft</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', color: 'var(--text-primary)', fontSize: '0.85rem' }}>$80B (FY26)</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', color: 'var(--text-primary)', fontSize: '0.85rem' }}>+74%</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', color: 'var(--text-primary)', fontSize: '0.85rem' }}>加速增长</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>FY26 增速高于 FY25</td>
                      </tr>
                      <tr style={{ background: 'rgba(0,0,0,0.02)' }}>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', fontWeight: '700', color: 'var(--text-primary)', fontSize: '0.85rem' }}>Meta</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', color: 'var(--text-primary)', fontSize: '0.85rem' }}>$70-72B</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', color: 'var(--text-primary)', fontSize: '0.85rem' }}>+111%</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', color: 'var(--text-primary)', fontSize: '0.85rem' }}>2026年类似增长</td>
                        <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>指引收窄至 700-720 亿美元</td>
                      </tr>
                      <tr style={{ borderBottom: 'none', background: 'var(--system-red-light)' }}>
                        <td style={{ padding: '10px 12px', fontWeight: '800', color: 'var(--system-red)', fontSize: '0.85rem' }}>合计</td>
                        <td style={{ padding: '10px 12px', fontWeight: '800', color: 'var(--system-red)', fontSize: '0.85rem' }}>~$380B</td>
                        <td style={{ padding: '10px 12px', fontWeight: '800', color: 'var(--system-red)', fontSize: '0.85rem' }}>+64%</td>
                        <td style={{ padding: '10px 12px', fontWeight: '800', fontSize: '0.85rem' }}>持续加速</td>
                        <td style={{ padding: '10px 12px' }}>
                          <StatusBadge type="red" text="仍在加速，未见顶" />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div style={{
                  marginTop: '16px',
                  padding: '16px 20px',
                  background: 'var(--system-red-light)',
                  border: '1px solid rgba(255, 59, 48, 0.2)',
                  borderRadius: 'var(--radius-md)'
                }}>
                  <p style={{ fontSize: '0.95rem', color: 'var(--system-red)', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <AlertTriangle size={18} /> 隐藏炸弹已引爆
                  </p>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.8' }}>
                    <li><strong>会计操作公开化：</strong>Amazon在Q4将部分服务器使用寿命从6年缩短至5年，预计运营收入减少约7亿美元。折旧加速 = 利润减少。</li>
                    <li><strong>Capex增速 vs 收入增速剪刀差：</strong>AWS收入增速：19% YoY，AWS Capex增速：<strong>83% YoY</strong>，<strong>ROI已严重稀释</strong></li>
                    <li><strong>自由现金流压力：</strong>Meta FCF过去一年下降20%，Amazon FCF明显收缩。</li>
                  </ul>
                </div>
              </div>

              {/* NVIDIA */}
              <div style={{ marginTop: '20px' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '800', marginBottom: '12px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Activity size={24} style={{ color: 'var(--system-green)' }} /> NVIDIA：需求依然强劲但增速放缓
                </h3>
                <div style={{
                  padding: '16px',
                  background: 'rgba(255,255,255,0.3)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--system-gray5)',
                  marginBottom: '12px'
                }}>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.5', marginBottom: '16px' }}>
                    NVIDIA 2025 财报显示营收 1305 亿美元 (+114%)，数据中心占比持续提升。
                  </p>
                  <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-sm)', border: '1px solid var(--system-gray5)' }}>
                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                      <thead>
                        <tr style={{ background: 'var(--system-gray6)' }}>
                          <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '700', fontSize: '0.8rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--system-gray5)' }}>指标</th>
                          <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '700', fontSize: '0.8rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--system-gray5)' }}>Q4 FY25数据</th>
                          <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '700', fontSize: '0.8rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--system-gray5)' }}>解读</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', fontWeight: '700', color: 'var(--text-primary)', fontSize: '0.85rem' }}>数据中心收入</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', color: 'var(--text-primary)', fontSize: '0.85rem' }}>$356亿（+93% YoY）</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>仍强劲</td>
                        </tr>
                        <tr style={{ background: 'rgba(0,0,0,0.02)' }}>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', fontWeight: '700', color: 'var(--text-primary)', fontSize: '0.85rem' }}>环比增速</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', color: 'var(--text-primary)', fontSize: '0.85rem' }}>+12%</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)' }}>
                            <StatusBadge type="orange" text="明显放缓" />
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', display: 'block' }}>（Q3是+22%）</span>
                          </td>
                        </tr>
                        <tr>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', fontWeight: '700', color: 'var(--text-primary)', fontSize: '0.85rem' }}>Blackwell首季收入</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', color: 'var(--text-primary)', fontSize: '0.85rem' }}>$110亿</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>新品爆发</td>
                        </tr>
                        <tr style={{ background: 'rgba(0,0,0,0.02)' }}>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', fontWeight: '700', color: 'var(--text-primary)', fontSize: '0.85rem' }}>Q1指引</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', color: 'var(--text-primary)', fontSize: '0.85rem' }}>$430亿（±2%）</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>增速下降</td>
                        </tr>
                        <tr style={{ borderBottom: 'none' }}>
                          <td style={{ padding: '10px 12px', fontWeight: '700', color: 'var(--text-primary)', fontSize: '0.85rem' }}>毛利率</td>
                          <td style={{ padding: '10px 12px', color: 'var(--text-primary)', fontSize: '0.85rem' }}>73.5%</td>
                          <td style={{ padding: '10px 12px' }}><StatusBadge type="orange" text="毛利小幅回落" /></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <div style={{ marginTop: '16px', padding: '12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px' }}>
                    <p style={{ fontSize: '0.9rem', color: '#92400e', lineHeight: '1.6', margin: 0 }}>
                      <strong>📌 关键信号：</strong>增速从Q3的62% → Q4的78%，<strong>看起来加速</strong>；但环比从+22% → +12%，<strong>实际在减速</strong>。CEO黄仁勋称"对Blackwell的需求惊人"，推理AI增加了另一个扩展定律。<strong>这是典型的"叙事强化，数据走弱"信号</strong>。
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* 第二层：三条核心逻辑链 */}
            <div className="card" style={{
              padding: '20px',
              background: 'var(--bg-card)',
              border: '1px solid var(--glass-border)',
              borderRadius: 'var(--radius-lg)',
              marginTop: '20px'
            }}>
              <h2 style={{
                fontSize: '1.35rem',
                fontWeight: '800',
                marginBottom: '20px',
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                borderBottom: '1px solid var(--system-gray5)',
                paddingBottom: '12px'
              }}>
                <span style={{ color: 'var(--system-green)' }}><Activity size={24} /></span>
                第二层：三条核心逻辑链
              </h2>

              {/* 逻辑链1 */}
              <div style={{ marginBottom: '20px', padding: '16px', background: 'rgba(255,255,255,0.3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--system-gray5)' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '800', marginBottom: '12px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <TrendingUp size={20} style={{ color: 'var(--system-blue)' }} /> 逻辑链1：AI Capex 已进入"验证窗口"
                </h3>
                <div style={{ padding: '20px', background: 'var(--system-gray6)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--system-gray5)', fontFamily: 'var(--font-family)', fontSize: '0.9rem', lineHeight: '2', color: 'var(--text-primary)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>2025 全年 <span style={{ color: 'var(--text-secondary)' }}>→</span> Capex 暴增 (+64% 达 $380B)</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>2026 Q1-Q2 <span style={{ color: 'var(--text-secondary)' }}>→</span> <StatusBadge type="orange" text="全面验证期" /></div>
                  <div style={{ marginTop: '8px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>关键指标：AWS ROI 0.23 (19% 收入 vs 83% 投入) ❌</div>
                  <div style={{ fontWeight: '700', color: 'var(--system-red)', marginTop: '8px' }}>= 市场将在 2026 上半年进行估值重构</div>
                </div>
                <div style={{
                  marginTop: '16px',
                  padding: '16px 20px',
                  background: 'var(--system-red-light)',
                  border: '1px solid rgba(255, 59, 48, 0.2)',
                  borderRadius: 'var(--radius-md)'
                }}>
                  <p style={{ fontSize: '0.9rem', color: 'var(--system-red)', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <AlertCircle size={18} /> 触发条件（满足 2 条立即防守）
                  </p>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.8' }}>
                    <li>Mag7 任意 2 家 FCF 同比下降</li>
                    <li>NVDA 指引低于预期 (&lt;$430B)</li>
                    <li>利好财报后股价不涨累计 3 次</li>
                  </ul>
                </div>
              </div>

              {/* 逻辑链2 */}
              <div style={{ marginBottom: '20px', padding: '16px', background: 'rgba(255,255,255,0.3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--system-gray5)' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '800', marginBottom: '12px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Info size={20} style={{ color: 'var(--system-indigo)' }} /> 逻辑链2：Fed 主席换届 = 政治风险窗口
                </h3>
                <div style={{ padding: '20px', background: 'var(--system-gray6)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--system-gray5)', fontFamily: 'var(--font-family)', fontSize: '0.9rem', lineHeight: '2', color: 'var(--text-primary)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>2026年5月 <span style={{ color: 'var(--text-secondary)' }}>→</span> Powell 离任</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>场景 A: 鸽派加速 <span style={{ color: 'var(--text-secondary)' }}>→</span> 通胀反弹风险</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>场景 B: 政策政治化 <span style={{ color: 'var(--text-secondary)' }}>→</span> 市场信心崩塌 <strong>(VIX 飙升)</strong></div>
                  <div style={{ fontWeight: '700', color: 'var(--system-blue)', marginTop: '8px' }}>= 4-6 月是年内最大确定性缺失窗口</div>
                </div>
                <div style={{
                  marginTop: '16px',
                  padding: '16px 20px',
                  background: 'var(--system-blue-light)',
                  border: '1px solid rgba(0, 122, 255, 0.2)',
                  borderRadius: 'var(--radius-md)'
                }}>
                  <p style={{ fontSize: '0.9rem', color: 'var(--system-blue)', fontWeight: '700', marginBottom: '8px' }}>
                    💡 对冲策略
                  </p>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.8' }}>
                    <li>维持 25% 现金+短债储备</li>
                    <li>黄金仓位 15-20%</li>
                    <li>严禁加杠杆追高</li>
                  </ul>
                </div>
              </div>

              {/* 逻辑链3 */}
              <div style={{ padding: '16px', background: 'rgba(255,255,255,0.3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--system-gray5)' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '800', marginBottom: '12px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <TrendingDown size={20} style={{ color: 'var(--system-red)' }} /> 逻辑链3：K 型复苏的尾部风险
                </h3>
                <div style={{ padding: '20px', background: 'var(--system-gray6)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--system-gray5)', fontFamily: 'var(--font-family)', fontSize: '0.9rem', lineHeight: '2', color: 'var(--text-primary)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>当前状态 <span style={{ color: 'var(--text-secondary)' }}>→</span> 股市高位 + 结构性脆弱</div>
                  <div style={{ marginTop: '8px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>脆弱点：中产储蓄耗尽 / 青年就业结构性缺口</div>
                  <div style={{ fontWeight: '700', color: 'var(--system-orange)', marginTop: '8px' }}>= 股市回调 15% 即可触发负财富效应闭环</div>
                </div>
                <div style={{
                  marginTop: '16px',
                  padding: '16px 20px',
                  background: 'var(--system-gray6)',
                  border: '1px solid var(--system-gray5)',
                  borderRadius: 'var(--radius-md)'
                }}>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <BarChart2 size={18} /> 监控红线
                  </p>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.8' }}>
                    <li>失业率 &gt; 4.5%</li>
                    <li>信用卡违约率突破 5%</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* 第三层：四个阶段实战策略 */}
            <div className="card" style={{
              padding: '20px',
              background: 'var(--bg-card)',
              border: '1px solid var(--glass-border)',
              borderRadius: 'var(--radius-lg)',
              marginTop: '20px'
            }}>
              <h2 style={{
                fontSize: '1.35rem',
                fontWeight: '800',
                marginBottom: '20px',
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                borderBottom: '1px solid var(--system-gray5)',
                paddingBottom: '12px'
              }}>
                <span style={{ color: 'var(--system-orange)' }}><Calendar size={24} /></span>
                第三层：2026 阶梯作战策略
              </h2>

              {/* Q1 */}
              <div style={{ marginBottom: '32px', padding: '24px', background: 'rgba(255,255,255,0.3)', borderRadius: 'var(--radius-md)', border: '1px solid var(--system-gray5)' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: '800', marginBottom: '20px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ width: '12px', height: '12px', background: 'var(--system-orange)', borderRadius: '3px' }} />
                  Q1（1-3月）：财报验身期
                  <StatusBadge type="orange" text="进行中" />
                </h3>

                <div style={{ marginBottom: '24px' }}>
                  <h4 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '16px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Clock size={18} style={{ color: 'var(--system-orange)' }} /> 关键时间节点
                  </h4>
                  <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-sm)', border: '1px solid var(--system-gray5)' }}>
                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                      <thead>
                        <tr style={{ background: 'var(--system-gray6)' }}>
                          <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: '700', fontSize: '0.85rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--system-gray5)' }}>日期</th>
                          <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: '700', fontSize: '0.85rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--system-gray5)' }}>事件</th>
                          <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: '700', fontSize: '0.85rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--system-gray5)' }}>监控重点</th>
                          <th style={{ padding: '14px 16px', textAlign: 'left', fontWeight: '700', fontSize: '0.85rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--system-gray5)' }}>行动</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', fontWeight: '700', color: 'var(--text-primary)', fontSize: '0.85rem' }}>1月27-28日</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', color: 'var(--text-primary)', fontSize: '0.85rem' }}>Fed会议</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>降息概率16%，按兵不动</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', color: 'var(--text-primary)', fontSize: '0.85rem' }}>关注重大分歧</td>
                        </tr>
                        <tr style={{ background: 'rgba(0,0,0,0.02)' }}>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', fontWeight: '700', color: 'var(--text-primary)', fontSize: '0.85rem' }}>2月末</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', color: 'var(--text-primary)', fontSize: '0.85rem' }}>Mag7 Q4财报</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>FCF、Capex 指引</td>
                          <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--system-gray5)' }}><StatusBadge type="red" text="核心验证" /></td>
                        </tr>
                        <tr style={{ borderBottom: 'none' }}>
                          <td style={{ padding: '10px 12px', fontWeight: '700', color: 'var(--text-primary)', fontSize: '0.85rem' }}>3月18日</td>
                          <td style={{ padding: '10px 12px', color: 'var(--text-primary)', fontSize: '0.85rem' }}>FOMC会议</td>
                          <td style={{ padding: '10px 12px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>2026 降息点阵图</td>
                          <td style={{ padding: '10px 12px', color: 'var(--text-primary)', fontSize: '0.85rem' }}>关注利率指引</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div style={{ marginBottom: '16px', padding: '16px', background: 'var(--system-red-light)', border: '1px solid rgba(255, 59, 48, 0.1)', borderRadius: 'var(--radius-md)' }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: '800', marginBottom: '12px', color: 'var(--system-red)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertCircle size={18} /> Q1 核心行动
                  </h4>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                    <p style={{ marginBottom: '8px', fontWeight: '700', color: 'var(--text-primary)' }}>立即执行清单：</p>
                    <ul style={{ margin: '0 0 12px 20px', padding: 0 }}>
                      <li style={{ marginBottom: '4px' }}><StatusBadge type="green" text="已就绪" /> 建立黄金底仓 15% (对冲波动)</li>
                      <li style={{ marginBottom: '4px' }}><StatusBadge type="orange" text="执行中" /> 减持 Mag7 仓位 (GOOG 10%, META 8%)</li>
                      <li style={{ marginBottom: '4px' }}><StatusBadge type="blue" text="规划中" /> 25% 现金等待抄底</li>
                    </ul>

                    <p style={{ marginBottom: '8px', fontWeight: '700', color: 'var(--text-primary)' }}>财报季核心检查：</p>
                    <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-sm)', border: '1px solid var(--system-gray5)', background: 'white' }}>
                      <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                        <thead style={{ background: 'var(--system-gray6)' }}>
                          <tr>
                            <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: '0.75rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--system-gray5)' }}>检查项</th>
                            <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: '0.75rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--system-gray5)' }}>风险阈值</th>
                            <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: '0.75rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--system-gray5)' }}>行动</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--system-gray5)', fontSize: '0.8rem' }}>Mag7 FCF/净利</td>
                            <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--system-gray5)', fontSize: '0.8rem' }}>&lt;0.6</td>
                            <td style={{ padding: '8px 10px', borderBottom: '1px solid var(--system-gray5)' }}><StatusBadge type="red" text="减 50%" /></td>
                          </tr>
                          <tr>
                            <td style={{ padding: '8px 10px', fontSize: '0.8rem' }}>利好后股价 48h</td>
                            <td style={{ padding: '8px 10px', fontSize: '0.8rem' }}>不涨/跌</td>
                            <td style={{ padding: '8px 10px' }}><StatusBadge type="orange" text="预警" /></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                <div style={{ padding: '16px', background: 'var(--system-gray6)', borderRadius: 'var(--radius-md)', border: '1px solid var(--system-gray5)' }}>
                  <h4 style={{ fontSize: '0.9rem', fontWeight: '800', marginBottom: '12px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <BarChart2 size={16} style={{ color: 'var(--system-green)' }} /> 推荐配置（Q1）
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
                    <div style={{ padding: '12px', background: 'white', borderRadius: 'var(--radius-sm)', border: '1px solid var(--system-gray5)' }}>
                      <div style={{ fontWeight: '700', marginBottom: '4px', color: 'var(--system-blue)', fontSize: '0.85rem' }}>核心资产 (35%)</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                        AAPL 8% / MSFT 7% / NVDA 5%<br />
                        医疗 8% / 消费 7%
                      </div>
                    </div>
                    <div style={{ padding: '12px', background: 'white', borderRadius: 'var(--radius-sm)', border: '1px solid var(--system-gray5)' }}>
                      <div style={{ fontWeight: '700', marginBottom: '4px', color: 'var(--system-orange)', fontSize: '0.85rem' }}>防御对冲 (35%)</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                        黄金 15% / 美债 12% / 短债 8%
                      </div>
                    </div>
                    <div style={{ padding: '12px', background: 'white', borderRadius: 'var(--radius-sm)', border: '1px solid var(--system-gray5)' }}>
                      <div style={{ fontWeight: '700', marginBottom: '4px', color: 'var(--system-indigo)', fontSize: '0.85rem' }}>其他现金 (30%)</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                        AI 应用 15% / 灵活现金 15%
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Q2-Q4 简化展示 */}
              <div style={{ marginBottom: '16px', padding: '16px', background: 'rgba(255, 59, 48, 0.05)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255, 59, 48, 0.1)' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '800', marginBottom: '12px', color: 'var(--system-red)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <AlertCircle size={18} /> Q2（4-6月）：政治动荡期
                  <StatusBadge type="red" text="高风险" />
                </h3>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                  <ul style={{ margin: '0 0 10px 18px', padding: 0 }}>
                    <li>税务季抽水导致流动性回收</li>
                    <li>Fed 换届政治化立场存疑</li>
                  </ul>
                  <div style={{ padding: '8px 12px', background: 'white', borderRadius: 'var(--radius-sm)', border: '1px solid var(--system-gray5)', fontSize: '0.8rem' }}>
                    <span style={{ fontWeight: '700', color: 'var(--system-red)' }}>预警线：</span>VIX &gt; 25 / 10Y 美债 &gt; 4.5%
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '16px', padding: '16px', background: 'rgba(255, 149, 0, 0.05)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255, 149, 0, 0.1)' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '800', marginBottom: '12px', color: 'var(--system-orange)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Activity size={18} /> Q3（7-9月）：经济成色验证
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.5', margin: 0 }}>
                  <strong>监控：</strong>非 Mag7 EPS 表现 / 失业率 4.5% / 消费违约。
                </p>
              </div>

              <div style={{ marginBottom: '20px', padding: '16px', background: 'rgba(52, 199, 89, 0.05)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(52, 199, 89, 0.1)' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '800', marginBottom: '12px', color: 'var(--system-green)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Target size={18} /> Q4（10-12月）：分水岭确认
                </h3>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.5', margin: 0 }}>
                  <strong>判断：</strong>AI 是"电力"还是"郁金香"。看 2027 Capex 指引。
                </p>
              </div>
            </div>

            {/* 第四层：实战工具与铁律 */}
            <div className="card" style={{
              padding: '20px',
              background: 'var(--bg-card)',
              border: '1px solid var(--glass-border)',
              borderRadius: 'var(--radius-lg)',
              marginTop: '20px'
            }}>
              <h2 style={{
                fontSize: '1.35rem',
                fontWeight: '800',
                marginBottom: '20px',
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                borderBottom: '1px solid var(--system-gray5)',
                paddingBottom: '12px'
              }}>
                <span style={{ color: 'var(--system-purple)' }}><Shield size={24} /></span>
                第四层：实战工具与铁律
              </h2>
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: '800', marginBottom: '16px', color: 'var(--text-primary)' }}>每周监控清单</h3>
                <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-sm)', border: '1px solid var(--system-gray5)' }}>
                  <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                    <thead>
                      <tr style={{ background: 'var(--system-gray6)' }}>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '700', fontSize: '0.85rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--system-gray5)' }}>监控项</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '700', fontSize: '0.85rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--system-gray5)' }}>数据源</th>
                        <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '700', fontSize: '0.85rem', color: 'var(--text-secondary)', borderBottom: '1px solid var(--system-gray5)' }}>预警阈值</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--system-gray5)', fontSize: '0.85rem' }}>黄金/纳指比</td>
                        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--system-gray5)', fontSize: '0.85rem' }}>TradingView</td>
                        <td style={{ padding: '12px 16px', borderBottom: '1px solid var(--system-gray5)' }}><StatusBadge type="orange" text="突破 0.030" /></td>
                      </tr>
                      <tr>
                        <td style={{ padding: '12px 16px', fontSize: '0.85rem' }}>VIX 指数</td>
                        <td style={{ padding: '12px 16px', fontSize: '0.85rem' }}>CBOE</td>
                        <td style={{ padding: '12px 16px' }}><StatusBadge type="red" text="> 25 持续 3 日" /></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div style={{ padding: '16px', background: 'var(--system-red-light)', border: '1px solid rgba(255, 59, 48, 0.1)', borderRadius: 'var(--radius-md)' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '800', marginBottom: '12px', color: 'var(--system-red)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Shield size={20} /> 铁律（永不违反）
                </h3>
                <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '2' }}>
                  <div>1. 财报前 48 小时不交易</div>
                  <div>2. 单日亏损 &gt; 5% 停止操作</div>
                  <div>3. 利好不涨 ≥ 3 次立即进入防守态</div>
                </div>
              </div>
            </div>

            {/* 最终总结 */}
            <div className="card" style={{
              padding: '20px',
              background: 'var(--bg-card)',
              border: '1px solid var(--glass-border)',
              borderRadius: 'var(--radius-lg)',
              marginTop: '20px'
            }}>
              <h2 style={{ fontSize: '1.35rem', fontWeight: '800', marginBottom: '16px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Target size={24} style={{ color: 'var(--system-pink)' }} /> 作战终局
              </h2>
              <div style={{ padding: '24px', background: 'var(--system-gray6)', borderRadius: 'var(--radius-md)', border: '1px solid var(--system-gray5)', marginBottom: '24px' }}>
                <p style={{ fontSize: '1.1rem', color: 'var(--text-primary)', lineHeight: '1.8', fontStyle: 'italic', textAlign: 'center', fontWeight: '600' }}>
                  "2026 年不是预测 AI 成败，而是管理'资本预期透支'风险。你的任务是在市场投票前完成防守，在恐慌后重新布局真正的赢家。"
                </p>
              </div>
              <div style={{ padding: '24px', background: 'var(--system-blue-light)', border: '1px solid rgba(0, 122, 255, 0.1)', borderRadius: 'var(--radius-md)' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: '800', marginBottom: '12px', color: 'var(--system-blue)' }}>本周紧急动作</h3>
                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: '1.8' }}>
                  <li>建立黄金底仓 15%</li>
                  <li>减持 Google/Meta 至目标仓位</li>
                  <li>清空高风险雷区资产</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'checklist' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {checklistData.map((section, index) => (
              <div key={index} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '12px' }}>
                <h3 style={{
                  fontSize: '1rem',
                  fontWeight: '700',
                  color: '#1f2937',
                  marginBottom: '10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    background: 'var(--system-blue-light)',
                    color: 'var(--system-blue)',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: '800',
                    fontSize: '0.9rem'
                  }}>
                    {index + 1}
                  </div>
                  {section.category}
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {section.items.map((item) => {
                    const hasDetail = 'detail' in item && item.detail
                    const detailId = `${item.id}-detail`
                    const isDetailExpanded = checkedItems[detailId] || false
                    return (
                      <div key={item.id} style={{
                        border: '1px solid var(--system-gray5)',
                        borderRadius: 'var(--radius-md)',
                        padding: '12px',
                        background: 'rgba(255,255,255,0.3)',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '12px'
                      }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.5)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.3)' }}
                      >
                        <input
                          type="checkbox"
                          id={item.id}
                          checked={checkedItems[item.id] || false}
                          onChange={() => toggleCheck(item.id)}
                          style={{
                            marginTop: '2px',
                            width: '20px',
                            height: '20px',
                            cursor: 'pointer',
                            accentColor: 'var(--system-blue)'
                          }}
                        />
                        <div style={{ flex: 1 }}>
                          <label
                            htmlFor={item.id}
                            style={{
                              cursor: 'pointer',
                              textDecoration: checkedItems[item.id] ? 'line-through' : 'none',
                              color: checkedItems[item.id] ? 'var(--text-tertiary)' : 'var(--text-primary)',
                              fontSize: '1rem',
                              fontWeight: '600',
                              lineHeight: '1.5',
                              display: 'block'
                            }}
                          >
                            {item.text}
                          </label>
                          {hasDetail && (
                            <div style={{ marginTop: '8px' }}>
                              <button
                                onClick={() => toggleCheck(detailId)}
                                style={{
                                  background: 'var(--system-gray6)',
                                  border: '1px solid var(--system-gray5)',
                                  color: 'var(--system-blue)',
                                  cursor: 'pointer',
                                  fontSize: '0.85rem',
                                  padding: '6px 12px',
                                  borderRadius: 'var(--radius-sm)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '6px',
                                  fontWeight: '700',
                                  marginTop: '8px'
                                }}
                              >
                                {isDetailExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                {isDetailExpanded ? '隐藏行动指南' : '展开行动指南'}
                              </button>
                              {isDetailExpanded && (
                                <div style={{
                                  marginTop: '12px',
                                  padding: '16px',
                                  background: 'var(--bg-card)',
                                  borderRadius: 'var(--radius-sm)',
                                  border: '1px solid var(--system-gray5)',
                                  fontSize: '0.9rem',
                                  color: 'var(--text-secondary)',
                                  lineHeight: '1.8',
                                  boxShadow: 'var(--shadow-sm)'
                                }}>
                                  {item.detail}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {activeTab === 'earnings' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* 标题 */}
            <div className="glass-panel" style={{
              background: 'linear-gradient(135deg, var(--system-green) 0%, var(--system-teal) 100%)',
              borderRadius: 'var(--radius-md)',
              padding: '20px',
              color: 'white',
              boxShadow: 'var(--shadow-lg)',
              border: '1px solid rgba(255,255,255,0.2)'
            }}>
              <h1 style={{ fontSize: '1.75rem', fontWeight: '800', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <BarChart2 size={32} /> 2026 核心财报作战季
              </h1>
              <p style={{ fontSize: '1rem', opacity: 0.9, fontWeight: '500' }}>
                追踪未来一周关键财报 • 验证 AI 投资回报率 • 捕捉超预期机会
              </p>
            </div>

            {/* 数据来源链接 */}
            <div style={{
              marginBottom: '16px',
              padding: '12px 20px',
              background: 'var(--system-blue-light)',
              border: '1px solid rgba(0, 122, 255, 0.1)',
              borderRadius: 'var(--radius-sm)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <Info size={18} style={{ color: 'var(--system-blue)' }} />
              <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: '500' }}>
                实时数据同步：
              </span>
              <a
                href="https://www.tradingview.com/markets/earnings/"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontSize: '0.9rem',
                  color: 'var(--system-blue)',
                  textDecoration: 'none',
                  fontWeight: '700',
                  borderBottom: '1px solid transparent',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderBottomColor = 'var(--system-blue)' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderBottomColor = 'transparent' }}
              >
                TradingView 财报日历
              </a>
            </div>

            {/* 刷新按钮 */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                onClick={async () => {
                  setLoadingEarnings(true);
                  try {
                    const data = await fetchEarningsCalendar(7);
                    setEarningsData(data);
                  } catch (error) {
                    console.error('Failed to fetch earnings:', error);
                  } finally {
                    setLoadingEarnings(false);
                  }
                }}
                disabled={loadingEarnings}
                style={{
                  padding: '12px 24px',
                  background: loadingEarnings ? 'var(--system-gray5)' : 'var(--system-blue)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  cursor: loadingEarnings ? 'not-allowed' : 'pointer',
                  fontWeight: '700',
                  fontSize: '0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: 'var(--shadow-sm)',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => {
                  if (!loadingEarnings) {
                    e.currentTarget.style.transform = 'translateY(-1px)';
                    e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loadingEarnings) {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'var(--shadow-sm)';
                  }
                }}
              >
                {loadingEarnings ? '⏳ 正在同步...' : '🔄 刷新实时数据'}
              </button>
            </div>

            {/* 财报列表 */}
            {loadingEarnings ? (
              <div style={{
                textAlign: 'center',
                padding: '64px',
                color: 'var(--text-tertiary)',
                fontSize: '1rem'
              }}>
                ⏳ 正在同步全量数据...
              </div>
            ) : earningsData.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '64px',
                color: 'var(--text-tertiary)',
                fontSize: '1rem',
                background: 'var(--system-gray6)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--system-gray5)'
              }}>
                <Search size={48} style={{ marginBottom: '20px', color: 'var(--system-gray4)' }} />
                <p>暂无财报数据，请点击刷新按钮获取</p>
              </div>
            ) : (
              (() => {
                // 按日期分组
                const groupedByDate: Record<string, EarningsCalendarItem[]> = {};
                earningsData.forEach(item => {
                  const dateKey = item.date || '未知日期';
                  if (!groupedByDate[dateKey]) {
                    groupedByDate[dateKey] = [];
                  }
                  groupedByDate[dateKey].push(item);
                });

                // 按日期排序
                const sortedDates = Object.keys(groupedByDate).sort((a, b) => {
                  if (a === '未知日期') return 1;
                  if (b === '未知日期') return -1;
                  return new Date(a).getTime() - new Date(b).getTime();
                });

                // 国家代码到国旗的映射
                const getCountryFlag = (country?: string) => {
                  if (!country) return '🌐';
                  const flagMap: Record<string, string> = {
                    'US': '🇺🇸', 'USA': '🇺🇸',
                    'CN': '🇨🇳', 'CHN': '🇨🇳',
                    'HK': '🇭🇰', 'HKG': '🇭🇰',
                    'UK': '🇬🇧', 'GBR': '🇬🇧',
                    'IN': '🇮🇳', 'IND': '🇮🇳',
                    'JP': '🇯🇵', 'JPN': '🇯🇵',
                    'KR': '🇰🇷', 'KOR': '🇰🇷',
                    'DE': '🇩🇪', 'DEU': '🇩🇪',
                    'FR': '🇫🇷', 'FRA': '🇫🇷',
                  };
                  return flagMap[country.toUpperCase()] || '🌐';
                };

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {sortedDates.map((dateKey) => {
                      const items = groupedByDate[dateKey];
                      const dateObj = dateKey !== '未知日期' ? new Date(dateKey) : null;
                      const dateStr = dateObj ? dateObj.toLocaleDateString('zh-CN', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                        weekday: 'long'
                      }).replace(/\s+/g, ' ') : '未知日期';

                      return (
                        <div key={dateKey} style={{
                          border: '1px solid var(--system-gray5)',
                          borderRadius: 'var(--radius-md)',
                          background: 'var(--bg-card)',
                          overflow: 'hidden',
                          boxShadow: 'var(--shadow-sm)',
                          marginBottom: '12px'
                        }}>
                          {/* 日期标题 */}
                          <div style={{
                            background: 'var(--system-gray6)',
                            padding: '10px 16px',
                            borderBottom: '1px solid var(--system-gray5)',
                            fontWeight: '800',
                            fontSize: '0.95rem',
                            color: 'var(--text-primary)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px'
                          }}>
                            <Calendar size={18} style={{ color: 'var(--system-blue)' }} />
                            {dateStr}
                          </div>

                          {/* 表格 */}
                          <div style={{ overflowX: 'auto' }}>
                            <table style={{
                              width: '100%',
                              borderCollapse: 'collapse',
                              minWidth: '900px'
                            }}>
                              <thead>
                                <tr style={{
                                  background: 'var(--system-gray6)',
                                  borderBottom: '1px solid var(--system-gray5)'
                                }}>
                                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '700', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>公司</th>
                                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '700', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>每股收益 / 预测值</th>
                                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '700', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>营收 / 预测值</th>
                                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '700', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>市值</th>
                                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '700', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>时间</th>
                                </tr>
                              </thead>
                              <tbody>
                                {items.map((item, index) => (
                                  <tr
                                    key={`${item.symbol}-${index}`}
                                    style={{
                                      borderBottom: '1px solid var(--system-gray5)',
                                      transition: 'background 0.2s'
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.background = 'var(--system-gray6)';
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.background = 'transparent';
                                    }}
                                  >
                                    <td style={{
                                      padding: '8px 12px',
                                      borderRight: '1px solid var(--system-gray5)'
                                    }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontSize: '1.2rem' }}>
                                          {getCountryFlag(item.country)}
                                        </span>
                                        <div style={{ flex: 1 }}>
                                          {item.url ? (
                                            <a
                                              href={item.url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              style={{
                                                color: '#3b82f6',
                                                textDecoration: 'none',
                                                fontWeight: '500',
                                                fontSize: '0.85rem',
                                                cursor: 'pointer',
                                                display: 'inline',
                                                transition: 'color 0.2s',
                                                lineHeight: '1.4'
                                              }}
                                              onMouseEnter={(e) => {
                                                e.currentTarget.style.color = '#2563eb';
                                                e.currentTarget.style.textDecoration = 'underline';
                                              }}
                                              onMouseLeave={(e) => {
                                                e.currentTarget.style.color = '#3b82f6';
                                                e.currentTarget.style.textDecoration = 'none';
                                              }}
                                            >
                                              {(() => {
                                                // 格式：中文名 (英文代码)
                                                const hasChinese = /[\u4e00-\u9fa5]/.test(item.name || '');
                                                if (hasChinese && item.symbol && item.symbol !== item.name) {
                                                  return `${item.name} (${item.symbol})`;
                                                } else if (hasChinese) {
                                                  return item.name;
                                                } else if (item.symbol) {
                                                  return item.symbol;
                                                } else {
                                                  return item.name || '-';
                                                }
                                              })()}
                                            </a>
                                          ) : (
                                            <span style={{
                                              fontWeight: '500',
                                              fontSize: '0.85rem',
                                              color: '#1f2937',
                                              lineHeight: '1.4'
                                            }}>
                                              {(() => {
                                                // 格式：中文名 (英文代码)
                                                const hasChinese = /[\u4e00-\u9fa5]/.test(item.name || '');
                                                if (hasChinese && item.symbol && item.symbol !== item.name) {
                                                  return `${item.name} (${item.symbol})`;
                                                } else if (hasChinese) {
                                                  return item.name;
                                                } else if (item.symbol) {
                                                  return item.symbol;
                                                } else {
                                                  return item.name || '-';
                                                }
                                              })()}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </td>
                                    <td style={{
                                      padding: '8px 12px',
                                      color: '#4b5563',
                                      fontSize: '0.8rem',
                                      borderRight: '1px solid #e5e7eb',
                                      lineHeight: '1.4'
                                    }}>
                                      {item.epsActual ? (
                                        <span>
                                          <span style={{ color: '#1f2937' }}>{item.epsActual}</span>
                                          {' / '}
                                          <span style={{ color: '#6b7280' }}>{item.epsEstimate || '--'}</span>
                                        </span>
                                      ) : (
                                        <span style={{ color: '#6b7280' }}>
                                          -- / {item.epsEstimate || '--'}
                                        </span>
                                      )}
                                    </td>
                                    <td style={{
                                      padding: '8px 12px',
                                      color: '#4b5563',
                                      fontSize: '0.8rem',
                                      borderRight: '1px solid #e5e7eb',
                                      lineHeight: '1.4'
                                    }}>
                                      {item.revenueActual ? (
                                        <span>
                                          <span style={{ color: '#1f2937' }}>{item.revenueActual}</span>
                                          {' / '}
                                          <span style={{ color: '#6b7280' }}>{item.revenueEstimate || '--'}</span>
                                        </span>
                                      ) : (
                                        <span style={{ color: '#6b7280' }}>
                                          -- / {item.revenueEstimate || '--'}
                                        </span>
                                      )}
                                    </td>
                                    <td style={{
                                      padding: '8px 12px',
                                      color: '#1f2937',
                                      fontSize: '0.8rem',
                                      borderRight: '1px solid #e5e7eb',
                                      fontWeight: '500',
                                      lineHeight: '1.4'
                                    }}>
                                      {item.marketCap || ''}
                                    </td>
                                    <td style={{ padding: '8px 12px', lineHeight: '1.4' }}>
                                      {item.time ? (
                                        <span style={{
                                          display: 'inline-flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                          fontSize: '0.8rem',
                                          color: '#4b5563'
                                        }}>
                                          <span style={{ fontSize: '0.75rem' }}>
                                            {item.time === '盘前' ? '☀️' : item.time === '盘后' ? '🌙' : '🌤️'}
                                          </span>
                                          <span>{item.time}</span>
                                        </span>
                                      ) : (
                                        <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}>--</span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()
            )}
          </div>
        )}

        {activeTab === 'shorting' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '16px' }}>
              <h3 style={{ fontWeight: '700', fontSize: '1.1rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <TrendingDown size={24} />
                做空入场条件检查表（修正版：结合宏观时间表）
              </h3>
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '12px', marginBottom: '16px' }}>
                <p style={{ fontSize: '0.85rem', color: '#92400e', lineHeight: '1.6', marginBottom: '8px', fontWeight: '700' }}>
                  ⚠️ 关键修正：时间错位问题
                </p>
                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.85rem', color: '#92400e', lineHeight: '1.8' }}>
                  <li><strong>原计划问题：</strong>4月20日开始做空太晚，会错过3月18日FOMC会议的关键信号</li>
                  <li><strong>失业率滞后性：</strong>4月公布的失业数据反映3月情况，等到4月时宏观预期已在3月被确认</li>
                  <li><strong>5月Fed换届：</strong>是风险释放期而非建仓期，此时做空容易被极端波动清仓</li>
                </ul>
                <p style={{ fontSize: '0.85rem', color: '#92400e', lineHeight: '1.6', marginTop: '8px', fontWeight: '700' }}>
                  ✅ 修正策略：3月中旬开始布局，5月前完成主要建仓
                </p>
              </div>
              <p style={{ fontSize: '0.85rem', color: '#374151', marginBottom: '16px' }}>
                必须同时满足前3个核心条件才能开始做空，后2个为加强信号。注意：<strong>不是"4月底开始做空"，而是"3月中旬开始布局"</strong>
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
                      padding: '8px 10px',
                      borderRadius: '6px',
                      border: '1px solid #e5e7eb'
                    }}
                  >
                    <input
                      type="checkbox"
                      id={item.id}
                      checked={checkedItems[item.id] || false}
                      onChange={() => toggleCheck(item.id)}
                      style={{ marginTop: '2px', width: '18px', height: '18px', cursor: 'pointer' }}
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
              <h4 style={{ fontWeight: '700', marginBottom: '8px', color: '#92400e' }}>修正后的分批入场节奏</h4>
              <div style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '8px', color: '#374151' }}>
                <div style={{ fontWeight: '600', color: '#991b1b' }}>• <strong>3月中旬：</strong>开始监控FOMC会议，准备资金</div>
                <div style={{ fontWeight: '600', color: '#991b1b' }}>• <strong>3月18日后：</strong>如果FOMC点阵图显示&lt;2次降息 → 第一批做空20%（股债双杀信号）</div>
                <div style={{ fontWeight: '600', color: '#991b1b' }}>• <strong>3月末-4月初：</strong>基于3月就业数据（4月初公布），如果失业率趋势恶化 → 第二批做空30%</div>
                <div>• <strong>4月20日：</strong>第三批做空20%（补充机会，如果前两批未完全建仓）</div>
                <div style={{ color: '#6b7280', fontStyle: 'italic' }}>• <strong>5月初：</strong>只保留10%仓位应对黑天鹅，<strong>不继续建仓</strong>（5月Fed换届是风险释放期，极端波动容易清仓）</div>
              </div>
              <div style={{ marginTop: '12px', padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '6px' }}>
                <p style={{ fontSize: '0.85rem', color: '#991b1b', lineHeight: '1.6', margin: 0, fontWeight: '700' }}>
                  📌 核心原则：在最大黑天鹅（5月Fed换届）前抢占位置，而不是等到黑天鹅发生后再建仓
                </p>
              </div>
            </div>

            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '16px' }}>
              <h4 style={{ fontWeight: '700', marginBottom: '8px', color: '#991b1b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={20} />
                止损线设置与5月特殊处理
              </h4>
              <div style={{ fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '8px', color: '#374151' }}>
                <div>• PSQ仓位: 如纳指反弹+10%，先减仓30%</div>
                <div>• 纳指跌幅达25%时，可兑现30%利润</div>
                <div>• <strong>5月Fed换届前：</strong>如果已建仓70%以上，5月初减仓至10%，避免极端波动清仓</div>
                <div>• <strong>5月后：</strong>剩余仓位持有至8-9月寻找抄底机会</div>
              </div>
              <div style={{ marginTop: '12px', padding: '12px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px' }}>
                <p style={{ fontSize: '0.85rem', color: '#92400e', lineHeight: '1.6', margin: 0 }}>
                  <strong>💡 5月策略：</strong>5月Fed主席换届会造成VIX极度波动和非理性抛售。此时做空不是为了获利，而是被迫应对"黑天鹅"。因此5月前应完成主要建仓，5月只保留少量仓位应对极端情况。
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'profit-taking' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* 核心止盈策略 */}
            <div style={{ background: '#f0fdf4', border: '2px solid #10b981', borderRadius: '12px', padding: '16px 20px' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '16px', color: '#059669', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '2rem' }}>💰</span>
                核心止盈策略
              </h2>

              <div style={{
                background: '#fef3c7',
                border: '1px solid #fbbf24',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '24px'
              }}>
                <p style={{ fontSize: '0.95rem', color: '#92400e', lineHeight: '1.6', margin: 0 }}>
                  为了让这套逻辑适用于<strong>任何</strong>普通股票、加密货币或其它金融资产，我们将其去标的化，转化为一套通用的<strong>"心态+技术"</strong>双驱动止盈模型。
                </p>
              </div>

              {/* 分批止盈法 */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{
                  background: '#d1fae5',
                  border: '1px solid #10b981',
                  borderRadius: '8px',
                  padding: '16px',
                  marginBottom: '16px'
                }}>
                  <h3 style={{
                    fontSize: '1.2rem',
                    fontWeight: '700',
                    marginBottom: '12px',
                    color: '#065f46',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span style={{ fontSize: '1.5rem' }}>1️⃣</span>
                    分批止盈法：动态减仓策略
                  </h3>
                  <p style={{ fontSize: '0.95rem', color: '#047857', marginBottom: '16px', lineHeight: '1.6' }}>
                    这种方法的核心在于<strong>"心理建设"</strong>，通过逐步锁定胜果，对抗贪婪与恐惧。
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{
                      background: 'white',
                      border: '1px solid #86efac',
                      borderRadius: '8px',
                      padding: '16px'
                    }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '8px'
                      }}>
                        <span style={{
                          fontSize: '1.2rem',
                          background: '#10b981',
                          color: 'white',
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: '700'
                        }}>
                          1
                        </span>
                        <h4 style={{
                          fontSize: '1rem',
                          fontWeight: '600',
                          color: '#065f46',
                          margin: 0
                        }}>
                          第一阶段：落袋为安（心理脱敏）
                        </h4>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '8px' }}>
                        <strong>触发点：</strong>当盈利达到 <strong style={{ color: '#059669' }}>15% - 20%</strong>（或达到一个让你感到"开心但怕跌回去"的数字）。
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '8px' }}>
                        <strong>操作：</strong>卖出 <strong style={{ color: '#059669' }}>20% - 30%</strong> 的仓位。
                      </div>
                      <p style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.6', margin: 0 }}>
                        <strong>目的：</strong>确保即便后续价格跌回成本，你这笔交易整体也是盈利的，从而获得极其冷静的心态去持仓。
                      </p>
                    </div>

                    <div style={{
                      background: 'white',
                      border: '1px solid #86efac',
                      borderRadius: '8px',
                      padding: '16px'
                    }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '8px'
                      }}>
                        <span style={{
                          fontSize: '1.2rem',
                          background: '#10b981',
                          color: 'white',
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: '700'
                        }}>
                          2
                        </span>
                        <h4 style={{
                          fontSize: '1rem',
                          fontWeight: '600',
                          color: '#065f46',
                          margin: 0
                        }}>
                          第二阶段：关键位减仓（尊重市场）
                        </h4>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '8px' }}>
                        <strong>触发点：</strong>价格到达<strong>历史高点、强阻力位</strong>，或对应的<strong>估值高位</strong>（如市盈率达到历史 80% 分位）。
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '8px' }}>
                        <strong>操作：</strong>再卖出 <strong style={{ color: '#059669' }}>30% - 40%</strong>。
                      </div>
                      <p style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.6', margin: 0 }}>
                        <strong>目的：</strong>阻力位通常会有大量抛压，在此处减仓可以规避大幅回撤的风险。
                      </p>
                    </div>

                    <div style={{
                      background: 'white',
                      border: '1px solid #86efac',
                      borderRadius: '8px',
                      padding: '16px'
                    }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        marginBottom: '8px'
                      }}>
                        <span style={{
                          fontSize: '1.2rem',
                          background: '#10b981',
                          color: 'white',
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: '700'
                        }}>
                          3
                        </span>
                        <h4 style={{
                          fontSize: '1rem',
                          fontWeight: '600',
                          color: '#065f46',
                          margin: 0
                        }}>
                          第三阶段：剩余仓位博弈（寻找惊喜）
                        </h4>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '8px' }}>
                        <strong>操作：</strong>剩下的 <strong style={{ color: '#059669' }}>30%</strong> 仓位不再设止盈目标。
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '8px' }}>
                        <strong>离场条件：</strong>只有当<strong>大趋势彻底走坏</strong>（如跌破重要长期均线）时才全额清仓。
                      </div>
                      <p style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.6', margin: 0 }}>
                        <strong>目的：</strong>捕获那种翻倍甚至数倍的"超级行情"。
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 移动止盈法 */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{
                  background: '#dbeafe',
                  border: '1px solid #3b82f6',
                  borderRadius: '8px',
                  padding: '16px'
                }}>
                  <h3 style={{
                    fontSize: '1.2rem',
                    fontWeight: '700',
                    marginBottom: '12px',
                    color: '#1e40af',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <span style={{ fontSize: '1.5rem' }}>2️⃣</span>
                    移动止盈法：跟踪止损策略（Trailing Stop）
                  </h3>
                  <p style={{ fontSize: '0.95rem', color: '#1e3a8a', marginBottom: '16px', lineHeight: '1.6' }}>
                    这种方法的核心在于<strong>"不预测顶部"</strong>，只根据市场的真实走势被动离场。
                  </p>

                  <div style={{
                    background: 'white',
                    border: '1px solid #93c5fd',
                    borderRadius: '8px',
                    padding: '16px',
                    marginBottom: '12px'
                  }}>
                    <h4 style={{
                      fontSize: '1rem',
                      fontWeight: '600',
                      color: '#1e40af',
                      marginBottom: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <span style={{ fontSize: '1.2rem' }}>⚙️</span>
                      核心规则：设定回撤阈值
                    </h4>
                    <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.6', marginBottom: '12px' }}>
                      <strong>操作：</strong>随着价格不断创出新高，你同步<strong>向上平移</strong>你的止损线。
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.6' }}>
                      <strong>设定参考：</strong>
                      <ul style={{ margin: '8px 0 0 20px', padding: 0 }}>
                        <li style={{ marginBottom: '4px' }}>
                          <strong>稳健型：</strong>从最高点回撤 <strong style={{ color: '#2563eb' }}>5% - 8%</strong> 离场。
                        </li>
                        <li>
                          <strong>进攻型：</strong>从最高点回撤 <strong style={{ color: '#2563eb' }}>10% - 15%</strong> 离场（适合波动巨大的个股）。
                        </li>
                      </ul>
                    </div>
                  </div>

                  <div style={{
                    background: '#f0fdf4',
                    border: '1px solid #86efac',
                    borderRadius: '8px',
                    padding: '16px'
                  }}>
                    <h4 style={{
                      fontSize: '1rem',
                      fontWeight: '600',
                      color: '#059669',
                      marginBottom: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <span style={{ fontSize: '1.2rem' }}>📊</span>
                      应用场景
                    </h4>
                    <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.9rem', color: '#374151', lineHeight: '1.6' }}>
                      <li style={{ marginBottom: '8px' }}>
                        <strong>单边上涨行情：</strong>只要股票每天都在创新高，你就一直持有，不设上限。
                      </li>
                      <li>
                        <strong>锁住大头利润：</strong>比如股价从 10 元涨到 20 元，止盈线自动跟进到 18 元；即使后来跌了，你也远比在 12 元卖出赚得多。
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* 通用止盈公式建议 */}
              <div style={{
                background: '#fef3c7',
                border: '1px solid #fbbf24',
                borderRadius: '8px',
                padding: '16px'
              }}>
                <h3 style={{
                  fontSize: '1.2rem',
                  fontWeight: '700',
                  marginBottom: '16px',
                  color: '#92400e',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{ fontSize: '1.5rem' }}>3️⃣</span>
                  通用止盈公式建议
                </h3>
                <p style={{ fontSize: '0.95rem', color: '#92400e', marginBottom: '16px', lineHeight: '1.6' }}>
                  将上述两者结合，你可以得到一个最稳健的<strong>通用公式</strong>：
                </p>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    background: 'white',
                    borderRadius: '8px',
                    overflow: 'hidden'
                  }}>
                    <thead>
                      <tr style={{ background: '#fbbf24' }}>
                        <th style={{
                          padding: '12px',
                          textAlign: 'left',
                          fontWeight: '700',
                          color: '#78350f',
                          border: '1px solid #f59e0b',
                          fontSize: '0.9rem'
                        }}>
                          阶段
                        </th>
                        <th style={{
                          padding: '12px',
                          textAlign: 'left',
                          fontWeight: '700',
                          color: '#78350f',
                          border: '1px solid #f59e0b',
                          fontSize: '0.9rem'
                        }}>
                          仓位操作
                        </th>
                        <th style={{
                          padding: '12px',
                          textAlign: 'left',
                          fontWeight: '700',
                          color: '#78350f',
                          border: '1px solid #f59e0b',
                          fontSize: '0.9rem'
                        }}>
                          判定逻辑
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{
                          padding: '12px',
                          border: '1px solid #fde68a',
                          fontWeight: '600',
                          color: '#374151',
                          fontSize: '0.9rem'
                        }}>
                          初期
                        </td>
                        <td style={{
                          padding: '12px',
                          border: '1px solid #fde68a',
                          color: '#374151',
                          fontSize: '0.9rem'
                        }}>
                          持仓不动
                        </td>
                        <td style={{
                          padding: '12px',
                          border: '1px solid #fde68a',
                          color: '#374151',
                          fontSize: '0.9rem'
                        }}>
                          股价在成本价上方震荡，耐心等待
                        </td>
                      </tr>
                      <tr style={{ background: '#fef9c3' }}>
                        <td style={{
                          padding: '12px',
                          border: '1px solid #fde68a',
                          fontWeight: '600',
                          color: '#374151',
                          fontSize: '0.9rem'
                        }}>
                          中期
                        </td>
                        <td style={{
                          padding: '12px',
                          border: '1px solid #fde68a',
                          color: '#374151',
                          fontSize: '0.9rem'
                        }}>
                          <strong style={{ color: '#059669' }}>卖出 1/3</strong>
                        </td>
                        <td style={{
                          padding: '12px',
                          border: '1px solid #fde68a',
                          color: '#374151',
                          fontSize: '0.9rem'
                        }}>
                          盈利覆盖了心理预期，先拿回一部分现金
                        </td>
                      </tr>
                      <tr>
                        <td style={{
                          padding: '12px',
                          border: '1px solid #fde68a',
                          fontWeight: '600',
                          color: '#374151',
                          fontSize: '0.9rem'
                        }}>
                          高潮期
                        </td>
                        <td style={{
                          padding: '12px',
                          border: '1px solid #fde68a',
                          color: '#374151',
                          fontSize: '0.9rem'
                        }}>
                          <strong style={{ color: '#2563eb' }}>启动移动止盈</strong>
                        </td>
                        <td style={{
                          padding: '12px',
                          border: '1px solid #fde68a',
                          color: '#374151',
                          fontSize: '0.9rem'
                        }}>
                          不再手动卖出，改为设置一个回撤 % 的自动单
                        </td>
                      </tr>
                      <tr style={{ background: '#fef9c3' }}>
                        <td style={{
                          padding: '12px',
                          border: '1px solid #fde68a',
                          fontWeight: '600',
                          color: '#374151',
                          fontSize: '0.9rem'
                        }}>
                          末期
                        </td>
                        <td style={{
                          padding: '12px',
                          border: '1px solid #fde68a',
                          color: '#374151',
                          fontSize: '0.9rem'
                        }}>
                          <strong style={{ color: '#dc2626' }}>全线离场</strong>
                        </td>
                        <td style={{
                          padding: '12px',
                          border: '1px solid #fde68a',
                          color: '#374151',
                          fontSize: '0.9rem'
                        }}>
                          股价跌破移动止盈线，或跌破 20 日/60 日关键均线
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 下一步操作建议 */}
              <div style={{
                background: '#e0e7ff',
                border: '1px solid #818cf8',
                borderRadius: '8px',
                padding: '16px',
                marginTop: '24px'
              }}>
                <h4 style={{
                  fontSize: '1rem',
                  fontWeight: '600',
                  color: '#3730a3',
                  marginBottom: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{ fontSize: '1.2rem' }}>💡</span>
                  你的下一步操作
                </h4>
                <p style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.6', marginBottom: '12px' }}>
                  你可以先检查一下你手头的股票：<strong>目前的盈利百分比是多少？</strong>
                </p>
                <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.9rem', color: '#374151', lineHeight: '1.8' }}>
                  <li>
                    如果是 <strong style={{ color: '#2563eb' }}>0%-10%</strong>：建议先不急着卖，观察是否能站稳。
                  </li>
                  <li>
                    如果是 <strong style={{ color: '#059669' }}>20% 以上</strong>：可以考虑先执行"第一批"卖出，锁定一部分利润，剩下的用"移动止盈法"跟踪。
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'macro-risk' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* 页面标题 */}
            <div className="glass-panel" style={{
              background: 'linear-gradient(135deg, var(--system-indigo) 0%, var(--system-purple) 100%)',
              borderRadius: 'var(--radius-md)',
              padding: '24px 20px',
              color: 'white',
              boxShadow: 'var(--shadow-lg)',
              border: '1px solid rgba(255,255,255,0.2)'
            }}>
              <h1 style={{ fontSize: '1.6rem', fontWeight: '800', marginBottom: '8px', letterSpacing: '-0.02em' }}>
                🛡️ 2026 宏观风险仪表盘
              </h1>
              <p style={{ fontSize: '0.95rem', opacity: 0.9, fontWeight: '500' }}>
                三分数据源交叉验证 • 系统性崩溃深度对冲 (更新至：2026年1月22日)
              </p>
            </div>

            {/* 当前状态总览 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
              {/* 当前阶段卡片 */}
              <div className="card" style={{
                padding: '20px',
                background: 'var(--bg-card)',
                border: '1px solid var(--glass-border)',
                borderRadius: 'var(--radius-lg)'
              }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: '800', marginBottom: '16px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Activity size={18} style={{ color: 'var(--system-indigo)' }} /> 当前风险阶段
                </h3>
                <div style={{
                  background: (() => {
                    const official = (macroRiskScores.employment_official + macroRiskScores.credit_official + macroRiskScores.bank_official) / 3;
                    const market = (macroRiskScores.employment_market + macroRiskScores.credit_market + macroRiskScores.bank_market) / 3;
                    const alt = (macroRiskScores.employment_alt + macroRiskScores.credit_alt + macroRiskScores.bank_alt) / 3;
                    const avg = (official + market + alt) / 3;
                    return avg <= 3 ? 'var(--system-green)' : avg <= 5 ? 'var(--system-orange)' : avg <= 7 ? 'var(--system-red)' : 'var(--system-red)';
                  })(),
                  color: 'white',
                  padding: '16px',
                  borderRadius: 'var(--radius-md)',
                  textAlign: 'center',
                  fontWeight: '900',
                  fontSize: '1.2rem',
                  boxShadow: 'var(--shadow-md)',
                  textShadow: '0 2px 4px rgba(0,0,0,0.2)'
                }}>
                  {(() => {
                    const official = (macroRiskScores.employment_official + macroRiskScores.credit_official + macroRiskScores.bank_official) / 3;
                    const market = (macroRiskScores.employment_market + macroRiskScores.credit_market + macroRiskScores.bank_market) / 3;
                    const alt = (macroRiskScores.employment_alt + macroRiskScores.credit_alt + macroRiskScores.bank_alt) / 3;
                    const avg = (official + market + alt) / 3;
                    return avg <= 3 ? '数据修饰期' : avg <= 5 ? '裂缝显现期' : avg <= 7 ? '信用收缩期' : '政策重置期';
                  })()}
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: '12px', gap: '8px' }}>
                  <StatusBadge text={(() => {
                    const official = (macroRiskScores.employment_official + macroRiskScores.credit_official + macroRiskScores.bank_official) / 3;
                    const market = (macroRiskScores.employment_market + macroRiskScores.credit_market + macroRiskScores.bank_market) / 3;
                    const alt = (macroRiskScores.employment_alt + macroRiskScores.credit_alt + macroRiskScores.bank_alt) / 3;
                    const avg = (official + market + alt) / 3;
                    return avg <= 3 ? 'LOW RISK' : avg <= 5 ? 'MODERATE' : avg <= 7 ? 'HIGH RISK' : 'EXTREME';
                  })()} type={(() => {
                    const official = (macroRiskScores.employment_official + macroRiskScores.credit_official + macroRiskScores.bank_official) / 3;
                    const market = (macroRiskScores.employment_market + macroRiskScores.credit_market + macroRiskScores.bank_market) / 3;
                    const alt = (macroRiskScores.employment_alt + macroRiskScores.credit_alt + macroRiskScores.bank_alt) / 3;
                    const avg = (official + market + alt) / 3;
                    return avg <= 3 ? 'green' : avg <= 5 ? 'orange' : 'red';
                  })()} />
                </div>
              </div>

              {/* 综合评分卡片 */}
              <div className="card" style={{
                padding: '20px',
                background: 'var(--bg-card)',
                border: '1px solid var(--glass-border)',
                borderRadius: 'var(--radius-lg)'
              }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: '800', marginBottom: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Target size={18} style={{ color: 'var(--system-purple)' }} /> 交叉验证综合评分
                </h3>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                  <span style={{ fontSize: '3rem', fontWeight: '900', color: 'var(--text-primary)', letterSpacing: '-0.03em' }}>
                    {(() => {
                      const official = (macroRiskScores.employment_official + macroRiskScores.credit_official + macroRiskScores.bank_official) / 3;
                      const market = (macroRiskScores.employment_market + macroRiskScores.credit_market + macroRiskScores.bank_market) / 3;
                      const alt = (macroRiskScores.employment_alt + macroRiskScores.credit_alt + macroRiskScores.bank_alt) / 3;
                      return ((official + market + alt) / 3).toFixed(1);
                    })()}
                  </span>
                  <span style={{ fontSize: '1.2rem', color: 'var(--text-tertiary)', fontWeight: '600' }}>/ 10</span>
                </div>
                <div style={{
                  display: 'flex',
                  gap: '8px',
                  marginTop: '12px',
                  padding: '8px 12px',
                  background: 'var(--system-gray6)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.75rem',
                  fontWeight: '600',
                  color: 'var(--text-secondary)'
                }}>
                  <div style={{ flex: 1, textAlign: 'center' }}>官方:{((macroRiskScores.employment_official + macroRiskScores.credit_official + macroRiskScores.bank_official) / 3).toFixed(1)}</div>
                  <div style={{ width: '1px', background: 'var(--system-gray5)' }} />
                  <div style={{ flex: 1, textAlign: 'center' }}>市场:{((macroRiskScores.employment_market + macroRiskScores.credit_market + macroRiskScores.bank_market) / 3).toFixed(1)}</div>
                  <div style={{ width: '1px', background: 'var(--system-gray5)' }} />
                  <div style={{ flex: 1, textAlign: 'center' }}>替代:{((macroRiskScores.employment_alt + macroRiskScores.credit_alt + macroRiskScores.bank_alt) / 3).toFixed(1)}</div>
                </div>
              </div>

              {/* 信号一致性卡片 */}
              <div className="card" style={{
                padding: '20px',
                background: 'var(--bg-card)',
                border: '1px solid var(--glass-border)',
                borderRadius: 'var(--radius-lg)'
              }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: '800', marginBottom: '16px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Shield size={18} style={{ color: 'var(--system-green)' }} /> 信号置信度与一致性
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  {(() => {
                    const official = (macroRiskScores.employment_official + macroRiskScores.credit_official + macroRiskScores.bank_official) / 3;
                    const market = (macroRiskScores.employment_market + macroRiskScores.credit_market + macroRiskScores.bank_market) / 3;
                    const alt = (macroRiskScores.employment_alt + macroRiskScores.credit_alt + macroRiskScores.bank_alt) / 3;
                    const diff = Math.max(official, market, alt) - Math.min(official, market, alt);

                    if (diff <= 2) {
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ background: 'var(--system-green)', color: 'white', padding: '10px', borderRadius: '50%' }}><CheckCircle2 size={24} /></div>
                          <div>
                            <div style={{ fontWeight: '800', fontSize: '1.1rem', color: 'var(--text-primary)' }}>信号强一致</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--system-green)', fontWeight: '600' }}>交叉验证成功</div>
                          </div>
                        </div>
                      );
                    } else if (market >= 7 && alt >= 7 && official <= 4) {
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ background: 'var(--system-orange)', color: 'white', padding: '10px', borderRadius: '50%' }}><AlertTriangle size={24} /></div>
                          <div>
                            <div style={{ fontWeight: '800', fontSize: '1.1rem', color: 'var(--text-primary)' }}>统计滞后期</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--system-orange)', fontWeight: '600' }}>官方数据存疑</div>
                          </div>
                        </div>
                      );
                    } else {
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ background: 'var(--system-red)', color: 'white', padding: '10px', borderRadius: '50%' }}><XCircle size={24} /></div>
                          <div>
                            <div style={{ fontWeight: '800', fontSize: '1.1rem', color: 'var(--text-primary)' }}>信号极度分化</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--system-red)', fontWeight: '600' }}>深度噪音预警</div>
                          </div>
                        </div>
                      );
                    }
                  })()}
                </div>
                <div style={{
                  marginTop: '16px',
                  padding: '10px 12px',
                  background: 'rgba(0,0,0,0.03)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.8rem',
                  color: 'var(--text-secondary)',
                  fontWeight: '500',
                  lineHeight: '1.4'
                }}>
                  {(() => {
                    const official = (macroRiskScores.employment_official + macroRiskScores.credit_official + macroRiskScores.bank_official) / 3;
                    const market = (macroRiskScores.employment_market + macroRiskScores.credit_market + macroRiskScores.bank_market) / 3;
                    const alt = (macroRiskScores.employment_alt + macroRiskScores.credit_alt + macroRiskScores.bank_alt) / 3;
                    if (market >= 7 && alt >= 7 && official <= 4) return '⚠️ 替代数据指示危机，官方数据严重修复痕迹。';
                    return '当前数据流一致性良好，决策置信度高。';
                  })()}
                </div>
              </div>
            </div>

            {/* 三维度详细评分 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
              {/* 就业与收入 */}
              <div className="card" style={{ padding: '20px', background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '800', marginBottom: '20px', color: 'var(--system-blue)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Users size={20} /> 就业与收入系统
                </h3>
                {[
                  { label: '官方数据 (BLS非农/失业率)', score: macroRiskScores.employment_official },
                  { label: '市场数据 (利差/利率期货)', score: macroRiskScores.employment_market },
                  { label: '替代数据 (岗位投放/工资单)', score: macroRiskScores.employment_alt }
                ].map((item, idx) => (
                  <div key={idx} style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '8px', fontWeight: '600' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
                      <span style={{ color: 'var(--text-primary)' }}>{item.score}/10</span>
                    </div>
                    <div style={{ width: '100%', background: 'var(--system-gray6)', borderRadius: '999px', height: '6px', overflow: 'hidden' }}>
                      <div style={{
                        width: `${(item.score / 10) * 100}%`,
                        height: '100%',
                        borderRadius: '999px',
                        background: item.score <= 3 ? 'var(--system-green)' : item.score <= 5 ? 'var(--system-orange)' : 'var(--system-red)',
                        boxShadow: '0 0 8px rgba(0,0,0,0.1)'
                      }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* 消费信用 */}
              <div className="card" style={{ padding: '20px', background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '800', marginBottom: '20px', color: 'var(--system-purple)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <CreditCard size={20} /> 消费信用脉络
                </h3>
                {[
                  { label: '官方数据 (储蓄率/消费支出)', score: macroRiskScores.credit_official },
                  { label: '市场数据 (ABS利差/零售财报)', score: macroRiskScores.credit_market },
                  { label: '替代数据 (刷卡数据/车贷逾期)', score: macroRiskScores.credit_alt }
                ].map((item, idx) => (
                  <div key={idx} style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '8px', fontWeight: '600' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
                      <span style={{ color: 'var(--text-primary)' }}>{item.score}/10</span>
                    </div>
                    <div style={{ width: '100%', background: 'var(--system-gray6)', borderRadius: '999px', height: '6px', overflow: 'hidden' }}>
                      <div style={{
                        width: `${(item.score / 10) * 100}%`,
                        height: '100%',
                        borderRadius: '999px',
                        background: item.score <= 3 ? 'var(--system-green)' : item.score <= 5 ? 'var(--system-orange)' : 'var(--system-red)',
                        boxShadow: '0 0 8px rgba(0,0,0,0.1)'
                      }} />
                    </div>
                  </div>
                ))}
              </div>

              {/* 银行流动性 */}
              <div className="card" style={{ padding: '20px', background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '800', marginBottom: '20px', color: 'var(--system-red)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Shield size={20} /> 银行系统流动性
                </h3>
                {[
                  { label: '官方数据 (拨备/存款)', score: macroRiskScores.bank_official },
                  { label: '市场数据 (银行股/CDS)', score: macroRiskScores.bank_market },
                  { label: '替代数据 (货基流入/社交热度)', score: macroRiskScores.bank_alt }
                ].map((item, idx) => (
                  <div key={idx} style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '8px', fontWeight: '600' }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{item.label}</span>
                      <span style={{ color: 'var(--text-primary)' }}>{item.score}/10</span>
                    </div>
                    <div style={{ width: '100%', background: 'var(--system-gray6)', borderRadius: '999px', height: '6px', overflow: 'hidden' }}>
                      <div style={{
                        width: `${(item.score / 10) * 100}%`,
                        height: '100%',
                        borderRadius: '999px',
                        background: item.score <= 3 ? 'var(--system-green)' : item.score <= 5 ? 'var(--system-orange)' : 'var(--system-red)',
                        boxShadow: '0 0 8px rgba(0,0,0,0.1)'
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 核心监测指标 */}
            <div className="card" style={{ padding: '24px', background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)' }}>
              <h2 style={{ fontSize: '1.35rem', fontWeight: '800', marginBottom: '24px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--system-gray5)', paddingBottom: '12px' }}>
                <Target size={24} style={{ color: 'var(--system-purple)' }} /> 核心监测指标矩阵
              </h2>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                <div style={{ borderLeft: '4px solid var(--system-red)', padding: '16px', background: 'var(--system-red-light)', borderRadius: '0 var(--radius-md) var(--radius-md) 0' }}>
                  <h4 style={{ fontWeight: '800', color: 'var(--system-red)', marginBottom: '12px', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Clock size={16} /> 每周必看 (最早预警)
                  </h4>
                  <ul style={{ fontSize: '0.85rem', margin: 0, paddingLeft: '18px', color: 'var(--text-secondary)', lineHeight: '1.8', fontWeight: '500' }}>
                    <li>初请失业金 (连续4周&gt;30万)</li>
                    <li>区域银行股/CDS走势 (异常背离)</li>
                    <li>回购/SOFR利差异常 (流动性枯竭)</li>
                  </ul>
                </div>

                <div style={{ borderLeft: '4px solid var(--system-orange)', padding: '16px', background: 'rgba(255, 149, 0, 0.05)', borderRadius: '0 var(--radius-md) var(--radius-md) 0' }}>
                  <h4 style={{ fontWeight: '800', color: 'var(--system-orange)', marginBottom: '12px', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <TrendingUp size={16} /> 每月必看 (趋势确认)
                  </h4>
                  <ul style={{ fontSize: '0.85rem', margin: 0, paddingLeft: '18px', color: 'var(--text-secondary)', lineHeight: '1.8', fontWeight: '500' }}>
                    <li>非农回修幅度 (连续3月负修订)</li>
                    <li>次级车贷逾期率 (&gt;6.5% 阈值)</li>
                    <li>信用卡逾期率 (中产阶级 &gt;5%)</li>
                    <li>兼职困境人数 (结构性恶化)</li>
                  </ul>
                </div>

                <div style={{ borderLeft: '4px solid var(--system-yellow)', padding: '16px', background: 'rgba(255, 204, 0, 0.05)', borderRadius: '0 var(--radius-md) var(--radius-md) 0' }}>
                  <h4 style={{ fontWeight: '800', color: '#b28900', marginBottom: '12px', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Briefcase size={16} /> 每季必看 (战略对齐)
                  </h4>
                  <ul style={{ fontSize: '0.85rem', margin: 0, paddingLeft: '18px', color: 'var(--text-secondary)', lineHeight: '1.8', fontWeight: '500' }}>
                    <li>401k困难提取率 (同比&gt;15%)</li>
                    <li>银行坏账拨备 (大行财报验证)</li>
                    <li>CRE逾期率 (&gt;8% 战略红线)</li>
                  </ul>
                </div>

                <div style={{ borderLeft: '4px solid var(--system-purple)', padding: '16px', background: 'rgba(175, 82, 222, 0.05)', borderRadius: '0 var(--radius-md) var(--radius-md) 0' }}>
                  <h4 style={{ fontWeight: '800', color: 'var(--system-purple)', marginBottom: '12px', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Skull size={16} /> 终极信号 (衰退确认)
                  </h4>
                  <ul style={{ fontSize: '0.85rem', margin: 0, paddingLeft: '18px', color: 'var(--text-secondary)', lineHeight: '1.8', fontWeight: '500' }}>
                    <li>Sahm Rule 触发 (失业率 3MMA)</li>
                    <li>HY-IG 利差 (&gt;500bp 溢价)</li>
                    <li>美联储紧急工具扩表启动</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* 未来时间表 */}
            <div className="card" style={{ padding: '24px', background: 'var(--bg-card)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)' }}>
              <h2 style={{ fontSize: '1.35rem', fontWeight: '800', marginBottom: '24px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '12px', borderBottom: '1px solid var(--system-gray5)', paddingBottom: '12px' }}>
                <Calendar size={24} style={{ color: 'var(--system-blue)' }} /> 危机演进倒计时 - 未来时间轴
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {macroRiskTimeline.map((item, idx) => (
                  <div key={idx} style={{
                    borderLeft: '4px solid var(--system-blue)',
                    padding: '16px',
                    background: 'var(--system-gray6)',
                    borderRadius: '0 var(--radius-md) var(--radius-md) 0',
                    border: '1px solid var(--system-gray5)',
                    borderLeftWidth: '4px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '1.1rem', fontWeight: '900', color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>{item.period}</span>
                        <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--system-gray4)' }} />
                        <span style={{ fontWeight: '800', color: 'var(--system-blue)', fontSize: '0.95rem' }}>{item.phase}</span>
                      </div>
                      <StatusBadge text={`PROBABILITY: ${item.probability}%`} type={item.probability > 70 ? 'red' : item.probability > 40 ? 'orange' : 'blue'} />
                    </div>

                    <div style={{ marginBottom: '16px' }}>
                      <p style={{ fontSize: '0.85rem', fontWeight: '800', color: 'var(--text-secondary)', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Zap size={14} /> 关键验证信号
                      </p>
                      <ul style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0, paddingLeft: '18px', lineHeight: '1.8', fontWeight: '500' }}>
                        {item.keySignals.map((signal, i) => (
                          <li key={i}>{signal}</li>
                        ))}
                      </ul>
                    </div>

                    <div style={{
                      background: 'linear-gradient(90deg, var(--system-green-light) 0%, transparent 100%)',
                      borderLeft: '3px solid var(--system-green)',
                      padding: '12px 16px',
                      borderRadius: '0 var(--radius-sm) var(--radius-sm) 0'
                    }}>
                      <p style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Info size={16} style={{ color: 'var(--system-green)' }} />
                        <span style={{ color: 'var(--system-green)', fontWeight: '800' }}>核心投资策略:</span> {item.investment}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 使用说明 */}
            <div className="card" style={{
              background: 'linear-gradient(135deg, rgba(0, 122, 255, 0.05) 0%, rgba(10, 132, 255, 0.05) 100%)',
              padding: '24px',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--system-blue-light)',
              boxShadow: 'inset 0 0 20px rgba(0, 122, 255, 0.02)'
            }}>
              <h3 style={{ fontWeight: '800', color: 'var(--system-blue)', marginBottom: '20px', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Info size={20} /> 📖 仪表盘联动作战系统说明
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
                <div>
                  <p style={{ fontWeight: '800', marginBottom: '12px', color: 'var(--text-primary)', fontSize: '0.9rem' }}>三分数据源交叉验证逻辑:</p>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.8' }}>
                    <li><strong style={{ color: 'var(--text-primary)' }}>官方数据 (Official)</strong>: 权威、全覆盖，但通常滞后 1-3 个月，且在政治敏感期存在修饰。</li>
                    <li><strong style={{ color: 'var(--text-primary)' }}>市场数据 (Market)</strong>: 反应极速、具备前瞻性，但容易产生情绪化过度反应，需基本面验证。</li>
                    <li><strong style={{ color: 'var(--text-primary)' }}>替代数据 (Alternative)</strong>: 颗粒度细、无修饰，能反应真实体感趋势，是危机识别的最核心依据。</li>
                  </ul>
                </div>
                <div>
                  <p style={{ fontWeight: '800', marginBottom: '12px', color: 'var(--text-primary)', fontSize: '0.9rem' }}>实战协同判断规则:</p>
                  <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.8' }}>
                    <li style={{ marginBottom: '8px' }}><StatusBadge text="CRITICAL" type="red" /> <strong style={{ color: 'var(--text-primary)' }}>三线耦合</strong>: 三条线同步恶化 (≥7分) → 危机进入不可逆阶段。</li>
                    <li style={{ marginBottom: '8px' }}><StatusBadge text="WARNING" type="orange" /> <strong style={{ color: 'var(--text-primary)' }}>背离预警</strong>: 市场/替代恶化而官方平稳 → 处于"数据掩盖期"。</li>
                    <li><StatusBadge text="INFO" type="blue" /> <strong style={{ color: 'var(--text-primary)' }}>虚假信号</strong>: 仅市场恶化而替代数据支撑 → 属于非理性恐慌，可能是买入机会。</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Footer */}
      <div style={{
        background: 'var(--system-gray6)',
        borderTop: '1px solid var(--system-gray5)',
        padding: '32px 16px',
        borderRadius: '0 0 var(--radius-lg) var(--radius-lg)',
        marginTop: '32px'
      }}>
        <div style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-tertiary)' }}>
          <p style={{ fontWeight: '800', marginBottom: '20px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', justifySelf: 'center', gap: '8px' }}>
            <Briefcase size={18} /> 核心投资纪律
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
            maxWidth: '1000px',
            margin: '0 auto'
          }}>
            <div style={{ background: 'white', padding: '16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--system-gray5)', color: 'var(--text-secondary)' }}>
              现金不是垃圾，是等待的成本
            </div>
            <div style={{ background: 'white', padding: '16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--system-gray5)', color: 'var(--text-secondary)' }}>
              做空需要耐心，抄底需要勇气
            </div>
            <div style={{ background: 'white', padding: '16px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--system-gray5)', color: 'var(--text-secondary)' }}>
              宁可错过，不要做错
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvestmentPlan2026;
