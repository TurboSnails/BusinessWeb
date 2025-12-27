import React, { useState } from 'react'

interface InvestmentTarget {
  symbol: string
  name: string
  category: 'stock' | 'commodity'
  priority: number
  allocation: number
  beta: number
  evaluation: string
  role: string
  icon: string
}

const InvestmentTargets: React.FC = () => {
  // 投资标的列表（按优先级排序）
  const targets: InvestmentTarget[] = [
    {
      symbol: 'TSM',
      name: '台积电',
      category: 'stock',
      priority: 1,
      allocation: 20,
      beta: 1.3,
      role: '半导体核心',
      icon: '🔌',
      evaluation: '全球半导体代工龙头，AI芯片需求的核心受益者。技术护城河深厚，3nm/5nm制程领先。受益于AI、数据中心、汽车电子长期增长。风险：地缘政治、周期性波动。建议：核心持仓，长期持有。'
    },
    {
      symbol: 'LLY',
      name: '礼来',
      category: 'stock',
      priority: 2,
      allocation: 20,
      beta: 0.8,
      role: '制药增长',
      icon: '💊',
      evaluation: 'GLP-1药物（Mounjaro/Zepbound）市场领导者，糖尿病和肥胖症治疗领域增长强劲。研发管线丰富，现金流优秀。防御性强，Beta低。风险：专利到期、竞争加剧。建议：稳健增长型，适合防御配置。'
    },
    {
      symbol: 'GOOGL',
      name: '谷歌',
      category: 'stock',
      priority: 3,
      allocation: 15,
      beta: 1.1,
      role: 'AI领导',
      icon: '🔍',
      evaluation: '搜索广告业务稳定，AI（Gemini）和云计算（GCP）增长潜力大。YouTube、Android生态护城河强。估值相对合理。风险：监管压力、AI竞争。建议：科技核心持仓，关注AI进展。'
    },
    {
      symbol: 'AXP',
      name: '美国运通',
      category: 'stock',
      priority: 4,
      allocation: 15,
      beta: 1.4,
      role: '金融稳定',
      icon: '💳',
      evaluation: '高端信用卡市场领导者，高净值客户粘性强。商业模式优秀（闭环网络），费率收入稳定。受益于消费升级和旅游复苏。风险：经济衰退影响消费、竞争。建议：金融板块核心，Beta较高需注意。'
    },
    {
      symbol: 'PAAS',
      name: 'Pan American Silver',
      category: 'stock',
      priority: 5,
      allocation: 10,
      beta: 1.5,
      role: '银矿对冲',
      icon: '🥈',
      evaluation: '全球主要银矿生产商，受益于白银工业需求和通胀对冲。金银比高时（>85）买入机会。与黄金联动，但波动更大。风险：金属价格波动、开采成本。建议：通胀对冲工具，阶段性配置。'
    },
    {
      symbol: 'RKLB',
      name: 'Rocket Lab',
      category: 'stock',
      priority: 6,
      allocation: 10,
      beta: 2.0,
      role: '航天潜力',
      icon: '🚀',
      evaluation: '小型卫星发射服务商，商业航天赛道高成长。技术领先，订单增长。但行业早期，盈利不稳定。Beta极高（2.0），波动大。风险：技术失败、竞争、资金需求。建议：卫星仓位，高风险高收益，仅适合风险承受能力强的投资者。'
    },
    {
      symbol: 'GOLD',
      name: '黄金',
      category: 'commodity',
      priority: 7,
      allocation: 10,
      beta: 0.9,
      role: '通胀对冲',
      icon: '🥇',
      evaluation: '传统避险资产，通胀对冲工具。受益于地缘政治、央行购买、美元走弱。但无股息，机会成本高。卖出信号：利率上升（10年美债>4%）、美元强势（DXY>105）、回调>10%。建议：防御配置，动态调整。'
    }
  ]

  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null)

  const getPriorityBadge = (priority: number) => {
    const colors = [
      { bg: '#fef2f2', color: '#dc2626', text: '🥇' },
      { bg: '#fef3c7', color: '#d97706', text: '🥈' },
      { bg: '#dbeafe', color: '#2563eb', text: '🥉' },
      { bg: '#f3f4f6', color: '#6b7280', text: '4️⃣' },
      { bg: '#f3f4f6', color: '#6b7280', text: '5️⃣' },
      { bg: '#f3f4f6', color: '#6b7280', text: '6️⃣' },
      { bg: '#f3f4f6', color: '#6b7280', text: '7️⃣' }
    ]
    return colors[priority - 1] || colors[6]
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px 16px' }}>
      <div style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        padding: '24px',
        borderRadius: '16px 16px 0 0',
        marginBottom: '0'
      }}>
        <h1 style={{
          fontSize: '2rem',
          fontWeight: '700',
          margin: '0 0 8px 0',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <span>📈</span>
          长期看好的公司
        </h1>
        <p style={{ margin: 0, opacity: 0.9, fontSize: '1rem' }}>
          按优先级排序的投资标的，包含仓位配置和个股评价
        </p>
      </div>

      <div style={{
        background: 'white',
        borderRadius: '0 0 16px 16px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        overflow: 'hidden'
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '0.9rem'
          }}>
            <thead>
              <tr style={{
                background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                borderBottom: '2px solid #e2e8f0'
              }}>
                <th style={{
                  padding: '16px 12px',
                  textAlign: 'left',
                  fontWeight: '700',
                  color: '#1e293b',
                  fontSize: '0.85rem',
                  whiteSpace: 'nowrap'
                }}>
                  优先级
                </th>
                <th style={{
                  padding: '16px 12px',
                  textAlign: 'left',
                  fontWeight: '700',
                  color: '#1e293b',
                  fontSize: '0.85rem'
                }}>
                  代码
                </th>
                <th style={{
                  padding: '16px 12px',
                  textAlign: 'left',
                  fontWeight: '700',
                  color: '#1e293b',
                  fontSize: '0.85rem'
                }}>
                  名称
                </th>
                <th style={{
                  padding: '16px 12px',
                  textAlign: 'left',
                  fontWeight: '700',
                  color: '#1e293b',
                  fontSize: '0.85rem'
                }}>
                  角色
                </th>
                <th style={{
                  padding: '16px 12px',
                  textAlign: 'center',
                  fontWeight: '700',
                  color: '#1e293b',
                  fontSize: '0.85rem'
                }}>
                  仓位
                </th>
                <th style={{
                  padding: '16px 12px',
                  textAlign: 'center',
                  fontWeight: '700',
                  color: '#1e293b',
                  fontSize: '0.85rem'
                }}>
                  Beta
                </th>
                <th style={{
                  padding: '16px 12px',
                  textAlign: 'left',
                  fontWeight: '700',
                  color: '#1e293b',
                  fontSize: '0.85rem'
                }}>
                  类型
                </th>
                <th style={{
                  padding: '16px 12px',
                  textAlign: 'center',
                  fontWeight: '700',
                  color: '#1e293b',
                  fontSize: '0.85rem'
                }}>
                  评价
                </th>
              </tr>
            </thead>
            <tbody>
              {targets.map((target, index) => {
                const badge = getPriorityBadge(target.priority)
                const isExpanded = expandedSymbol === target.symbol
                return (
                  <React.Fragment key={target.symbol}>
                    <tr
                      style={{
                        borderBottom: '1px solid #e2e8f0',
                        transition: 'background 0.2s',
                        background: index % 2 === 0 ? 'white' : '#f8fafc'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#f1f5f9'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = index % 2 === 0 ? 'white' : '#f8fafc'
                      }}
                    >
                      <td style={{ padding: '16px 12px' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '36px',
                          height: '36px',
                          background: badge.bg,
                          color: badge.color,
                          borderRadius: '8px',
                          fontWeight: '700',
                          fontSize: '1.1rem'
                        }}>
                          {badge.text}
                        </span>
                      </td>
                      <td style={{
                        padding: '16px 12px',
                        fontWeight: '700',
                        color: '#1e293b',
                        fontSize: '0.95rem'
                      }}>
                        {target.symbol}
                      </td>
                      <td style={{ padding: '16px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '1.2rem' }}>{target.icon}</span>
                          <span style={{ color: '#334155', fontWeight: '600' }}>{target.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: '16px 12px' }}>
                        <span style={{
                          padding: '4px 10px',
                          background: 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)',
                          color: '#0369a1',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          fontWeight: '600'
                        }}>
                          {target.role}
                        </span>
                      </td>
                      <td style={{ padding: '16px 12px', textAlign: 'center' }}>
                        <div style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '6px 12px',
                          background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                          borderRadius: '8px',
                          fontWeight: '700',
                          color: '#166534',
                          fontSize: '0.9rem'
                        }}>
                          {target.allocation}%
                        </div>
                      </td>
                      <td style={{ padding: '16px 12px', textAlign: 'center' }}>
                        <span style={{
                          padding: '4px 10px',
                          background: target.beta >= 1.5 ? '#fef2f2' : target.beta >= 1.0 ? '#fef3c7' : '#f0fdf4',
                          color: target.beta >= 1.5 ? '#dc2626' : target.beta >= 1.0 ? '#d97706' : '#166534',
                          borderRadius: '6px',
                          fontSize: '0.85rem',
                          fontWeight: '600'
                        }}>
                          {target.beta}
                        </span>
                      </td>
                      <td style={{ padding: '16px 12px' }}>
                        <span style={{
                          padding: '4px 10px',
                          background: target.category === 'stock' ? '#eff6ff' : '#fef3c7',
                          color: target.category === 'stock' ? '#1e40af' : '#92400e',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          fontWeight: '600'
                        }}>
                          {target.category === 'stock' ? '股票' : '商品'}
                        </span>
                      </td>
                      <td style={{ padding: '16px 12px', textAlign: 'center' }}>
                        <button
                          onClick={() => setExpandedSymbol(isExpanded ? null : target.symbol)}
                          style={{
                            padding: '6px 12px',
                            background: isExpanded ? '#3b82f6' : '#e0f2fe',
                            color: isExpanded ? 'white' : '#0369a1',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '0.85rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                          onMouseEnter={(e) => {
                            if (!isExpanded) {
                              e.currentTarget.style.background = '#bae6fd'
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isExpanded) {
                              e.currentTarget.style.background = '#e0f2fe'
                            }
                          }}
                        >
                          {isExpanded ? '收起' : '查看'}
                        </button>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr>
                        <td colSpan={8} style={{
                          padding: '20px',
                          background: '#f8fafc',
                          borderBottom: '1px solid #e2e8f0'
                        }}>
                          <div style={{
                            background: 'white',
                            padding: '20px',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
                          }}>
                            <h3 style={{
                              fontSize: '1.1rem',
                              fontWeight: '700',
                              margin: '0 0 12px 0',
                              color: '#1e293b',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px'
                            }}>
                              <span>{target.icon}</span>
                              {target.name} ({target.symbol}) - 个股评价
                            </h3>
                            <div style={{
                              fontSize: '0.95rem',
                              lineHeight: '1.8',
                              color: '#475569'
                            }}>
                              {target.evaluation}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>

        <div style={{
          padding: '20px',
          background: '#f8fafc',
          borderTop: '2px solid #e2e8f0'
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px'
          }}>
            <div style={{
              padding: '16px',
              background: 'white',
              borderRadius: '12px',
              border: '1px solid #e2e8f0'
            }}>
              <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '4px' }}>总仓位</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1e293b' }}>
                {targets.reduce((sum, t) => sum + t.allocation, 0)}%
              </div>
            </div>
            <div style={{
              padding: '16px',
              background: 'white',
              borderRadius: '12px',
              border: '1px solid #e2e8f0'
            }}>
              <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '4px' }}>平均Beta</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1e293b' }}>
                {(targets.reduce((sum, t) => sum + t.beta * t.allocation, 0) / targets.reduce((sum, t) => sum + t.allocation, 0)).toFixed(2)}
              </div>
            </div>
            <div style={{
              padding: '16px',
              background: 'white',
              borderRadius: '12px',
              border: '1px solid #e2e8f0'
            }}>
              <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '4px' }}>股票数量</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1e293b' }}>
                {targets.filter(t => t.category === 'stock').length}
              </div>
            </div>
            <div style={{
              padding: '16px',
              background: 'white',
              borderRadius: '12px',
              border: '1px solid #e2e8f0'
            }}>
              <div style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '4px' }}>商品数量</div>
              <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#1e293b' }}>
                {targets.filter(t => t.category === 'commodity').length}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default InvestmentTargets

