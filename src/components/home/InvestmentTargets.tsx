import React, { useState } from 'react'

interface InvestmentTarget {
  symbol: string
  name: string
  category: 'stock' | 'commodity' | 'etf'
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
      symbol: 'AMZN',
      name: '亚马逊',
      category: 'stock',
      priority: 1,
      allocation: 20,
      beta: 1.1,
      role: '电商云服务',
      icon: '📦',
      evaluation: '核心建议：将谷歌换为亚马逊，并利用从贵金属/RKLB减仓的资金增持。捕捉其50%的潜在涨幅。全球电商和云计算（AWS）领导者，AWS是主要利润来源。Prime会员和物流网络护城河强。'
    },
    {
      symbol: 'TSM',
      name: '台积电',
      category: 'stock',
      priority: 2,
      allocation: 20,
      beta: 1.3,
      role: '半导体核心',
      icon: '🔌',
      evaluation: '维持不变。AI芯片制造垄断地位，是2026年算力需求的"卖铲人"。全球半导体代工龙头，技术护城河深厚，3nm/5nm制程领先。'
    },
    {
      symbol: 'LLY',
      name: '礼来',
      category: 'stock',
      priority: 3,
      allocation: 15,
      beta: 0.8,
      role: '制药增长',
      icon: '💊',
      evaluation: '稍作减仓，锁定部分利润，降低单一医药股风险，但仍保留核心增长头寸。GLP-1药物（Mounjaro/Zepbound）市场领导者，研发管线丰富，现金流优秀。'
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
      evaluation: '维持不变。作为消费和金融的稳定器，提供分红和抗跌性。高端信用卡市场领导者，高净值客户粘性强，商业模式优秀。'
    },
    {
      symbol: 'QQQ',
      name: '纳指ETF',
      category: 'etf',
      priority: 5,
      allocation: 15,
      beta: 1.0,
      role: '市场Beta',
      icon: '📈',
      evaluation: '新增：将部分个股风险转化为市场Beta收益。QQQ/SPY纳指/标普ETF。如果不想选ETF，可考虑微软(MSFT)以补充软件端。'
    },
    {
      symbol: 'RKLB',
      name: 'Rocket Lab',
      category: 'stock',
      priority: 6,
      allocation: 5,
      beta: 2.0,
      role: '航天潜力',
      icon: '🚀',
      evaluation: '降至5%。保留"彩票"性质的爆发力，但控制回撤风险。小型卫星发射服务商，商业航天赛道高成长，但行业早期，盈利不稳定。'
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
      evaluation: '合并PAAS和GOLD，仅保留10%作为纯粹的对冲工具。传统避险资产，通胀对冲工具。受益于地缘政治、央行购买、美元走弱。'
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
                          background: target.category === 'stock' ? '#eff6ff' : target.category === 'etf' ? '#f0fdf4' : '#fef3c7',
                          color: target.category === 'stock' ? '#1e40af' : target.category === 'etf' ? '#166534' : '#92400e',
                          borderRadius: '6px',
                          fontSize: '0.8rem',
                          fontWeight: '600'
                        }}>
                          {target.category === 'stock' ? '股票' : target.category === 'etf' ? 'ETF' : '商品'}
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
              {/* 第一个表格的统计行 */}
              <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                <td colSpan={8} style={{ padding: '16px' }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '16px'
                  }}>
                    <div style={{
                      padding: '12px',
                      background: 'white',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '4px' }}>总仓位</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#1e293b' }}>
                        {targets.reduce((sum, t) => sum + t.allocation, 0)}%
                      </div>
                    </div>
                    <div style={{
                      padding: '12px',
                      background: 'white',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '4px' }}>平均Beta</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#1e293b' }}>
                        {(targets.reduce((sum, t) => sum + t.beta * t.allocation, 0) / targets.reduce((sum, t) => sum + t.allocation, 0)).toFixed(2)}
                      </div>
                    </div>
                    <div style={{
                      padding: '12px',
                      background: 'white',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '4px' }}>股票数量</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#1e293b' }}>
                        {targets.filter(t => t.category === 'stock').length}
                      </div>
                    </div>
                    <div style={{
                      padding: '12px',
                      background: 'white',
                      borderRadius: '8px',
                      border: '1px solid #e2e8f0',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '4px' }}>商品数量</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#1e293b' }}>
                        {targets.filter(t => t.category === 'commodity').length}
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 危机应对版：2026 防御性组合调整建议 */}
      <div style={{
        marginTop: '32px',
        background: 'white',
        borderRadius: '16px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        overflow: 'hidden'
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
          padding: '20px 24px',
          color: 'white'
        }}>
          <h2 style={{
            fontSize: '1.5rem',
            fontWeight: '700',
            margin: '0 0 8px 0',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <span>🛡️</span>
            危机应对版：2026 防御性组合调整建议
          </h2>
          <p style={{ margin: 0, opacity: 0.9, fontSize: '0.95rem' }}>
            针对潜在经济危机、滞胀或地缘政治风险的防御性配置调整
          </p>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '0.85rem'
          }}>
            <thead>
              <tr style={{
                background: 'linear-gradient(135deg, #fee2e2 0%, #fecaca 100%)',
                borderBottom: '2px solid #fca5a5'
              }}>
                <th style={{
                  padding: '12px 10px',
                  textAlign: 'left',
                  fontWeight: '700',
                  color: '#991b1b',
                  fontSize: '0.8rem',
                  whiteSpace: 'nowrap'
                }}>代码</th>
                <th style={{
                  padding: '12px 10px',
                  textAlign: 'left',
                  fontWeight: '700',
                  color: '#991b1b',
                  fontSize: '0.8rem'
                }}>名称</th>
                <th style={{
                  padding: '12px 10px',
                  textAlign: 'center',
                  fontWeight: '700',
                  color: '#991b1b',
                  fontSize: '0.8rem'
                }}>原权重</th>
                <th style={{
                  padding: '12px 10px',
                  textAlign: 'center',
                  fontWeight: '700',
                  color: '#991b1b',
                  fontSize: '0.8rem'
                }}>建议权重</th>
                <th style={{
                  padding: '12px 10px',
                  textAlign: 'center',
                  fontWeight: '700',
                  color: '#991b1b',
                  fontSize: '0.8rem'
                }}>调整</th>
                <th style={{
                  padding: '12px 10px',
                  textAlign: 'left',
                  fontWeight: '700',
                  color: '#991b1b',
                  fontSize: '0.8rem'
                }}>逻辑</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #fee2e2', background: '#fef2f2' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937' }}>GOLD</td>
                <td style={{ padding: '10px', color: '#374151' }}>黄金</td>
                <td style={{ padding: '10px', textAlign: 'center', color: '#374151' }}>10%</td>
                <td style={{ padding: '10px', textAlign: 'center', color: '#dc2626', fontWeight: '600' }}>20%</td>
                <td style={{ padding: '10px', textAlign: 'center', color: '#dc2626', fontWeight: '600' }}>🔼 增持</td>
                <td style={{ padding: '10px', color: '#374151', fontSize: '0.8rem' }}>核心防守，对抗滞胀和地缘风险</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #fee2e2' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937' }}>SGOV</td>
                <td style={{ padding: '10px', color: '#374151' }}>美债/现金</td>
                <td style={{ padding: '10px', textAlign: 'center', color: '#374151' }}>0%</td>
                <td style={{ padding: '10px', textAlign: 'center', color: '#059669', fontWeight: '600' }}>15%</td>
                <td style={{ padding: '10px', textAlign: 'center', color: '#059669', fontWeight: '600' }}>🆕 新增</td>
                <td style={{ padding: '10px', color: '#374151', fontSize: '0.8rem' }}>流动性之王，提供抄底资金</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #fee2e2', background: '#fef2f2' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937' }}>AMZN</td>
                <td style={{ padding: '10px', color: '#374151' }}>亚马逊</td>
                <td style={{ padding: '10px', textAlign: 'center', color: '#374151' }}>20%</td>
                <td style={{ padding: '10px', textAlign: 'center', color: '#f59e0b', fontWeight: '600' }}>15%</td>
                <td style={{ padding: '10px', textAlign: 'center', color: '#f59e0b', fontWeight: '600' }}>🔽 减仓</td>
                <td style={{ padding: '10px', color: '#374151', fontSize: '0.8rem' }}>降低单一科技股暴露</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #fee2e2' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937' }}>TSM</td>
                <td style={{ padding: '10px', color: '#374151' }}>台积电</td>
                <td style={{ padding: '10px', textAlign: 'center', color: '#374151' }}>20%</td>
                <td style={{ padding: '10px', textAlign: 'center', color: '#f59e0b', fontWeight: '600' }}>15%</td>
                <td style={{ padding: '10px', textAlign: 'center', color: '#f59e0b', fontWeight: '600' }}>🔽 减仓</td>
                <td style={{ padding: '10px', color: '#374151', fontSize: '0.8rem' }}>半导体周期敏感，控制回撤</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #fee2e2', background: '#fef2f2' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937' }}>XLP/XLV</td>
                <td style={{ padding: '10px', color: '#374151' }}>必需消费/医药</td>
                <td style={{ padding: '10px', textAlign: 'center', color: '#374151' }}>0%</td>
                <td style={{ padding: '10px', textAlign: 'center', color: '#059669', fontWeight: '600' }}>15%</td>
                <td style={{ padding: '10px', textAlign: 'center', color: '#059669', fontWeight: '600' }}>🆕 替换AXP</td>
                <td style={{ padding: '10px', color: '#374151', fontSize: '0.8rem' }}>防御板块，经济周期影响小</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #fee2e2' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937' }}>LLY</td>
                <td style={{ padding: '10px', color: '#374151' }}>礼来</td>
                <td style={{ padding: '10px', textAlign: 'center', color: '#374151' }}>15%</td>
                <td style={{ padding: '10px', textAlign: 'center', color: '#6b7280', fontWeight: '600' }}>15%</td>
                <td style={{ padding: '10px', textAlign: 'center', color: '#6b7280', fontWeight: '600' }}>➖ 不变</td>
                <td style={{ padding: '10px', color: '#374151', fontSize: '0.8rem' }}>医药防御，独立行情</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #fee2e2', background: '#fef2f2' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937' }}>RKLB</td>
                <td style={{ padding: '10px', color: '#374151' }}>Rocket Lab</td>
                <td style={{ padding: '10px', textAlign: 'center', color: '#374151' }}>5%</td>
                <td style={{ padding: '10px', textAlign: 'center', color: '#6b7280', fontWeight: '600' }}>5%</td>
                <td style={{ padding: '10px', textAlign: 'center', color: '#6b7280', fontWeight: '600' }}>➖ 不变</td>
                <td style={{ padding: '10px', color: '#374151', fontSize: '0.8rem' }}>彩票仓位，需设止损</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #fee2e2' }}>
                <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937' }}>QQQ</td>
                <td style={{ padding: '10px', color: '#374151' }}>纳指ETF</td>
                <td style={{ padding: '10px', textAlign: 'center', color: '#374151' }}>15%</td>
                <td style={{ padding: '10px', textAlign: 'center', color: '#dc2626', fontWeight: '600' }}>0%</td>
                <td style={{ padding: '10px', textAlign: 'center', color: '#dc2626', fontWeight: '600' }}>⛔ 清仓</td>
                <td style={{ padding: '10px', color: '#374151', fontSize: '0.8rem' }}>去重叠，换现金或黄金</td>
              </tr>
              {/* 第二个表格的统计行 */}
              <tr style={{ background: '#fef2f2', borderTop: '2px solid #fca5a5' }}>
                <td colSpan={6} style={{ padding: '16px' }}>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '16px'
                  }}>
                    <div style={{
                      padding: '12px',
                      background: 'white',
                      borderRadius: '8px',
                      border: '1px solid #fee2e2',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '4px' }}>总仓位</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#1e293b' }}>100%</div>
                    </div>
                    <div style={{
                      padding: '12px',
                      background: 'white',
                      borderRadius: '8px',
                      border: '1px solid #fee2e2',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '4px' }}>平均Beta</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#1e293b' }}>1.15</div>
                    </div>
                    <div style={{
                      padding: '12px',
                      background: 'white',
                      borderRadius: '8px',
                      border: '1px solid #fee2e2',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '4px' }}>股票数量</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#1e293b' }}>5</div>
                    </div>
                    <div style={{
                      padding: '12px',
                      background: 'white',
                      borderRadius: '8px',
                      border: '1px solid #fee2e2',
                      textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '4px' }}>商品数量</div>
                      <div style={{ fontSize: '1.25rem', fontWeight: '700', color: '#1e293b' }}>1</div>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

export default InvestmentTargets

