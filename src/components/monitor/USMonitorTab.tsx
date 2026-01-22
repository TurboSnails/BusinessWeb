import React from 'react'
import {
  TrendingDown,
  Search,
  Lightbulb,
  BarChart2,
  AlertTriangle,
  Pin,
  Calendar,
  Target,
  FileText,
  AlertCircle,
  TrendingUp,
  Activity,
  Shield,
  Zap,
  Cpu,
  ArrowRight,
  Info
} from 'lucide-react';
import {
  tableWrapperStyle,
  tableStyle,
  thStyle,
  tdStyle,
  getTrStyle,
  contentStyle
} from '../TableStyles';

const StatusBadge: React.FC<{ type: 'red' | 'orange' | 'green', text: string }> = ({ type, text }) => {
  const styles = {
    red: { bg: 'rgba(255, 59, 48, 0.1)', color: 'var(--system-red)', glow: 'var(--system-red)' },
    orange: { bg: 'rgba(255, 149, 0, 0.1)', color: 'var(--system-orange)', glow: 'var(--system-orange)' },
    green: { bg: 'rgba(34, 199, 89, 0.1)', color: 'var(--system-green)', glow: 'var(--system-green)' }
  }
  const current = styles[type]
  return (
    <div style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '4px 10px',
      borderRadius: '8px',
      background: current.bg,
      color: current.color,
      fontWeight: '600',
      fontSize: '0.75rem'
    }}>
      <div style={{
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: current.color,
        boxShadow: `0 0 6px ${current.glow}`
      }} />
      {text}
    </div>
  )
}

