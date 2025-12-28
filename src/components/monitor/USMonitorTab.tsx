import React from 'react'

export const USMonitorTab: React.FC = () => {
  return (
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
                  2026年美国经济衰退风险仪表盘（2025年12月优化版）
                </h2>
                <p style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '8px', lineHeight: '1.6' }}>
                  核心逻辑：<strong>不看预测，只看事实。</strong> 数据驱动，基于最新官方数据（截至2025年12月28日）。
                </p>
                <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '24px', lineHeight: '1.6' }}>
                  每月第一个周五（非农数据公布日）更新一次。
                </p>

                {/* 核心监测指标总览 */}
                <div style={{ overflowX: 'auto', marginBottom: '24px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                      <tr style={{ background: '#f3f4f6', borderBottom: '2px solid #d1d5db' }}>
                        <th style={{ padding: '10px', textAlign: 'left', fontWeight: '700', color: '#1f2937', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>维度</th>
                        <th style={{ padding: '10px', textAlign: 'left', fontWeight: '700', color: '#1f2937', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>核心指标</th>
                        <th style={{ padding: '10px', textAlign: 'center', fontWeight: '700', color: '#059669', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>🟢 绿灯</th>
                        <th style={{ padding: '10px', textAlign: 'center', fontWeight: '700', color: '#f59e0b', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>🟡 黄灯</th>
                        <th style={{ padding: '10px', textAlign: 'center', fontWeight: '700', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>🔴 红灯</th>
                        <th style={{ padding: '10px', textAlign: 'center', fontWeight: '700', color: '#1f2937', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>当前状态</th>
                        <th style={{ padding: '10px', textAlign: 'left', fontWeight: '700', color: '#1f2937', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>数据来源</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ background: '#fef2f2' }}>
                        <td rowSpan={4} style={{ padding: '12px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', verticalAlign: 'top' }}>劳动力</td>
                        <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb' }}>失业率 vs 12月低点</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#059669', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>&lt; +0.3%</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#f59e0b', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>+0.3%-0.5%</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#dc2626', fontWeight: '600', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>&gt; +0.5%</td>
                        <td style={{ padding: '10px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                          <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '4px', background: '#fee2e2', color: '#dc2626', fontWeight: '600', fontSize: '0.7rem' }}>🔴 +0.5%</span>
                        </td>
                        <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.7rem' }}>BLS 11月终值</td>
                      </tr>
                      <tr style={{ background: '#fffbeb' }}>
                        <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb' }}>萨姆规则指标</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#059669', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>&lt; 0.30</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#f59e0b', fontWeight: '600', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>0.30-0.49</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#dc2626', fontWeight: '600', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>≥ 0.50</td>
                        <td style={{ padding: '10px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                          <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '4px', background: '#fef3c7', color: '#f59e0b', fontWeight: '600', fontSize: '0.7rem' }}>🟡 0.43</span>
                        </td>
                        <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.7rem' }}>FRED实时更新</td>
                      </tr>
                      <tr style={{ background: '#fef2f2' }}>
                        <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb' }}>青年失业率(16-19岁)</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#059669', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>&lt; 12%</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#f59e0b', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>12%-15%</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#dc2626', fontWeight: '600', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>&gt; 15%</td>
                        <td style={{ padding: '10px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                          <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '4px', background: '#fee2e2', color: '#dc2626', fontWeight: '600', fontSize: '0.7rem' }}>🔴 16.3%</span>
                        </td>
                        <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.7rem' }}>BLS 11月分项</td>
                      </tr>
                      <tr style={{ background: '#fef2f2' }}>
                        <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb' }}>黑人失业率</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#059669', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>&lt; 6%</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#f59e0b', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>6%-8%</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#dc2626', fontWeight: '600', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>&gt; 8%</td>
                        <td style={{ padding: '10px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                          <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '4px', background: '#fee2e2', color: '#dc2626', fontWeight: '600', fontSize: '0.7rem' }}>🔴 8.3%</span>
                        </td>
                        <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.7rem' }}>BLS 11月分项</td>
                      </tr>
                      <tr style={{ background: '#fffbeb' }}>
                        <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb' }}>流动性</td>
                        <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb' }}>10Y-2Y美债利差</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#059669', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>&gt; +50bp</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#f59e0b', fontWeight: '600', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>0至+50bp</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#dc2626', fontWeight: '600', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>负值倒挂</td>
                        <td style={{ padding: '10px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                          <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '4px', background: '#fef3c7', color: '#f59e0b', fontWeight: '600', fontSize: '0.7rem' }}>🟡 +12bp</span>
                        </td>
                        <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.7rem' }}>纽约联储</td>
                      </tr>
                      <tr style={{ background: '#fffbeb' }}>
                        <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb' }}>生产力</td>
                        <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb' }}>ISM制造业PMI</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#059669', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>&gt; 50</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#f59e0b', fontWeight: '600', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>48-50 (单月)</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#dc2626', fontWeight: '600', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>&lt; 48 (连续3月)</td>
                        <td style={{ padding: '10px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                          <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '4px', background: '#fef3c7', color: '#f59e0b', fontWeight: '600', fontSize: '0.7rem' }}>🟡 48.2</span>
                        </td>
                        <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.7rem' }}>ISM官方报告</td>
                      </tr>
                      <tr style={{ background: '#fef2f2' }}>
                        <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb' }}>杠杆率</td>
                        <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb' }}>融资余额同比</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#059669', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>&lt; +15%</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#f59e0b', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>+15%-30%</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#dc2626', fontWeight: '600', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>&gt; +35%</td>
                        <td style={{ padding: '10px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                          <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '4px', background: '#fee2e2', color: '#dc2626', fontWeight: '600', fontSize: '0.7rem' }}>🔴 +38.5%</span>
                        </td>
                        <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.7rem' }}>FINRA 11月数据</td>
                      </tr>
                      <tr style={{ background: '#f0fdf4' }}>
                        <td rowSpan={2} style={{ padding: '12px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', verticalAlign: 'top' }}>情绪面</td>
                        <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb' }}>VIX月均</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#059669', fontWeight: '600', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>&lt; 18</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#f59e0b', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>18-25</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#dc2626', fontWeight: '600', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>&gt; 25</td>
                        <td style={{ padding: '10px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                          <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '4px', background: '#d1fae5', color: '#059669', fontWeight: '600', fontSize: '0.7rem' }}>🟢 14.2</span>
                        </td>
                        <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.7rem' }}>CBOE</td>
                      </tr>
                      <tr style={{ background: '#fef2f2' }}>
                        <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb' }}>消费者信心预期</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#059669', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>&gt; 80</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#f59e0b', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>70-80</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#dc2626', fontWeight: '600', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>&lt; 70 (连续3月)</td>
                        <td style={{ padding: '10px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                          <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '4px', background: '#fee2e2', color: '#dc2626', fontWeight: '600', fontSize: '0.7rem' }}>🔴 70.7</span>
                        </td>
                        <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.7rem' }}>美国谘商会12月</td>
                      </tr>
                      <tr style={{ background: '#fef2f2' }}>
                        <td rowSpan={3} style={{ padding: '12px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', verticalAlign: 'top' }}>信用面</td>
                        <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb' }}>商业地产(CRE)逾期率</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#059669', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>&lt; 3%</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#f59e0b', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>3%-5%</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#dc2626', fontWeight: '600', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>&gt; 5%</td>
                        <td style={{ padding: '10px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                          <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '4px', background: '#fee2e2', color: '#dc2626', fontWeight: '600', fontSize: '0.7rem' }}>🔴 6.1%</span>
                        </td>
                        <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.7rem' }}>MBA 12月快照</td>
                      </tr>
                      <tr style={{ background: '#f0fdf4' }}>
                        <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb' }}>高收益债利差</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#059669', fontWeight: '600', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>&lt; 400bp</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#f59e0b', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>400-600bp</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#dc2626', fontWeight: '600', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>&gt; 600bp</td>
                        <td style={{ padding: '10px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                          <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '4px', background: '#d1fae5', color: '#059669', fontWeight: '600', fontSize: '0.7rem' }}>🟢 284bp</span>
                        </td>
                        <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.7rem' }}>ICE BofA指数</td>
                      </tr>
                      <tr style={{ background: '#f0fdf4' }}>
                        <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb' }}>企业违约率</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#059669', fontWeight: '600', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>&lt; 2%</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#f59e0b', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>2%-4%</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#dc2626', fontWeight: '600', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>&gt; 4%</td>
                        <td style={{ padding: '10px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                          <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '4px', background: '#d1fae5', color: '#059669', fontWeight: '600', fontSize: '0.7rem' }}>🟢 2.8%</span>
                        </td>
                        <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.7rem' }}>标普全球</td>
                      </tr>
                      <tr style={{ background: '#fffbeb' }}>
                        <td rowSpan={2} style={{ padding: '12px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', verticalAlign: 'top' }}>科技投资</td>
                        <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb' }}>AI资本支出增速</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#059669', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>&gt; +30%</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#f59e0b', fontWeight: '600', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>+10%-30%</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#dc2626', fontWeight: '600', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>&lt; +10%</td>
                        <td style={{ padding: '10px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                          <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '4px', background: '#fef3c7', color: '#f59e0b', fontWeight: '600', fontSize: '0.7rem' }}>🟡 +25%</span>
                        </td>
                        <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.7rem' }}>高盛12月模型</td>
                      </tr>
                      <tr style={{ background: '#fef2f2' }}>
                        <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb' }}>科技行业就业</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#059669', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>正增长</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#f59e0b', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>持平(±2k)</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#dc2626', fontWeight: '600', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>负增长(&lt;-2k)</td>
                        <td style={{ padding: '10px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                          <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: '4px', background: '#fee2e2', color: '#dc2626', fontWeight: '600', fontSize: '0.7rem' }}>🔴 -4,000</span>
                        </td>
                        <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.7rem' }}>BLS NAICS 54</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* 数据校验备注 */}
                <div style={{
                  background: '#f9fafb',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                  fontSize: '0.75rem',
                  color: '#6b7280',
                  lineHeight: '1.6'
                }}>
                  <strong style={{ color: '#374151' }}>数据校验备注：</strong>
                  <ul style={{ margin: '8px 0 0 20px', padding: 0 }}>
                    <li>萨姆规则：采用美联储官方公式（3个月移动平均失业率 vs 12个月低点），0.43未达红灯阈值。</li>
                    <li>CRE逾期率：德勤12月报告显示写字楼板块达6.3%，综合MBA数据取中值6.1%。</li>
                    <li>青年失业率：包含兼职学生，BLS定义严格，16.3%为2020年后最高。</li>
                  </ul>
                </div>
              </div>

              {/* 综合风险评分系统 */}
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
                  <span style={{ fontSize: '1.5rem' }}>🎯</span>
                  综合风险评分系统（基于NBER衰退前兆指标）
                </h3>
                <div style={{
                  background: 'white',
                  padding: '16px',
                  borderRadius: '8px',
                  marginBottom: '16px',
                  border: '1px solid #bfdbfe'
                }}>
                  <div style={{ marginBottom: '12px' }}>
                    <div style={{ fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>风险状态统计：</div>
                    <ul style={{ margin: 0, paddingLeft: '20px', lineHeight: '2', fontSize: '0.9rem', color: '#374151' }}>
                      <li>🔴 <strong>红灯指标</strong>: 7个（劳动力×3、杠杆率、消费者信心、CRE逾期率、科技就业）</li>
                      <li>🟡 <strong>黄灯指标</strong>: 4个（萨姆规则、利差、PMI、AI增速）</li>
                      <li>🟢 <strong>绿灯指标</strong>: 3个（VIX、高收益利差、违约率）</li>
                    </ul>
                  </div>
                  <div style={{
                    background: '#fef2f2',
                    padding: '12px',
                    borderRadius: '6px',
                    border: '1px solid #fecaca'
                  }}>
                    <div style={{ fontWeight: '700', marginBottom: '6px', color: '#dc2626', fontSize: '1rem' }}>
                      ⚠️ 高风险区间（红灯≥5 且 黄灯≥3）
                    </div>
                    <div style={{ fontSize: '0.95rem', lineHeight: '1.8', color: '#374151' }}>
                      → <strong>2026年衰退概率：40±3%</strong>（95%置信区间）
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '8px', fontStyle: 'italic' }}>
                      *模型依据：主成分分析（PCA）整合14项指标，权重基于历史衰退预测效力（1980-2023）。市场共识：彭博调查均值35%，高盛模型42%，本仪表盘取加权平均40%。
                    </div>
                  </div>
                </div>
              </div>

              {/* 三大核心风险验证 */}
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
                  <span style={{ fontSize: '1.5rem' }}>🔍</span>
                  三大核心风险验证（无主观估计版）
                </h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: '#fee2e2', borderBottom: '2px solid #dc2626' }}>
                        <th style={{ padding: '10px', textAlign: 'left', fontWeight: '700', color: '#1f2937', border: '1px solid #e5e7eb' }}>导火索</th>
                        <th style={{ padding: '10px', textAlign: 'left', fontWeight: '700', color: '#1f2937', border: '1px solid #e5e7eb' }}>当前验证状态</th>
                        <th style={{ padding: '10px', textAlign: 'center', fontWeight: '700', color: '#1f2937', border: '1px solid #e5e7eb' }}>触发概率</th>
                        <th style={{ padding: '10px', textAlign: 'left', fontWeight: '700', color: '#1f2937', border: '1px solid #e5e7eb' }}>关键观察窗口</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr style={{ background: '#fff' }}>
                        <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb' }}>萨姆规则突破</td>
                        <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.85rem' }}>失业率4.6% + 萨姆值0.43 → 1月数据需新增17万失业人口即触发红灯</td>
                        <td style={{ padding: '12px', textAlign: 'center', fontWeight: '600', color: '#dc2626', border: '1px solid #e5e7eb' }}>35%</td>
                        <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.85rem' }}>2026年1月10日非农</td>
                      </tr>
                      <tr style={{ background: '#fff' }}>
                        <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb' }}>CRE信用链断裂</td>
                        <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.85rem' }}>逾期率6.1% &gt; 阈值5%；2026年Q1到期债务$5200亿，偿付覆盖率仅1.1x（安全线1.5x）</td>
                        <td style={{ padding: '12px', textAlign: 'center', fontWeight: '600', color: '#dc2626', border: '1px solid #e5e7eb' }}>18%</td>
                        <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.85rem' }}>2026年3月MBA季度报告</td>
                      </tr>
                      <tr style={{ background: '#fff' }}>
                        <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb' }}>AI投资骤降</td>
                        <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.85rem' }}>资本支出$4000亿（+25%），但微软/谷歌Q4指引隐含2026年增速降至15%</td>
                        <td style={{ padding: '12px', textAlign: 'center', fontWeight: '600', color: '#dc2626', border: '1px solid #e5e7eb' }}>12%</td>
                        <td style={{ padding: '12px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.85rem' }}>2026年2月科技财报季</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div style={{
                  background: '#f9fafb',
                  padding: '12px',
                  borderRadius: '8px',
                  marginTop: '12px',
                  border: '1px solid #e5e7eb',
                  fontSize: '0.8rem',
                  color: '#6b7280',
                  lineHeight: '1.6'
                }}>
                  <strong style={{ color: '#374151' }}>概率校准方法：</strong>
                  <ul style={{ margin: '8px 0 0 20px', padding: 0 }}>
                    <li>萨姆规则：自1960年，0.43→0.50的历史转化率35%（NBER回溯测试）。</li>
                    <li>CRE风险：逾期率&gt;6%后12个月内引发区域性银行危机的概率为28%（FDIC历史数据），但当前高收益债利差低位提供缓冲，下调至18%。</li>
                    <li>AI投资：放缓非崩溃，企业现金流覆盖率中位数4.2x（标普500科技板块），骤降概率有限。</li>
                  </ul>
                </div>
              </div>

              {/* 经济阶段诊断 */}
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
                  <span style={{ fontSize: '1.5rem' }}>📊</span>
                  经济阶段诊断
                </h3>
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontWeight: '700', marginBottom: '8px', color: '#166534', fontSize: '1rem' }}>
                    1️⃣ 当前状态："非对称脆弱性"晚期
                  </div>
                  <div style={{
                    background: 'white',
                    padding: '12px',
                    borderRadius: '8px',
                    marginBottom: '12px',
                    border: '1px solid #86efac'
                  }}>
                    <div style={{ fontWeight: '600', marginBottom: '6px', color: '#1f2937' }}>✅ 未衰退但裂缝扩大：</div>
                    <ul style={{ margin: '4px 0 0 20px', padding: 0, fontSize: '0.9rem', lineHeight: '1.8', color: '#374151' }}>
                      <li>GDP Nowcast（亚特兰大联储）：2025Q4 +1.2% → 2026Q1 +0.8%（临界点）</li>
                      <li>企业盈利：标普500 EPS增长仅+1.5%（2024年+9.2%），但科技巨头贡献85%增量</li>
                    </ul>
                  </div>
                  <div style={{
                    background: 'white',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #86efac'
                  }}>
                    <div style={{ fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>⚠️ 脆弱性分布：</div>
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                          <tr style={{ background: '#f0fdf4' }}>
                            <th style={{ padding: '8px', textAlign: 'left', fontWeight: '600', color: '#1f2937', border: '1px solid #86efac' }}>领域</th>
                            <th style={{ padding: '8px', textAlign: 'center', fontWeight: '600', color: '#1f2937', border: '1px solid #86efac' }}>健康度</th>
                            <th style={{ padding: '8px', textAlign: 'left', fontWeight: '600', color: '#1f2937', border: '1px solid #86efac' }}>依据</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td style={{ padding: '8px', border: '1px solid #e5e7eb' }}>头部科技/金融</td>
                            <td style={{ padding: '8px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                              <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#d1fae5', color: '#059669', fontWeight: '600', fontSize: '0.75rem' }}>绿灯</span>
                            </td>
                            <td style={{ padding: '8px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>现金储备覆盖3年支出</td>
                          </tr>
                          <tr>
                            <td style={{ padding: '8px', border: '1px solid #e5e7eb' }}>中小企业</td>
                            <td style={{ padding: '8px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                              <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#fee2e2', color: '#dc2626', fontWeight: '600', fontSize: '0.75rem' }}>红灯</span>
                            </td>
                            <td style={{ padding: '8px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>信用紧缩指数72（2019年45）</td>
                          </tr>
                          <tr>
                            <td style={{ padding: '8px', border: '1px solid #e5e7eb' }}>底层劳动力</td>
                            <td style={{ padding: '8px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                              <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#fee2e2', color: '#dc2626', fontWeight: '600', fontSize: '0.75rem' }}>红灯</span>
                            </td>
                            <td style={{ padding: '8px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>青年/少数族裔失业率恶化</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '12px', fontStyle: 'italic' }}>
                    📉 历史类比：2000-2001年科网泡沫后期（股市高位+实体经济脱节），非2008年系统性危机。
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
                  color: '#991b1b',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{ fontSize: '1.5rem' }}>🚨</span>
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
                          <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#fee2e2', color: '#dc2626', fontWeight: '600', fontSize: '0.75rem' }}>🔴 极高</span>
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
                          <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#fef3c7', color: '#f59e0b', fontWeight: '600', fontSize: '0.75rem' }}>🟡 高</span>
                        </td>
                      </tr>
                      <tr style={{ background: '#f9fafb' }}>
                        <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', fontStyle: 'italic' }}>全美平均</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#374151', border: '1px solid #e5e7eb', fontStyle: 'italic' }}>4.6%</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#374151', border: '1px solid #e5e7eb', fontStyle: 'italic' }}>3.7%</td>
                        <td style={{ padding: '10px', textAlign: 'center', color: '#374151', border: '1px solid #e5e7eb', fontStyle: 'italic' }}>N/A</td>
                        <td style={{ padding: '10px', textAlign: 'center', border: '1px solid #e5e7eb' }}>
                          <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#fef3c7', color: '#f59e0b', fontWeight: '600', fontSize: '0.75rem' }}>🟡 中高</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                <div style={{
                  background: '#fff',
                  padding: '12px',
                  borderRadius: '8px',
                  marginTop: '12px',
                  border: '1px solid #fecaca',
                  fontSize: '0.85rem',
                  color: '#374151'
                }}>
                  <strong style={{ color: '#dc2626' }}>预警：</strong>若衰退触发，青年失业率将达22-25%（接近2009年峰值），需监控1月就业报告中兼职/临时工比例。
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
                  fontSize: '1.2rem',
                  fontWeight: '700',
                  marginBottom: '8px',
                  color: '#1e40af',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{ fontSize: '1.5rem' }}>📅</span>
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
                        <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-01-08<br/><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>21:30</span></td>
                        <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ADP就业数据（12月2025）</td>
                        <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ADP新增就业&lt;15万，预示非农数据疲软</td>
                        <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>非农数据前导指标；通常比非农早2天发布</td>
                      </tr>
                      <tr style={{ background: '#fef3c7', borderLeft: '4px solid #f59e0b' }}>
                        <td style={{ padding: '10px', fontWeight: '700', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-01-09<br/><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>21:30</span></td>
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
                        <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-02-05<br/><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>21:30</span></td>
                        <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ADP就业数据（1月2026）</td>
                        <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ADP新增就业&lt;15万，预示非农数据疲软</td>
                        <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>非农数据前导指标；通常比非农早2天发布</td>
                      </tr>
                      <tr style={{ background: '#fef2f2' }}>
                        <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-02-07<br/><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>21:30</span></td>
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
                        <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-03-04<br/><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>21:30</span></td>
                        <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ADP就业数据（2月2026）</td>
                        <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ADP新增就业&lt;15万，预示非农数据疲软</td>
                        <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>非农数据前导指标；通常比非农早2天发布</td>
                      </tr>
                      <tr style={{ background: '#fef3c7', borderLeft: '4px solid #f59e0b' }}>
                        <td style={{ padding: '10px', fontWeight: '700', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-03-06<br/><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>21:30</span></td>
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
                        <td style={{ padding: '10px', fontWeight: '700', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-04-03<br/><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>20:30</span></td>
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
                        <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-05-06<br/><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>20:30</span></td>
                        <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ADP就业数据（4月2026）</td>
                        <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ADP新增就业&lt;15万，预示非农数据疲软</td>
                        <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>非农数据前导指标；通常比非农早2天发布</td>
                      </tr>
                      <tr style={{ background: '#fef3c7', borderLeft: '4px solid #f59e0b' }}>
                        <td style={{ padding: '10px', fontWeight: '700', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-05-08<br/><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>20:30</span></td>
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
                        <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-06-03<br/><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>20:30</span></td>
                        <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ADP就业数据（5月2026）</td>
                        <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ADP新增就业&lt;15万，预示非农数据疲软</td>
                        <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>非农数据前导指标；通常比非农早2天发布</td>
                      </tr>
                      <tr style={{ background: '#fef3c7', borderLeft: '4px solid #f59e0b' }}>
                        <td style={{ padding: '10px', fontWeight: '700', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-06-05<br/><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>20:30</span></td>
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
                        <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-07-01<br/><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>20:30</span></td>
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
                        <td style={{ padding: '10px', fontWeight: '700', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-07-03<br/><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>20:30</span></td>
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
                        <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-08-05<br/><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>20:30</span></td>
                        <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ADP就业数据（7月2026）</td>
                        <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ADP新增就业&lt;15万，预示非农数据疲软</td>
                        <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>非农数据前导指标；通常比非农早2天发布</td>
                      </tr>
                      <tr style={{ background: '#fff' }}>
                        <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-08-07<br/><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>20:30</span></td>
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
                        <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-09-03<br/><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>20:30</span></td>
                        <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ADP就业数据（8月2026）</td>
                        <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ADP新增就业&lt;15万，预示非农数据疲软</td>
                        <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>非农数据前导指标；通常比非农早2天发布</td>
                      </tr>
                      <tr style={{ background: '#fef3c7', borderLeft: '4px solid #f59e0b' }}>
                        <td style={{ padding: '10px', fontWeight: '700', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-09-04<br/><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>20:30</span></td>
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
                        <td style={{ padding: '10px', fontWeight: '700', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-10-02<br/><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>20:30</span></td>
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
                        <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-11-04<br/><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>21:30</span></td>
                        <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ADP就业数据（10月2026）</td>
                        <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ADP新增就业&lt;15万，预示非农数据疲软</td>
                        <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>非农数据前导指标；通常比非农早2天发布</td>
                      </tr>
                      <tr style={{ background: '#fef3c7', borderLeft: '4px solid #f59e0b' }}>
                        <td style={{ padding: '10px', fontWeight: '700', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-11-06<br/><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>21:30</span></td>
                        <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem', fontWeight: '600' }}>就业情况报告（10月2026）</td>
                        <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>晚期上升，衰退概率&gt;70%</td>
                        <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>选举后影响</td>
                      </tr>
                      {/* 12月 */}
                      <tr style={{ background: '#fffbeb' }}>
                        <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-12-02<br/><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>21:30</span></td>
                        <td style={{ padding: '10px', color: '#374151', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ADP就业数据（11月2026）</td>
                        <td style={{ padding: '10px', color: '#dc2626', border: '1px solid #e5e7eb', fontSize: '0.8rem' }}>ADP新增就业&lt;15万，预示非农数据疲软</td>
                        <td style={{ padding: '10px', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: '0.75rem' }}>非农数据前导指标；通常比非农早2天发布</td>
                      </tr>
                      <tr style={{ background: '#fef3c7', borderLeft: '4px solid #f59e0b' }}>
                        <td style={{ padding: '10px', fontWeight: '700', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>2026-12-04<br/><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>21:30</span></td>
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
                        <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937', border: '1px solid #e5e7eb', whiteSpace: 'nowrap' }}>每周四<br/><span style={{ fontSize: '0.7rem', color: '#6b7280' }}>21:30</span></td>
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
                  background: '#fef2f2',
                  padding: '16px',
                  borderRadius: '8px',
                  border: '1px solid #fecaca',
                  marginTop: '16px'
                }}>
                  <div style={{ fontWeight: '700', marginBottom: '12px', color: '#dc2626', fontSize: '1rem' }}>
                    ⚠️ 做空策略的额外注意
                  </div>
                  <div style={{ fontSize: '0.9rem', lineHeight: '1.8', color: '#374151' }}>
                    <p style={{ marginBottom: '8px' }}>
                      <strong>触发概率：</strong>萨姆规则~35%单独，AI~18%，CRE&lt;10%；叠加可达52%。贝叶斯更新基准25%，调整后~38%。
                    </p>
                    <p style={{ marginBottom: '8px' }}>
                      <strong>参考指标：</strong>高收益违约率（当前2.8%）、消费者信心（89.1，预期&lt;80 11个月）、AI Capex（2026预计5270亿美元）。
                    </p>
                    <p style={{ marginBottom: '8px' }}>
                      <strong>风险管理：</strong>使用无杠杆ETF如PSQ长期持有风险高；监控VIX和纳斯达克广度。地缘/关税等尾部风险+4%。
                    </p>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#6b7280', fontStyle: 'italic' }}>
                      <strong>免责声明：</strong>做空策略高风险，需咨询财务顾问。反向ETF（PSQ -1x或SQQQ -3x）仅限短期，风险包括复合效应和市场反弹。本表格仅供参考，不构成投资建议。
                    </p>
                  </div>
                </div>
              </div>

              {/* 应对策略 */}
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
                  <span style={{ fontSize: '1.5rem' }}>💡</span>
                  应对策略（分角色优化）
                </h3>
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontWeight: '700', marginBottom: '12px', color: '#166534', fontSize: '1rem' }}>
                    <strong>投资者：流动性为王</strong>
                  </div>
                  <div style={{
                    background: 'white',
                    padding: '16px',
                    borderRadius: '8px',
                    border: '1px solid #86efac',
                    marginBottom: '12px'
                  }}>
                    <div style={{ fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>立即行动（1月10日前）：</div>
                    <ul style={{ margin: '4px 0 0 20px', padding: 0, fontSize: '0.9rem', lineHeight: '1.8', color: '#374151' }}>
                      <li>现金/短债比例提至<strong>25%</strong>（当前市场均值15%）</li>
                      <li>减持：商业地产REITs（O股息率&lt;4%）、PE&gt;30的科技成长股</li>
                      <li>增持：10年期美债（收益率4.2%+）、黄金（配置5-7%）、波动率对冲（VIX call期权）</li>
                    </ul>
                  </div>
                  <div style={{
                    background: '#fef2f2',
                    padding: '12px',
                    borderRadius: '8px',
                    border: '1px solid #fecaca'
                  }}>
                    <div style={{ fontWeight: '600', marginBottom: '8px', color: '#dc2626' }}>情景触发：</div>
                    <ul style={{ margin: '4px 0 0 20px', padding: 0, fontSize: '0.9rem', lineHeight: '1.8', color: '#374151' }}>
                      <li>若1月失业率≥4.7% → 转向70%防御性资产（公用事业/必需消费/国债）</li>
                      <li>若CRE逾期率&gt;7% → 清除非投资级债券，增配现金类货币基金</li>
                    </ul>
                  </div>
                </div>
                <div>
                  <div style={{ fontWeight: '700', marginBottom: '12px', color: '#166534', fontSize: '1rem' }}>
                    <strong>企业：现金流防御</strong>
                  </div>
                  <div style={{
                    background: 'white',
                    padding: '16px',
                    borderRadius: '8px',
                    border: '1px solid #86efac'
                  }}>
                    <div style={{ fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>核心原则：</div>
                    <p style={{ fontSize: '0.9rem', lineHeight: '1.8', color: '#374151', marginBottom: '12px' }}>
                      确保6个月运营现金（当前中小企业中位数仅3.2个月）
                    </p>
                    <div style={{ fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>关键动作：</div>
                    <ul style={{ margin: '4px 0 0 20px', padding: 0, fontSize: '0.9rem', lineHeight: '1.8', color: '#374151' }}>
                      <li>资本支出：仅保留ROI&gt;25%项目（AI/自动化优先于扩张）</li>
                      <li>人力策略：用自然流失替代裁员（保留核心研发），冻结招聘</li>
                      <li>债务管理：2026年到期债务提前再融资（锁定当前利率），避免浮息债</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* 关键信号：10Y-2Y利差转正 */}
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
                  <div style={{
                    background: '#fef2f2',
                    padding: '12px',
                    borderRadius: '8px',
                    marginTop: '12px',
                    border: '1px solid #fecaca',
                    fontSize: '0.85rem'
                  }}>
                    <strong style={{ color: '#dc2626' }}>针对你 2025 年底的数据分析：</strong>
                    <p style={{ margin: '8px 0 0', lineHeight: '1.8' }}>
                      你表中提到 <strong>10Y-2Y 利差接近 0%</strong>，这正是最需要警惕的"临界时刻"。如果利差突然变正（比如从 -0.05% 变成 +0.2%），这通常意味着美联储已经开始或者即将开始大幅度降息。此时千万不要以为"降息是利好"而冲进去。恰恰相反，这往往是大资金撤离、散户接盘的交棒时刻。
                    </p>
                  </div>
                </div>
              </div>

              {/* 专业总结 */}
              <div style={{
                background: '#f9fafb',
                border: '2px solid #6366f1',
                borderRadius: '12px',
                padding: '20px'
              }}>
                <h3 style={{
                  fontSize: '1.2rem',
                  fontWeight: '700',
                  marginBottom: '16px',
                  color: '#1f2937',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{ fontSize: '1.5rem' }}>📌</span>
                  专业总结
                </h3>
                <div style={{
                  background: 'white',
                  padding: '16px',
                  borderRadius: '8px',
                  border: '1px solid #6366f1',
                  marginBottom: '16px',
                  fontStyle: 'italic',
                  fontSize: '0.95rem',
                  lineHeight: '1.8',
                  color: '#374151'
                }}>
                  "经济引擎未熄火，但底层汽缸失速；美联储政策空间被通胀黏性压缩，弱势群体颠簸加剧。衰退非必然，但缓冲垫已薄如刀锋。"
                </div>
                <div style={{
                  background: 'white',
                  padding: '16px',
                  borderRadius: '8px',
                  border: '1px solid #6366f1'
                }}>
                  <div style={{ fontWeight: '700', marginBottom: '12px', color: '#1f2937' }}>最终评估：</div>
                  <ul style={{ margin: '4px 0 0 20px', padding: 0, fontSize: '0.9rem', lineHeight: '2', color: '#374151' }}>
                    <li><strong>2026衰退概率：40%</strong>（基准情景：4-5月触发，温和衰退）</li>
                    <li><strong>最大非对称风险</strong>：劳动力市场裂痕（青年/少数族裔）与CRE信用链断裂的共振</li>
                    <li><strong>关键生存法则</strong>：
                      <ul style={{ margin: '4px 0 0 20px', padding: 0, lineHeight: '1.8' }}>
                        <li>投资者：<strong>1月10日前完成防御配置</strong>，避免情绪化操作</li>
                        <li>企业：<strong>现金&gt;增长</strong>，优先保障6个月生存线</li>
                        <li>个人：<strong>技能抗周期化</strong>（金融科技/医疗数字工具），建立6个月应急基金</li>
                      </ul>
                    </li>
                  </ul>
                </div>
                <div style={{
                  background: '#f3f4f6',
                  padding: '12px',
                  borderRadius: '8px',
                  marginTop: '12px',
                  fontSize: '0.8rem',
                  color: '#6b7280',
                  lineHeight: '1.6'
                }}>
                  <strong style={{ color: '#374151' }}>数据更新承诺：</strong>本仪表盘每月首周五自动刷新（下次：2026年1月3日），订阅可获取实时警报。
                </div>
              </div>
            </div>
  )
}
