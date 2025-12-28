import React from 'react'

export const ChinaTemperatureTab: React.FC = () => {
  return (
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
      )
      }