export const USMonitorTab: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* 三色预警仪表盘 */}
      <div style={{
        background: 'var(--bg-card)',
        backdropFilter: 'var(--glass-blur)',
        border: '1px solid var(--border-light)',
        borderRadius: '24px',
        padding: '32px',
        boxShadow: 'var(--shadow-subtle)'
      }}>
        <h2 style={{
          fontSize: '1.5rem',
          fontWeight: '700',
          marginBottom: '12px',
          color: 'var(--text-primary)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'var(--system-red-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--system-red)',
            border: '1px solid rgba(255, 59, 48, 0.2)'
          }}>
            <TrendingDown size={28} />
          </div>
          2026年美国经济衰退风险仪表盘
        </h2>
        <p style={{ fontSize: '0.95rem', color: 'var(--text-secondary)', marginBottom: '8px', lineHeight: '1.6' }}>
          核心逻辑：<strong>不看预测，只看事实。</strong> 数据驱动，基于最新官方数据（截至2025年12月28日）。
        </p>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', marginBottom: '32px', lineHeight: '1.6' }}>
          每月第一个周五（非农数据公布日）更新一次。
        </p>

        {/* 核心监测指标总览 */}
        <div style={tableWrapperStyle}>
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: 'var(--system-gray6)' }}>
                <th style={{ ...thStyle, fontSize: '0.8rem', fontWeight: '700', background: 'var(--system-gray6)', color: 'var(--text-secondary)' }}>维度</th>
                <th style={{ ...thStyle, fontSize: '0.8rem', fontWeight: '700', background: 'var(--system-gray6)', color: 'var(--text-secondary)' }}>核心指标</th>
                <th style={{ ...thStyle, textAlign: 'center', color: 'var(--system-green)', fontSize: '0.8rem', fontWeight: '700', background: 'var(--system-gray6)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--system-green)', boxShadow: '0 0 8px var(--system-green)' }} />
                    绿灯
                  </div>
                </th>
                <th style={{ ...thStyle, textAlign: 'center', color: 'var(--system-orange)', fontSize: '0.8rem', fontWeight: '700', background: 'var(--system-gray6)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--system-orange)', boxShadow: '0 0 8px var(--system-orange)' }} />
                    黄灯
                  </div>
                </th>
                <th style={{ ...thStyle, textAlign: 'center', color: 'var(--system-red)', fontSize: '0.8rem', fontWeight: '700', background: 'var(--system-gray6)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--system-red)', boxShadow: '0 0 8px var(--system-red)' }} />
                    红灯
                  </div>
                </th>
                <th style={{ ...thStyle, textAlign: 'center', fontSize: '0.8rem', fontWeight: '700', background: 'var(--system-gray6)', color: 'var(--text-secondary)' }}>当前状态</th>
                <th style={{ ...thStyle, fontSize: '0.8rem', fontWeight: '700', background: 'var(--system-gray6)', color: 'var(--text-secondary)' }}>数据来源</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ background: 'transparent' }}>
                <td rowSpan={4} style={{ ...tdStyle, fontWeight: '600', verticalAlign: 'top' }}>劳动力</td>
                <td style={tdStyle}>失业率 vs 12月低点</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--system-green)', fontSize: '0.75rem' }}>&lt; +0.3%</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--system-orange)', fontSize: '0.75rem' }}>+0.3%-0.5%</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--system-red)', fontWeight: '600', fontSize: '0.75rem' }}>&gt; +0.5%</td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  <StatusBadge type="red" text="+0.5%" />
                </td>
                <td style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: '0.75rem' }}>BLS 11月终值</td>
              </tr>
              <tr style={{ background: 'rgba(0,0,0,0.01)' }}>
                <td style={tdStyle}>萨姆规则指标</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--system-green)', fontSize: '0.75rem' }}>&lt; 0.30</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--system-orange)', fontWeight: '600', fontSize: '0.75rem' }}>0.30-0.49</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--system-red)', fontWeight: '600', fontSize: '0.75rem' }}>≥ 0.50</td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  <StatusBadge type="orange" text="0.43" />
                </td>
                <td style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: '0.75rem' }}>FRED实时更新</td>
              </tr>
              <tr style={{ background: 'transparent' }}>
                <td style={tdStyle}>青年失业率(16-19岁)</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--system-green)', fontSize: '0.75rem' }}>&lt; 12%</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--system-orange)', fontSize: '0.75rem' }}>12%-15%</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--system-red)', fontWeight: '600', fontSize: '0.75rem' }}>&gt; 15%</td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  <StatusBadge type="red" text="16.3%" />
                </td>
                <td style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: '0.75rem' }}>BLS 11月分项</td>
              </tr>
              <tr style={{ background: 'rgba(0,0,0,0.01)' }}>
                <td style={tdStyle}>黑人失业率</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--system-green)', fontSize: '0.75rem' }}>&lt; 6%</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--system-orange)', fontSize: '0.75rem' }}>6%-8%</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--system-red)', fontWeight: '600', fontSize: '0.75rem' }}>&gt; 8%</td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  <StatusBadge type="red" text="8.3%" />
                </td>
                <td style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: '0.75rem' }}>BLS 11月分项</td>
              </tr>
              <tr style={{ background: 'transparent' }}>
                <td style={{ ...tdStyle, fontWeight: '600' }}>流动性</td>
                <td style={tdStyle}>10Y-2Y美债利差</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--system-green)', fontSize: '0.75rem' }}>&gt; +50bp</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--system-orange)', fontWeight: '600', fontSize: '0.75rem' }}>0至+50bp</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--system-red)', fontWeight: '600', fontSize: '0.75rem' }}>负值倒挂</td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  <StatusBadge type="orange" text="+12bp" />
                </td>
                <td style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: '0.75rem' }}>纽约联储</td>
              </tr>
              <tr style={{ background: 'rgba(0,0,0,0.01)' }}>
                <td style={{ ...tdStyle, fontWeight: '600' }}>生产力</td>
                <td style={tdStyle}>ISM制造业PMI</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--system-green)', fontSize: '0.75rem' }}>&gt; 50</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--system-orange)', fontWeight: '600', fontSize: '0.75rem' }}>48-50 (单月)</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--system-red)', fontWeight: '600', fontSize: '0.75rem' }}>&lt; 48 (连续3月)</td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  <StatusBadge type="orange" text="48.2" />
                </td>
                <td style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: '0.75rem' }}>ISM官方报告</td>
              </tr>
              <tr style={{ background: 'transparent' }}>
                <td style={{ ...tdStyle, fontWeight: '600' }}>杠杆率</td>
                <td style={tdStyle}>融资余额同比</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--system-green)', fontSize: '0.75rem' }}>&lt; +15%</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--system-orange)', fontSize: '0.75rem' }}>+15%-30%</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--system-red)', fontWeight: '600', fontSize: '0.75rem' }}>&gt; +35%</td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  <StatusBadge type="red" text="+38.5%" />
                </td>
                <td style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: '0.75rem' }}>FINRA 11月数据</td>
              </tr>
              <tr style={{ background: 'rgba(0,0,0,0.01)' }}>
                <td rowSpan={2} style={{ ...tdStyle, fontWeight: '600', verticalAlign: 'top' }}>情绪面</td>
                <td style={tdStyle}>VIX月均</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--system-green)', fontWeight: '600', fontSize: '0.75rem' }}>&lt; 18</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--system-orange)', fontSize: '0.75rem' }}>18-25</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--system-red)', fontWeight: '600', fontSize: '0.75rem' }}>&gt; 25</td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  <StatusBadge type="green" text="14.2" />
                </td>
                <td style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: '0.75rem' }}>CBOE</td>
              </tr>
              <tr style={{ background: 'transparent' }}>
                <td style={tdStyle}>消费者信心预期</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--system-green)', fontSize: '0.75rem' }}>&gt; 80</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--system-orange)', fontSize: '0.75rem' }}>70-80</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--system-red)', fontWeight: '600', fontSize: '0.75rem' }}>&lt; 70 (连续3月)</td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  <StatusBadge type="red" text="70.7" />
                </td>
                <td style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: '0.75rem' }}>美国谘商会12月</td>
              </tr>
              <tr style={{ background: 'rgba(0,0,0,0.01)' }}>
                <td rowSpan={3} style={{ ...tdStyle, fontWeight: '600', verticalAlign: 'top' }}>信用面</td>
                <td style={tdStyle}>商业地产(CRE)逾期率</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--system-green)', fontSize: '0.75rem' }}>&lt; 3%</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--system-orange)', fontSize: '0.75rem' }}>3%-5%</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--system-red)', fontWeight: '600', fontSize: '0.75rem' }}>&gt; 5%</td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  <StatusBadge type="red" text="6.1%" />
                </td>
                <td style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: '0.75rem' }}>MBA 12月快照</td>
              </tr>
              <tr style={{ background: 'transparent' }}>
                <td style={tdStyle}>高收益债利差</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--system-green)', fontWeight: '600', fontSize: '0.75rem' }}>&lt; 400bp</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--system-orange)', fontSize: '0.75rem' }}>400-600bp</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--system-red)', fontWeight: '600', fontSize: '0.75rem' }}>&gt; 600bp</td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  <StatusBadge type="green" text="284bp" />
                </td>
                <td style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: '0.75rem' }}>ICE BofA指数</td>
              </tr>
              <tr style={{ background: 'rgba(0,0,0,0.01)' }}>
                <td style={tdStyle}>企业违约率</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--system-green)', fontWeight: '600', fontSize: '0.75rem' }}>&lt; 2%</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--system-orange)', fontSize: '0.75rem' }}>2%-4%</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--system-red)', fontWeight: '600', fontSize: '0.75rem' }}>&gt; 4%</td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  <StatusBadge type="green" text="2.8%" />
                </td>
                <td style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: '0.75rem' }}>标普全球</td>
              </tr>
              <tr style={{ background: 'transparent' }}>
                <td rowSpan={2} style={{ ...tdStyle, fontWeight: '600', verticalAlign: 'top' }}>科技投资</td>
                <td style={tdStyle}>AI资本支出增速</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--system-green)', fontSize: '0.75rem' }}>&gt; +30%</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--system-orange)', fontWeight: '600', fontSize: '0.75rem' }}>+10%-30%</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--system-red)', fontWeight: '600', fontSize: '0.75rem' }}>&lt; +10%</td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  <StatusBadge type="orange" text="+25%" />
                </td>
                <td style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: '0.75rem' }}>高盛12月模型</td>
              </tr>
              <tr style={{ background: 'rgba(0,0,0,0.01)' }}>
                <td style={tdStyle}>科技行业就业</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--system-green)', fontSize: '0.75rem' }}>正增长</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--system-orange)', fontSize: '0.75rem' }}>持平(±2k)</td>
                <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--system-red)', fontWeight: '600', fontSize: '0.75rem' }}>负增长(&lt;-2k)</td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  <StatusBadge type="red" text="-4,000" />
                </td>
                <td style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: '0.75rem' }}>BLS NAICS 54</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* 数据校验备注 */}
        <div style={{
          background: 'var(--system-gray6)',
          padding: '24px',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--system-gray5)',
          fontSize: '0.9rem',
          color: 'var(--text-secondary)',
          lineHeight: '1.6',
          marginTop: '24px'
        }}>
          <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '8px' }}>数据校验备注：</strong>
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            <li>萨姆规则：采用美联储官方公式（3个月移动平均失业率 vs 12个月低点），0.43未达红灯阈值。</li>
            <li>CRE逾期率：德勤12月报告显示写字楼板块达6.3%，综合MBA数据取中值6.1%。</li>
            <li>青年失业率：包含兼职学生，BLS定义严格，16.3%为2020年后最高。</li>
          </ul>
        </div>
      </div>

      {/* 综合风险评分系统 */}
      <div style={{
        background: 'var(--bg-card)',
        backdropFilter: 'var(--glass-blur)',
        border: '1px solid var(--border-light)',
        borderRadius: '24px',
        padding: '32px',
        boxShadow: 'var(--shadow-subtle)'
      }}>
        <h3 style={{
          fontSize: '1.25rem',
          fontWeight: '700',
          marginBottom: '20px',
          color: 'var(--text-primary)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{ color: 'var(--system-orange)' }}>
            <Target size={24} />
          </div>
          综合风险评分系统
        </h3>
        <div style={{
          background: 'var(--system-gray6)',
          padding: '24px',
          borderRadius: 'var(--radius-md)',
          marginBottom: '24px',
          border: '1px solid var(--system-gray5)'
        }}>
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontWeight: '600', marginBottom: '12px', color: 'var(--text-primary)' }}>风险状态统计：</div>
            <ul style={{ margin: 0, paddingLeft: '20px', lineHeight: '2.2', fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
              <li><StatusBadge type="red" text="红灯指标" />: 7个（劳动力×3、杠杆率、消费者信心、CRE逾期率、科技就业）</li>
              <li><StatusBadge type="orange" text="黄灯指标" />: 4个（萨姆规则、利差、PMI、AI增速）</li>
              <li><StatusBadge type="green" text="绿灯指标" />: 3个（VIX、高收益利差、违约率）</li>
            </ul>
          </div>
          <div style={{
            background: 'rgba(255, 59, 48, 0.05)',
            padding: '20px',
            borderRadius: '12px',
            border: '1px solid rgba(255, 59, 48, 0.1)'
          }}>
            <div style={{ fontWeight: '700', marginBottom: '8px', color: 'var(--system-red)', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={20} />
              高风险区间（红灯≥5 且 黄灯≥3）
            </div>
            <div style={{ fontSize: '1rem', lineHeight: '1.8', color: 'var(--text-primary)' }}>
              → <strong>2026年衰退概率：40±3%</strong>（95%置信区间）
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', marginTop: '12px', fontStyle: 'italic' }}>
              *模型依据：主成分分析（PCA）整合14项指标，权重基于历史衰退预测效力。
            </div>
          </div>
        </div>
      </div>

      {/* 三大核心风险验证 */}
      <div style={{
        background: 'rgba(255, 59, 48, 0.05)',
        border: '1px solid rgba(255, 59, 48, 0.1)',
        borderRadius: '24px',
        padding: '32px'
      }}>
        <h3 style={{
          fontSize: '1.25rem',
          fontWeight: '700',
          marginBottom: '20px',
          color: 'var(--system-red)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{ color: 'var(--system-red)' }}>
            <Search size={24} />
          </div>
          三大核心风险验证
        </h3>
        <div style={tableWrapperStyle}>
          <table style={tableStyle}>
            <thead>
              <tr style={{ background: 'rgba(255, 59, 48, 0.1)' }}>
                <th style={thStyle}>导火索</th>
                <th style={thStyle}>当前验证状态</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>触发概率</th>
                <th style={thStyle}>关键观察窗口</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ background: 'transparent' }}>
                <td style={{ ...tdStyle, fontWeight: '600' }}>萨姆规则突破</td>
                <td style={tdStyle}>失业率4.6% + 萨姆值0.43 → 1月数据需新增17万失业人口即触发红灯</td>
                <td style={{ ...tdStyle, textAlign: 'center', fontWeight: '600', color: 'var(--system-red)' }}>35%</td>
                <td style={tdStyle}>2026年1月10日非农</td>
              </tr>
              <tr style={{ background: 'rgba(0,0,0,0.01)' }}>
                <td style={{ ...tdStyle, fontWeight: '600' }}>CRE信用链断裂</td>
                <td style={tdStyle}>逾期率6.1% &gt; 阈值5%；2026年Q1到期债务$5200亿</td>
                <td style={{ ...tdStyle, textAlign: 'center', fontWeight: '600', color: 'var(--system-red)' }}>18%</td>
                <td style={tdStyle}>2026年3月MBA季度报告</td>
              </tr>
              <tr style={{ background: 'transparent' }}>
                <td style={{ ...tdStyle, fontWeight: '600' }}>AI投资骤降</td>
                <td style={tdStyle}>资本支出$4000亿（+25%），但2026年增速降至15%</td>
                <td style={{ ...tdStyle, textAlign: 'center', fontWeight: '600', color: 'var(--system-red)' }}>12%</td>
                <td style={tdStyle}>2026年2月科技财报季</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{
          background: 'var(--system-gray6)',
          padding: '20px',
          borderRadius: '16px',
          marginTop: '20px',
          border: '1px solid var(--border-light)',
          fontSize: '0.85rem',
          color: 'var(--text-secondary)',
          lineHeight: '1.6'
        }}>
          <strong style={{ color: 'var(--text-primary)', display: 'block', marginBottom: '8px' }}>概率校准方法：</strong>
          <ul style={{ margin: 0, paddingLeft: '20px' }}>
            <li>萨姆规则：自1960年，0.43→0.50的历史转化率35%。</li>
            <li>CRE风险：逾期率&gt;6%后12个月内引发危机的概率。</li>
            <li>AI投资：放缓非崩溃，企业现金流覆盖率保持稳健。</li>
          </ul>
        </div>
      </div>

      {/* 经济阶段诊断 */}
      <div style={{
        background: 'rgba(52, 199, 89, 0.05)',
        border: '1px solid rgba(52, 199, 89, 0.1)',
        borderRadius: '24px',
        padding: '32px'
      }}>
        <h3 style={{
          fontSize: '1.25rem',
          fontWeight: '700',
          marginBottom: '20px',
          color: 'var(--system-green)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{ color: 'var(--system-green)' }}>
            <Activity size={24} />
          </div>
          经济阶段诊断
        </h3>
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontWeight: '700', marginBottom: '12px', color: 'var(--system-green)', fontSize: '1.1rem' }}>
            1️⃣ 当前状态：“非对称脆弱性”晚期
          </div>
          <div style={{
            background: 'var(--bg-card)',
            padding: '20px',
            borderRadius: '16px',
            marginBottom: '16px',
            border: '1px solid var(--border-light)'
          }}>
            <div style={{ fontWeight: '600', marginBottom: '8px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Shield size={18} style={{ color: 'var(--system-green)' }} />
              未衰退但裂缝扩大：
            </div>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.95rem', lineHeight: '1.8', color: 'var(--text-secondary)' }}>
              <li>GDP Nowcast（亚特兰大联储）：2025Q4 +1.2% → 2026Q1 +0.8%</li>
              <li>企业盈利：标普500 EPS增长放缓，科技巨头贡献大部分增量</li>
            </ul>
          </div>
          <div style={{
            background: 'var(--bg-card)',
            padding: '20px',
            borderRadius: '16px',
            border: '1px solid var(--border-light)'
          }}>
            <div style={{ fontWeight: '600', marginBottom: '12px', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={18} style={{ color: 'var(--system-orange)' }} />
              脆弱性分布：
            </div>
            <div style={tableWrapperStyle}>
              <table style={tableStyle}>
                <thead>
                  <tr style={{ background: 'var(--system-gray6)' }}>
                    <th style={thStyle}>领域</th>
                    <th style={{ ...thStyle, textAlign: 'center' }}>健康度</th>
                    <th style={thStyle}>依据</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ background: 'transparent' }}>
                    <td style={tdStyle}>头部科技/金融</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <StatusBadge type="green" text="健康" />
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>现金储备充足</td>
                  </tr>
                  <tr style={{ background: 'rgba(0,0,0,0.01)' }}>
                    <td style={tdStyle}>中小企业</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <StatusBadge type="red" text="预警" />
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>信用紧缩指数处于高位</td>
                  </tr>
                  <tr style={{ background: 'transparent' }}>
                    <td style={tdStyle}>底层劳动力</td>
                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                      <StatusBadge type="red" text="预警" />
                    </td>
                    <td style={{ ...tdStyle, color: 'var(--text-secondary)', fontSize: '0.8rem' }}>分项失业率持续恶化</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-tertiary)', marginTop: '12px', fontStyle: 'italic' }}>
            📉 历史类比：2000-2001年科网泡沫后期，非2008年系统性危机。
          </div>
        </div>
        <div>
          <div style={{ fontWeight: '700', marginBottom: '8px', color: '#166534', fontSize: '1rem' }}>
            2️⃣ 2026年衰退基准情景
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#f0fdf4' }}>
                  <th style={{ padding: '10px', textAlign: 'left', fontWeight: '600', color: '#1f2937', border: '1px solid #86efac' }}>维度</th>
                  <th style={{ padding: '10px', textAlign: 'left', fontWeight: '600', color: '#1f2937', border: '1px solid #86efac' }}>判断依据</th>
                  <th style={{ padding: '10px', textAlign: 'center', fontWeight: '600', color: '#1f2937', border: '1px solid #86efac' }}>概率</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb' }}>衰退概率</td>
                  <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.85rem' }}>综合指标+ECRI领先指数&lt;-2.5标准差</td>
                  <td style={{ padding: '10px', textAlign: 'center', fontWeight: '600', color: '#dc2626', border: '1px solid #e5e7eb' }}>40%</td>
                </tr>
                <tr>
                  <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb' }}>触发时点</td>
                  <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.85rem' }}>萨姆规则若1月触发，传导至消费需2-3个月 → 2026年4-5月</td>
                  <td style={{ padding: '10px', textAlign: 'center', fontWeight: '600', color: '#dc2626', border: '1px solid #e5e7eb' }}>65%</td>
                </tr>
                <tr>
                  <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb' }}>深度</td>
                  <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.85rem' }}>温和衰退：GDP峰值-谷底-2.1%，失业率峰值6.5%（vs 2009年10%）</td>
                  <td style={{ padding: '10px', textAlign: 'center', fontWeight: '600', color: '#dc2626', border: '1px solid #e5e7eb' }}>70%</td>
                </tr>
                <tr>
                  <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb' }}>最大风险</td>
                  <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.85rem' }}>劳动力-信用负反馈循环（失业→消费降→企业违约→信贷收缩）</td>
                  <td style={{ padding: '10px', textAlign: 'center', fontWeight: '600', color: '#dc2626', border: '1px solid #e5e7eb' }}>优先级1</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 社会脆弱性焦点 */}
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
          color: 'var(--system-red)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{ color: 'var(--system-red)' }}>
            <AlertCircle size={24} />
          </div>
          社会脆弱性焦点（BLS 11月数据）
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#fee2e2', borderBottom: '2px solid #dc2626' }}>
                <th style={{ padding: '10px', textAlign: 'left', fontWeight: '700', color: '#1f2937', border: '1px solid #e5e7eb' }}>人群</th>
                <th style={{ padding: '10px', textAlign: 'center', fontWeight: '700', color: '#1f2937', border: '1px solid #e5e7eb' }}>当前失业率</th>
                <th style={{ padding: '10px', textAlign: 'center', fontWeight: '700', color: '#1f2937', border: '1px solid #e5e7eb' }}>2019基准</th>
                <th style={{ padding: '10px', textAlign: 'center', fontWeight: '700', color: '#1f2937', border: '1px solid #e5e7eb' }}>距衰退临界点</th>
                <th style={{ padding: '10px', textAlign: 'center', fontWeight: '700', color: '#1f2937', border: '1px solid #e5e7eb' }}>风险等级</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ background: '#fff' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb' }}>16-19岁青年</td>
                <td style={{ padding: '10px', textAlign: 'center', color: '#374151', border: '1px solid #e5e7eb' }}>16.3%</td>
                <td style={{ padding: '10px', textAlign: 'center', color: '#374151', border: '1px solid #e5e7eb' }}>13.2%</td>
                <td style={{ padding: '10px', textAlign: 'center', color: '#374151', border: '1px solid #e5e7eb' }}>2.2个百分点</td>
                <td style={{ padding: '10px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                  <StatusBadge type="red" text="极高" />
                </td>
              </tr>
              <tr style={{ background: '#fff' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb' }}>黑人劳动者</td>
                <td style={{ padding: '10px', textAlign: 'center', color: '#374151', border: '1px solid #e5e7eb' }}>8.3%</td>
                <td style={{ padding: '10px', textAlign: 'center', color: '#374151', border: '1px solid #e5e7eb' }}>6.1%</td>
                <td style={{ padding: '10px', textAlign: 'center', color: '#374151', border: '1px solid #e5e7eb' }}>0.3个百分点</td>
                <td style={{ padding: '10px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                  <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#fee2e2', color: '#dc2626', fontWeight: '600', fontSize: '0.75rem' }}>🔴 极高</span>
                </td>
              </tr>
              <tr style={{ background: '#fff' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb' }}>黑人青年</td>
                <td style={{ padding: '10px', textAlign: 'center', color: '#374151', border: '1px solid #e5e7eb' }}>20.8%</td>
                <td style={{ padding: '10px', textAlign: 'center', color: '#374151', border: '1px solid #e5e7eb' }}>16.8%</td>
                <td style={{ padding: '10px', textAlign: 'center', color: '#374151', border: '1px solid #e5e7eb' }}>1.2个百分点</td>
                <td style={{ padding: '10px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                  <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#fee2e2', color: '#dc2626', fontWeight: '600', fontSize: '0.75rem' }}>🔴 极高</span>
                </td>
              </tr>
              <tr style={{ background: '#fff' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb' }}>服务业工人</td>
                <td style={{ padding: '10px', textAlign: 'center', color: '#374151', border: '1px solid #e5e7eb' }}>5.1%</td>
                <td style={{ padding: '10px', textAlign: 'center', color: '#374151', border: '1px solid #e5e7eb' }}>3.9%</td>
                <td style={{ padding: '10px', textAlign: 'center', color: '#374151', border: '1px solid #e5e7eb' }}>2.0个百分点</td>
                <td style={{ padding: '10px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                  <StatusBadge type="orange" text="高" />
                </td>
              </tr>
              <tr style={{ background: '#f9fafb' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', fontStyle: 'italic' }}>全美平均</td>
                <td style={{ padding: '10px', textAlign: 'center', color: '#374151', border: '1px solid #e5e7eb', fontStyle: 'italic' }}>4.6%</td>
                <td style={{ padding: '10px', textAlign: 'center', color: '#374151', border: '1px solid #e5e7eb', fontStyle: 'italic' }}>3.7%</td>
                <td style={{ padding: '10px', textAlign: 'center', color: '#374151', border: '1px solid #e5e7eb', fontStyle: 'italic' }}>N/A</td>
                <td style={{ padding: '10px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                  <StatusBadge type="orange" text="中高" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{
          background: 'var(--bg-card)',
          padding: '16px',
          borderRadius: '12px',
          marginTop: '12px',
          border: '1px solid var(--system-red)',
          fontSize: '0.85rem',
          color: 'var(--text-primary)',
          display: 'flex',
          gap: '10px',
          alignItems: 'start'
        }}>
          <AlertTriangle size={18} style={{ color: 'var(--system-red)', flexShrink: 0 }} />
          <div>
            <strong>预警：</strong>若衰退触发，青年失业率将达22-25%（接近2009年峰值），需监控1月就业报告中兼职/临时工比例。
          </div>
        </div>
      </div>

      {/* 2026年关键时间线与做空条件 */}
      <div style={{
        background: '#eff6ff',
        border: '1px solid #bfdbfe',
        borderRadius: '12px',
        padding: '20px'
      }}>
        <h3 style={{
          fontSize: '1.25rem',
          fontWeight: '700',
          marginBottom: '12px',
          color: 'var(--system-blue)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{ color: 'var(--system-blue)' }}>
            <Calendar size={24} />
          </div>
          2026年关键时间线与做空条件
        </h3>
        <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '16px', lineHeight: '1.6' }}>
          基于BLS、Fed、Yahoo Finance财报日历和CRE报告。重点事件包括失业报告、Fed会议、科技财报和CRE到期高峰。做空条件基于指标阈值，可通过反向ETF（如PSQ -1x或SQQQ -3x）实现，但杠杆产品仅限短期，风险包括复合效应和市场反弹。
        </p>
        <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ background: '#dbeafe', borderBottom: '2px solid #3b82f6' }}>
                <th style={{ padding: '10px', textAlign: 'left', fontWeight: '700', color: '#1f2937', border: '1px solid #bfdbfe', fontSize: '0.75rem', whiteSpace: 'nowrap' }}>日期</th>
                <th style={{ padding: '10px', textAlign: 'left', fontWeight: '700', color: '#1f2937', border: '1px solid #bfdbfe', fontSize: '0.75rem' }}>事件</th>
                <th style={{ padding: '10px', textAlign: 'left', fontWeight: '700', color: '#dc2626', border: '1px solid #bfdbfe', fontSize: '0.75rem' }}>做空条件（潜在触发器）</th>
                <th style={{ padding: '10px', textAlign: 'left', fontWeight: '700', color: '#1f2937', border: '1px solid #bfdbfe', fontSize: '0.75rem' }}>注意事项/参考</th>
              </tr>
            </thead>
            <tbody>
              {/* 1月 */}
              <tr style={{ background: '#fff' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-01-02</td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ISM制造业PMI（12月2025）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>PMI&lt;48（连续3月），预示制造业收缩</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>领先指标；若与服务业PMI同时&lt;50，衰退风险上升</td>
              </tr>
              <tr style={{ background: '#fff' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-01-03</td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ISM服务业PMI（12月2025）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>服务业PMI&lt;50，叠加制造业收缩，确认经济放缓</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>关键指标；服务业占GDP约80%</td>
              </tr>
              <tr style={{ background: '#fff' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-01-07</td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>JOLTS及州就业数据（11月2025）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>职位空缺率&lt;5%或流动率上升，预示劳动力市场疲软</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>领先失业率指标；若与消费者信心&lt;80叠加，可推动纳斯达克广度&lt;30%</td>
              </tr>
              <tr style={{ background: '#fffbeb' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-01-08<br /><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>21:30</span></td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ADP就业数据（12月2025）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ADP新增就业&lt;15万，预示非农数据疲软</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>非农数据前导指标；通常比非农早2天发布</td>
              </tr>
              <tr style={{ background: '#fef3c7', borderLeft: '4px solid #f59e0b' }}>
                <td style={{ padding: '10px', fontWeight: '700', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-01-09<br /><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>21:30</span></td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem', fontWeight: '600' }}>就业情况报告（2025年12月）</td>
                <td style={{ padding: '10px', color: '#dc2626', fontWeight: '600', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>失业率≥4.7%或过去6个月+0.6ppt，萨姆规则正式触发</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>关键观察窗口；若触发，衰退概率升至70%，先影响科技就业（IT部门已负）</td>
              </tr>
              <tr style={{ background: '#fff' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-01-27</td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>州就业与职位空缺数据（12月2025）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>州级数据显示区域衰退（如CRE重镇），可能扩散信用风险</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>补充全国数据；关注办公LTV&gt;80%的地区</td>
              </tr>
              <tr style={{ background: '#f3f4f6' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-01-27/28</td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>FOMC会议</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>Fed暗示紧缩或无进一步降息，利差扩200bp，触发CRE违约</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>无经济预测；关注利率决策对科技融资影响</td>
              </tr>
              <tr style={{ background: '#e9d5ff', borderLeft: '4px solid #9333ea' }}>
                <td style={{ padding: '10px', fontWeight: '700', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-01-28</td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem', fontWeight: '600' }}>微软（MSFT）财报（Q2 2026财季）</td>
                <td style={{ padding: '10px', color: '#dc2626', fontWeight: '600', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>AI Capex指引下修&gt;10%，或回报率&lt;8%，预示投资疲劳</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>关注服务器/云预算；若与NVDA叠加，纳斯达克可能下跌10-15%</td>
              </tr>
              {/* 2月 */}
              <tr style={{ background: '#fff' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-02-02</td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ISM制造业PMI（1月2026）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>PMI&lt;48（连续3月），确认制造业收缩</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>月度更新；关注新订单和就业分项</td>
              </tr>
              <tr style={{ background: '#fff' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-02-03</td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ISM服务业PMI（1月2026）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>服务业PMI&lt;50，叠加制造业收缩，确认经济放缓</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>关键指标；服务业占GDP约80%</td>
              </tr>
              <tr style={{ background: '#fffbeb' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-02-05<br /><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>21:30</span></td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ADP就业数据（1月2026）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ADP新增就业&lt;15万，预示非农数据疲软</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>非农数据前导指标；通常比非农早2天发布</td>
              </tr>
              <tr style={{ background: '#fef2f2' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-02-07<br /><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>21:30</span></td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>就业情况报告（2026年1月）</td>
                <td style={{ padding: '10px', color: '#dc2626', fontWeight: '600', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>失业率≥4.7%或过去6个月+0.6ppt，萨姆规则正式触发</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>关键观察窗口；若触发，衰退概率升至70%，先影响科技就业（IT部门已负）。注意：1月数据有年度基准修正，波动更剧烈</td>
              </tr>
              <tr style={{ background: '#fff' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-02-10</td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>就业成本指数（Q4 2025）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>工资增长&lt;3%，信号经济冷却，影响消费者支出</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>领先指标；叠加CPI可放大科技需求风险</td>
              </tr>
              <tr style={{ background: '#fef2f2' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-02-25</td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>英伟达（NVDA）财报（Q4 2025）</td>
                <td style={{ padding: '10px', color: '#dc2626', fontWeight: '600', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>DOJO/服务器预算下修，增长&lt;折旧率，触发AI叙事反转</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>关键窗口；若合计MSFT下修&gt;10%，VIX&gt;25，纳斯达克广度崩</td>
              </tr>
              {/* 3月 */}
              <tr style={{ background: '#fff' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-03-02</td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ISM制造业PMI（2月2026）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>PMI&lt;48（连续3月），确认制造业收缩</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>月度更新；关注新订单和就业分项</td>
              </tr>
              <tr style={{ background: '#fff' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-03-03</td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ISM服务业PMI（2月2026）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>服务业PMI&lt;50，叠加制造业收缩，确认经济放缓</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>关键指标；服务业占GDP约80%</td>
              </tr>
              <tr style={{ background: '#fffbeb' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-03-04<br /><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>21:30</span></td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ADP就业数据（2月2026）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ADP新增就业&lt;15万，预示非农数据疲软</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>非农数据前导指标；通常比非农早2天发布</td>
              </tr>
              <tr style={{ background: '#fef3c7', borderLeft: '4px solid #f59e0b' }}>
                <td style={{ padding: '10px', fontWeight: '700', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-03-06<br /><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>21:30</span></td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem', fontWeight: '600' }}>就业情况报告（2月2026）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>失业率续升0.1-0.2ppt，确认"信心断崖"</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>监测青年（16.3%）/黑人（8.3%）细分；单变量衰退概率35%</td>
              </tr>
              <tr style={{ background: '#dbeafe', borderLeft: '4px solid #3b82f6' }}>
                <td style={{ padding: '10px', fontWeight: '700', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-03-17/18</td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem', fontWeight: '600' }}>FOMC会议（带经济预测）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>预测下修增长，或利率持稳，CRE压力放大</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>关注SEP；可能影响高收益利差（当前2.84%）</td>
              </tr>
              {/* 4月 */}
              <tr style={{ background: '#fff' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-04-01</td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ISM制造业PMI（3月2026）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>PMI&lt;48（连续3月），确认制造业收缩</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>月度更新；关注新订单和就业分项</td>
              </tr>
              <tr style={{ background: '#fff' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-04-02</td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ISM服务业PMI（3月2026）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>服务业PMI&lt;50，叠加制造业收缩，确认经济放缓</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>关键指标；服务业占GDP约80%</td>
              </tr>
              <tr style={{ background: '#fef3c7', borderLeft: '4px solid #f59e0b' }}>
                <td style={{ padding: '10px', fontWeight: '700', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-04-03<br /><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>20:30</span></td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem', fontWeight: '600' }}>就业情况报告（3月2026）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>累计+0.5ppt/6个月，强化萨姆陷阱</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>评估前期触发持续性</td>
              </tr>
              <tr style={{ background: '#f3f4f6' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-04-28/29</td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>FOMC会议</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>无降息，信用债违约率&gt;5%，拖累银行Tier 1资本</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>监测流动性注入</td>
              </tr>
              <tr style={{ background: '#fff' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-04-30</td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>就业成本指数（Q1 2026）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>成本上升但盈利滞后，放大投资-盈利剪刀差</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>AI相关</td>
              </tr>
              {/* 5月 */}
              <tr style={{ background: '#fff' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-05-01</td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ISM制造业PMI（4月2026）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>PMI&lt;48（连续3月），确认制造业收缩</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>月度更新；关注新订单和就业分项</td>
              </tr>
              <tr style={{ background: '#fff' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-05-02</td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ISM服务业PMI（4月2026）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>服务业PMI&lt;50，叠加制造业收缩，确认经济放缓</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>关键指标；服务业占GDP约80%</td>
              </tr>
              <tr style={{ background: '#fffbeb' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-05-06<br /><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>20:30</span></td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ADP就业数据（4月2026）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ADP新增就业&lt;15万，预示非农数据疲软</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>非农数据前导指标；通常比非农早2天发布</td>
              </tr>
              <tr style={{ background: '#fef3c7', borderLeft: '4px solid #f59e0b' }}>
                <td style={{ padding: '10px', fontWeight: '700', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-05-08<br /><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>20:30</span></td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem', fontWeight: '600' }}>就业情况报告（4月2026）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>Q1平均失业&gt;4.8%，确认衰退路径</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>季度评估点</td>
              </tr>
              {/* 6月 */}
              <tr style={{ background: '#fff' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-06-01</td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ISM制造业PMI（5月2026）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>PMI&lt;48（连续3月），确认制造业收缩</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>月度更新；关注新订单和就业分项</td>
              </tr>
              <tr style={{ background: '#fff' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-06-02</td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ISM服务业PMI（5月2026）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>服务业PMI&lt;50，叠加制造业收缩，确认经济放缓</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>关键指标；服务业占GDP约80%</td>
              </tr>
              <tr style={{ background: '#fffbeb' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-06-03<br /><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>20:30</span></td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ADP就业数据（5月2026）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ADP新增就业&lt;15万，预示非农数据疲软</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>非农数据前导指标；通常比非农早2天发布</td>
              </tr>
              <tr style={{ background: '#fef3c7', borderLeft: '4px solid #f59e0b' }}>
                <td style={{ padding: '10px', fontWeight: '700', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-06-05<br /><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>20:30</span></td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem', fontWeight: '600' }}>就业情况报告（5月2026）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>IT就业续负，AI Capex现实检查加速</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>科技部门焦点</td>
              </tr>
              <tr style={{ background: '#dbeafe', borderLeft: '4px solid #3b82f6' }}>
                <td style={{ padding: '10px', fontWeight: '700', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-06-16/17</td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem', fontWeight: '600' }}>FOMC会议（带经济预测）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>预测衰退，纳斯达克杠杆踩踏</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>SEP更新</td>
              </tr>
              {/* 7月 */}
              <tr style={{ background: '#fff' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-07-01</td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ISM制造业PMI（6月2026）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>PMI&lt;48（连续3月），确认制造业收缩</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>月度更新；关注新订单和就业分项</td>
              </tr>
              <tr style={{ background: '#fffbeb' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-07-01<br /><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>20:30</span></td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ADP就业数据（6月2026）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ADP新增就业&lt;15万，预示非农数据疲软</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>非农数据前导指标；通常比非农早2天发布</td>
              </tr>
              <tr style={{ background: '#fff' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-07-02</td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ISM服务业PMI（6月2026）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>服务业PMI&lt;50，叠加制造业收缩，确认经济放缓</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>关键指标；服务业占GDP约80%</td>
              </tr>
              <tr style={{ background: '#fef3c7', borderLeft: '4px solid #f59e0b' }}>
                <td style={{ padding: '10px', fontWeight: '700', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-07-03<br /><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>20:30</span></td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem', fontWeight: '600' }}>就业情况报告（6月2026）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>Q2平均&gt;5%，衰退概率&gt;50%</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>中期评估</td>
              </tr>
              <tr style={{ background: '#f3f4f6' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-07-28/29</td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>FOMC会议</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>中性利率调整，影响信用债</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>夏季会议</td>
              </tr>
              <tr style={{ background: '#fff' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-07-31</td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>就业成本指数（Q2 2026）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>成本压力上升，盈利剪刀差扩大</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>AI投资效率</td>
              </tr>
              {/* 8月 */}
              <tr style={{ background: '#fff' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-08-03</td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ISM制造业PMI（7月2026）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>PMI&lt;48（连续3月），确认制造业收缩</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>月度更新；关注新订单和就业分项</td>
              </tr>
              <tr style={{ background: '#fff' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-08-04</td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ISM服务业PMI（7月2026）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>服务业PMI&lt;50，叠加制造业收缩，确认经济放缓</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>关键指标；服务业占GDP约80%</td>
              </tr>
              <tr style={{ background: '#fffbeb' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-08-05<br /><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>20:30</span></td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ADP就业数据（7月2026）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ADP新增就业&lt;15万，预示非农数据疲软</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>非农数据前导指标；通常比非农早2天发布</td>
              </tr>
              <tr style={{ background: '#fff' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-08-07<br /><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>20:30</span></td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>就业情况报告（7月2026）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>夏季疲软确认，衰退路径锁定</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>季节调整</td>
              </tr>
              {/* 9月 */}
              <tr style={{ background: '#fff' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-09-01</td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ISM制造业PMI（8月2026）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>PMI&lt;48（连续3月），确认制造业收缩</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>月度更新；关注新订单和就业分项</td>
              </tr>
              <tr style={{ background: '#fff' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-09-02</td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ISM服务业PMI（8月2026）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>服务业PMI&lt;50，叠加制造业收缩，确认经济放缓</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>关键指标；服务业占GDP约80%</td>
              </tr>
              <tr style={{ background: '#fffbeb' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-09-03<br /><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>20:30</span></td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ADP就业数据（8月2026）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ADP新增就业&lt;15万，预示非农数据疲软</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>非农数据前导指标；通常比非农早2天发布</td>
              </tr>
              <tr style={{ background: '#fef3c7', borderLeft: '4px solid #f59e0b' }}>
                <td style={{ padding: '10px', fontWeight: '700', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-09-04<br /><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>20:30</span></td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem', fontWeight: '600' }}>就业情况报告（8月2026）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>Q3起始弱，年度风险峰值</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>关注信心指数</td>
              </tr>
              <tr style={{ background: '#dbeafe', borderLeft: '4px solid #3b82f6' }}>
                <td style={{ padding: '10px', fontWeight: '700', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-09-15/16</td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem', fontWeight: '600' }}>FOMC会议（带经济预测）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>尾部风险（如地缘/关税）上调，溢价上升</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>SEP焦点</td>
              </tr>
              {/* 10月 */}
              <tr style={{ background: '#fff' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-10-01</td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ISM制造业PMI（9月2026）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>PMI&lt;48（连续3月），确认制造业收缩</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>月度更新；关注新订单和就业分项</td>
              </tr>
              <tr style={{ background: '#fff' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-10-02</td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ISM服务业PMI（9月2026）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>服务业PMI&lt;50，叠加制造业收缩，确认经济放缓</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>关键指标；服务业占GDP约80%</td>
              </tr>
              <tr style={{ background: '#fef3c7', borderLeft: '4px solid #f59e0b' }}>
                <td style={{ padding: '10px', fontWeight: '700', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-10-02<br /><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>20:30</span></td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem', fontWeight: '600' }}>就业情况报告（9月2026）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>Q3平均&gt;5.5%，系统衰退确认</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>后期指标</td>
              </tr>
              <tr style={{ background: '#f3f4f6' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-10-27/28</td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>FOMC会议</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>年末紧缩，CRE"成熟墙"放大</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>秋季会议</td>
              </tr>
              <tr style={{ background: '#fff' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-10-30</td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>就业成本指数（Q3 2026）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>成本-盈利分歧，投资回报率&lt;8%</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>年度回顾</td>
              </tr>
              {/* 11月 */}
              <tr style={{ background: '#fffbeb' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-11-04<br /><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>21:30</span></td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ADP就业数据（10月2026）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ADP新增就业&lt;15万，预示非农数据疲软</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>非农数据前导指标；通常比非农早2天发布</td>
              </tr>
              <tr style={{ background: '#fef3c7', borderLeft: '4px solid #f59e0b' }}>
                <td style={{ padding: '10px', fontWeight: '700', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-11-06<br /><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>21:30</span></td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem', fontWeight: '600' }}>就业情况报告（10月2026）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>晚期上升，衰退概率&gt;70%</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>选举后影响</td>
              </tr>
              {/* 12月 */}
              <tr style={{ background: '#fffbeb' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-12-02<br /><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>21:30</span></td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ADP就业数据（11月2026）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ADP新增就业&lt;15万，预示非农数据疲软</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>非农数据前导指标；通常比非农早2天发布</td>
              </tr>
              <tr style={{ background: '#fef3c7', borderLeft: '4px solid #f59e0b' }}>
                <td style={{ padding: '10px', fontWeight: '700', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-12-04<br /><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>21:30</span></td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem', fontWeight: '600' }}>就业情况报告（11月2026）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>全年趋势确认，2027延续风险</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>年末总结</td>
              </tr>
              <tr style={{ background: '#dbeafe', borderLeft: '4px solid #3b82f6' }}>
                <td style={{ padding: '10px', fontWeight: '700', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-12-08/09</td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem', fontWeight: '600' }}>FOMC会议（带经济预测）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>预测2027衰退，市场提前反应</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>最终SEP</td>
              </tr>
              {/* 全年事件 */}
              <tr style={{ background: '#fef3c7' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>每周四<br /><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>21:30</span></td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>初请失业金人数（周度）</td>
                <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>初请&gt;25万（连续4周），确认劳动力市场恶化</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>高频指标；每周四发布，反映实时就业状况</td>
              </tr>
              <tr style={{ background: '#fee2e2', borderLeft: '4px solid #ef4444' }}>
                <td style={{ padding: '10px', fontWeight: '700', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026全年</td>
                <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem', fontWeight: '600' }}>CRE贷款到期高峰（约9360亿美元）</td>
                <td style={{ padding: '10px', color: '#dc2626', fontWeight: '600', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>办公贷款LTV&gt;80%违约扩散，利差&gt;400bp，系统风险溢价+200bp</td>
                <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>"慢炖"转为快变量；关注季度末（如Q2/Q4）。2026年高于2025年19%</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{
          background: 'rgba(255, 59, 48, 0.05)',
          padding: '24px',
          borderRadius: '16px',
          border: '1px solid rgba(255, 59, 48, 0.1)',
          marginTop: '24px'
        }}>
          <div style={{ fontWeight: '700', marginBottom: '16px', color: 'var(--system-red)', fontSize: '1.1rem' }}>
            ⚠️ 做空策略的额外注意
          </div>
          <div style={{ fontSize: '0.95rem', lineHeight: '1.8', color: 'var(--text-secondary)' }}>
            <p style={{ marginBottom: '12px' }}>
              <strong>风险聚合：</strong>萨姆规则叠加风险模型可达 52%。监控 VIX 和市场广度是核心。
            </p>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
              <strong>免责声明：</strong>做空策略风险极高。本仪表盘仅供参考，不构成任何形式的投资建议。
            </p>
          </div>
        </div>
      </div>

      {/* 应对策略 */}
      <div style={{
        background: 'rgba(52, 199, 89, 0.05)',
        border: '1px solid rgba(52, 199, 89, 0.1)',
        borderRadius: '24px',
        padding: '32px'
      }}>
        <h3 style={{
          fontSize: '1.25rem',
          fontWeight: '700',
          marginBottom: '20px',
          color: 'var(--system-green)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{ color: 'var(--system-green)' }}>
            <Lightbulb size={24} />
          </div>
          应对策略
        </h3>
        <div style={{ marginBottom: '24px' }}>
          <div style={{ fontWeight: '700', marginBottom: '12px', color: 'var(--system-green)', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Activity size={18} />
            投资者：流动性为王
          </div>
          <div style={{
            background: 'var(--bg-card)',
            padding: '20px',
            borderRadius: '16px',
            border: '1px solid var(--border-light)',
            marginBottom: '16px'
          }}>
            <div style={{ fontWeight: '600', marginBottom: '8px', color: 'var(--text-primary)' }}>立即行动：</div>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.95rem', lineHeight: '1.8', color: 'var(--text-secondary)' }}>
              <li>现金/短债比例提至<strong>25%</strong></li>
              <li>减持：商业地产REITs、高估值科技成长股</li>
              <li>增持：长期美债、黄金、波动率对冲工具</li>
            </ul>
          </div>
          <div style={{
            background: 'rgba(255, 59, 48, 0.05)',
            padding: '16px',
            borderRadius: '12px',
            border: '1px solid rgba(255, 59, 48, 0.1)'
          }}>
            <div style={{ fontWeight: '600', marginBottom: '8px', color: 'var(--system-red)' }}>情景触发：</div>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.95rem', lineHeight: '1.8', color: 'var(--text-secondary)' }}>
              <li>若失业率≥4.7% → 转向防御性资产（公用事业/国债）</li>
              <li>若CRE逾期率&gt;7% → 清除风险资产，增配现金</li>
            </ul>
          </div>
        </div>
        <div>
          <div style={{ fontWeight: '700', marginBottom: '12px', color: 'var(--system-green)', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Shield size={18} />
            企业：现金流防御
          </div>
          <div style={{
            background: 'var(--bg-card)',
            padding: '20px',
            borderRadius: '16px',
            border: '1px solid var(--border-light)'
          }}>
            <div style={{ fontWeight: '600', marginBottom: '8px', color: 'var(--text-primary)' }}>核心原则：</div>
            <p style={{ fontSize: '0.95rem', lineHeight: '1.8', color: 'var(--text-secondary)', marginBottom: '12px' }}>
              确保6个月以上的运营现金储备
            </p>
            <div style={{ fontWeight: '600', marginBottom: '8px', color: 'var(--text-primary)' }}>关键动作：</div>
            <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.95rem', lineHeight: '1.8', color: 'var(--text-secondary)' }}>
              <li>资本支出：仅保留高ROI项目</li>
              <li>人力策略：自然流失替代裁员，冻结非核心招聘</li>
              <li>债务管理：提前再融资，规避浮息债务风险</li>
            </ul>
          </div>
        </div>
      </div>

      {/* 关键信号：10Y-2Y利差转正 */}
      <div style={{
        background: 'rgba(0, 122, 255, 0.05)',
        border: '1px solid rgba(0, 122, 255, 0.1)',
        borderRadius: '24px',
        padding: '32px'
      }}>
        <h3 style={{
          fontSize: '1.25rem',
          fontWeight: '700',
          marginBottom: '20px',
          color: 'var(--system-blue)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{ color: 'var(--system-blue)' }}>
            <TrendingUp size={24} />
          </div>
          关键信号：10Y-2Y 利差转正
        </h3>
        <div style={{ fontSize: '0.95rem', lineHeight: '1.8', color: 'var(--text-secondary)' }}>
          <p style={{ marginBottom: '16px' }}>
            <strong>核心规律：</strong> 倒挂是告诉你病了，而转正是告诉你该进 ICU 了。
          </p>
          <p style={{ marginBottom: '16px' }}>
            <strong>历史数据：</strong> 从曲线转正到股市最终见底，通常有时滞，且中间往往伴随着较大幅度跌幅。
          </p>
          <div style={{
            background: 'var(--bg-card)',
            padding: '24px',
            borderRadius: '16px',
            marginTop: '16px',
            border: '1px solid var(--border-light)'
          }}>
            <div style={{ fontWeight: '600', marginBottom: '12px', color: 'var(--system-blue)' }}>观察顺序：</div>
            <ol style={{ paddingLeft: '20px', margin: 0, lineHeight: '2.2' }}>
              <li>2 年期国债收益率快速下行</li>
              <li>10Y-2Y 突破 0 轴（转正确认）</li>
              <li>失业率确认破位</li>
              <li>股市在大阴线跌破 200 日线</li>
            </ol>
          </div>
          <div style={{
            background: 'rgba(255, 59, 48, 0.05)',
            padding: '20px',
            borderRadius: '16px',
            marginTop: '20px',
            border: '1px solid rgba(255, 59, 48, 0.1)',
            fontSize: '0.9rem'
          }}>
            <strong style={{ color: 'var(--system-red)', display: 'block', marginBottom: '8px' }}>警惕临界时刻：</strong>
            <p style={{ margin: 0, lineHeight: '1.8' }}>
              10Y-2Y 利差接近 0% 时，如果突然变正，通常意味着政策转向确认。此时应保持高度警惕，避免在情绪化阶段盲目入场。
            </p>
          </div>
        </div>
      </div>

      {/* 专业总结 */}
      <div style={{
        background: 'var(--bg-card)',
        backdropFilter: 'var(--glass-blur)',
        border: '1px solid var(--border-light)',
        borderRadius: '24px',
        padding: '32px',
        boxShadow: 'var(--shadow-subtle)'
      }}>
        <h3 style={{
          fontSize: '1.25rem',
          fontWeight: '700',
          marginBottom: '20px',
          color: 'var(--text-primary)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{ color: 'var(--text-primary)' }}>
            <Pin size={24} />
          </div>
          专业总结
        </h3>
        <div style={{
          background: 'var(--system-gray6)',
          padding: '24px',
          borderRadius: '16px',
          border: '1px solid var(--border-light)',
          marginBottom: '24px',
          fontStyle: 'italic',
          fontSize: '1rem',
          lineHeight: '1.8',
          color: 'var(--text-secondary)',
          textAlign: 'center'
        }}>
          "经济引擎未熄火，但底层汽缸失速；美联储政策空间被通胀黏性压缩，弱势群体颠簸加剧。衰退非必然，但缓冲垫已薄如刀锋。"
        </div>
        <div style={{
          background: 'var(--bg-card)',
          padding: '24px',
          borderRadius: '16px',
          border: '1px solid var(--border-light)'
        }}>
          <div style={{ fontWeight: '700', marginBottom: '16px', color: 'var(--text-primary)', fontSize: '1.1rem' }}>最终评估：</div>
          <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.95rem', lineHeight: '2.2', color: 'var(--text-secondary)' }}>
            <li><strong>2026衰退概率：40%</strong>（预期 4-5 月触发）</li>
            <li><strong>最大非对称风险</strong>：劳动力市场裂痕与 CRE 信用链断裂的共振</li>
            <li><strong>关键生存法则</strong>：
              <ul style={{ margin: '8px 0 0 20px', padding: 0, lineHeight: '2' }}>
                <li>投资者：<strong>防御性配置</strong>，避免情绪化操作</li>
                <li>企业：<strong>现金流优先</strong>，保障核心生存线</li>
                <li>个人：<strong>技能升级</strong>，建立应急基金</li>
              </ul>
            </li>
          </ul>
        </div>
        <div style={{
          padding: '16px',
          marginTop: '24px',
          fontSize: '0.85rem',
          color: 'var(--text-tertiary)',
          textAlign: 'center',
          borderTop: '1px solid var(--border-light)'
        }}>
          <strong>数据更新承诺：</strong>本仪表盘每月首周五更新。
        </div>
      </div>
    </div>
  )
}
