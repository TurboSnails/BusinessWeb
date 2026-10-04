import React from 'react'

export const SilverMonitor: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* 价格事实 */}
      <div style={{ 
        background: 'var(--accent-warm-soft)', 
        border: '2px solid var(--accent-warm)', 
        borderRadius: '12px', 
        padding: '24px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
      }}>
        <h2 style={{ 
          fontSize: '1.5rem', 
          fontWeight: '700', 
          marginBottom: '16px', 
          color: 'var(--warm-ink)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span style={{ fontSize: '2rem' }}>🥈</span>
          价格事实
        </h2>
        <div style={{ 
          background: 'white', 
          padding: '16px', 
          borderRadius: '8px',
          border: '1px solid var(--accent-warm)'
        }}>
          <div style={{ fontSize: '1.1rem', lineHeight: '1.8', color: 'var(--text-primary)' }}>
            <p style={{ margin: '0 0 12px 0' }}>
              <strong style={{ color: 'var(--warm-ink)' }}>当前价格：</strong>79.11 USD/oz
            </p>
            <p style={{ margin: '0 0 12px 0' }}>
              <strong style={{ color: 'var(--system-red)' }}>单日涨幅：</strong>+5.9%
            </p>
            <p style={{ margin: 0, fontWeight: '600', color: 'var(--system-red)' }}>
              → 市场进入高波动区间，逼空概率上升
            </p>
          </div>
        </div>
      </div>

      {/* 三盏"过程灯" */}
      <div style={{ 
        background: 'var(--accent-soft)', 
        border: '2px solid var(--accent)', 
        borderRadius: '12px', 
        padding: '24px'
      }}>
        <h2 style={{ 
          fontSize: '1.5rem', 
          fontWeight: '700', 
          marginBottom: '12px', 
          color: 'var(--accent-ink)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span style={{ fontSize: '2rem' }}>🚦</span>
          三盏"过程灯"（每天收盘核对）
        </h2>
        <p style={{ fontSize: '0.9rem', color: 'var(--system-red)', fontWeight: '600', marginBottom: '20px', padding: '12px', background: 'var(--system-red-light)', borderRadius: '8px', border: '1px solid var(--system-red-light)' }}>
          ⚠️ 任意两盏红灯 = 进入"强警戒"状态
        </p>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ 
            background: 'white', 
            padding: '16px', 
            borderRadius: '8px',
            border: '2px solid var(--system-red-light)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <span style={{ fontSize: '1.5rem' }}>①</span>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--system-red)', margin: 0 }}>
                近月升水
              </h3>
            </div>
            <div style={{ fontSize: '0.95rem', lineHeight: '1.8', color: 'var(--text-primary)' }}>
              <p style={{ margin: '0 0 8px 0' }}>
                <strong>红灯条件：</strong>近月升水 &gt;1.5% 且持续≥3天
              </p>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                数据来源：TradingView 连续合约（1M-3M价差）
              </p>
            </div>
          </div>

          <div style={{ 
            background: 'white', 
            padding: '16px', 
            borderRadius: '8px',
            border: '2px solid var(--system-red-light)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <span style={{ fontSize: '1.5rem' }}>②</span>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--system-red)', margin: 0 }}>
                交易所可交割库存
              </h3>
            </div>
            <div style={{ fontSize: '0.95rem', lineHeight: '1.8', color: 'var(--text-primary)' }}>
              <p style={{ margin: '0 0 8px 0' }}>
                <strong>红灯条件：</strong>7 日降幅 &gt;10%
              </p>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                数据来源：<a href="https://www.cmegroup.com/markets/metals/precious/silver.html" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>CME 白银库存</a>（抄"Registered"数值）
              </p>
            </div>
          </div>

          <div style={{ 
            background: 'white', 
            padding: '16px', 
            borderRadius: '8px',
            border: '2px solid var(--system-red-light)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <span style={{ fontSize: '1.5rem' }}>③</span>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--system-red)', margin: 0 }}>
                1M 租借利率
              </h3>
            </div>
            <div style={{ fontSize: '0.95rem', lineHeight: '1.8', color: 'var(--text-primary)' }}>
              <p style={{ margin: '0 0 8px 0' }}>
                <strong>红灯条件：</strong>跳升至年化 &gt;3% 并维持
              </p>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                数据来源：<a href="https://www.kitco.com/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Kitco</a> 或 <a href="https://www.bloomberg.com/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Bloomberg SLVRRL1M</a>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 结果灯 */}
      <div style={{ 
        background: 'var(--system-green-light)', 
        border: '2px solid var(--system-green)', 
        borderRadius: '12px', 
        padding: '24px'
      }}>
        <h2 style={{ 
          fontSize: '1.5rem', 
          fontWeight: '700', 
          marginBottom: '12px', 
          color: 'var(--system-green)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span style={{ fontSize: '2rem' }}>✅</span>
          结果灯（只做确认，不做预测）
        </h2>
        <div style={{ 
          background: 'white', 
          padding: '16px', 
          borderRadius: '8px',
          border: '1px solid var(--system-green-light)'
        }}>
          <div style={{ fontSize: '0.95rem', lineHeight: '1.8', color: 'var(--text-primary)' }}>
            <p style={{ margin: '0 0 12px 0' }}>
              <strong style={{ color: 'var(--system-green)' }}>确认条件（满足任一即可）：</strong>
            </p>
            <ul style={{ margin: '0 0 12px 24px', padding: 0, lineHeight: '2' }}>
              <li>单日现货涨幅 &gt;5%</li>
              <li>隐含波动率 IV 突破 90 百分位</li>
            </ul>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic' }}>
              数据来源：SLV 30Δ Call IV（期权 IV）
            </p>
          </div>
        </div>
      </div>

      {/* 情景赔率 */}
      <div style={{ 
        background: 'var(--bg-secondary)', 
        border: '1px solid var(--system-gray3)', 
        borderRadius: '12px', 
        padding: '24px'
      }}>
        <h2 style={{ 
          fontSize: '1.5rem', 
          fontWeight: '700', 
          marginBottom: '16px', 
          color: 'var(--text-primary)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span style={{ fontSize: '2rem' }}>📊</span>
          情景赔率（1–8 周）
        </h2>
        <div style={{ 
          background: 'white', 
          padding: '16px', 
          borderRadius: '8px',
          border: '1px solid var(--border-subtle)'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '1.2rem', fontWeight: '700', color: 'var(--system-green)' }}>A</span>
              <span style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>继续冲：</span>
              <span style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)' }}>30%</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '1.2rem', fontWeight: '700', color: 'var(--accent-warm)' }}>B</span>
              <span style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>高位巨幅震荡：</span>
              <span style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)' }}>45%</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '1.2rem', fontWeight: '700', color: 'var(--system-red)' }}>C</span>
              <span style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>速跌≥20%：</span>
              <span style={{ fontSize: '1rem', fontWeight: '700', color: 'var(--text-primary)' }}>25%</span>
            </div>
          </div>
          <div style={{ 
            marginTop: '16px', 
            padding: '12px', 
            background: 'var(--accent-warm-soft)', 
            borderRadius: '6px',
            border: '1px solid var(--accent-warm)'
          }}>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--warm-ink)', fontWeight: '600' }}>
              💡 统一特征：波动率&gt;价格方向，优先用"波动工具"而非单边杠杆
            </p>
          </div>
        </div>
      </div>

      {/* 可落地的"非追高"打法 */}
      <div style={{ 
        background: 'var(--system-red-light)', 
        border: '2px solid var(--system-red)', 
        borderRadius: '12px', 
        padding: '24px'
      }}>
        <h2 style={{ 
          fontSize: '1.5rem', 
          fontWeight: '700', 
          marginBottom: '16px', 
          color: 'var(--system-red)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span style={{ fontSize: '2rem' }}>⚔️</span>
          可落地的"非追高"打法
        </h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* 期权 */}
          <div style={{ 
            background: 'white', 
            padding: '16px', 
            borderRadius: '8px',
            border: '1px solid var(--system-red-light)'
          }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '12px', color: 'var(--system-red)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.3rem' }}>1️⃣</span>
              期权（资金占比≤10%，IV 极高时改用价差）
            </h3>
            <div style={{ fontSize: '0.95rem', lineHeight: '1.8', color: 'var(--text-primary)' }}>
              <p style={{ margin: '0 0 8px 0' }}>
                <strong>方向中性：</strong>宽跨式+逢 IV&gt;90 百分位逐步减仓
              </p>
              <p style={{ margin: 0 }}>
                <strong>方向偏多：</strong>等速跌 20% 后买看涨价差，最大亏损=净权利金
              </p>
            </div>
          </div>

          {/* 现货/ETF */}
          <div style={{ 
            background: 'white', 
            padding: '16px', 
            borderRadius: '8px',
            border: '1px solid var(--system-red-light)'
          }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '12px', color: 'var(--system-red)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.3rem' }}>2️⃣</span>
              现货/ETF
            </h3>
            <div style={{ fontSize: '0.95rem', lineHeight: '1.8', color: 'var(--text-primary)' }}>
              <p style={{ margin: 0 }}>
                只在"红灯熄一盏+回撤 20–30%"时分 <strong>3 批买入</strong>，每批止损设在再跌 8%
              </p>
            </div>
          </div>

          {/* 矿股 */}
          <div style={{ 
            background: 'white', 
            padding: '16px', 
            borderRadius: '8px',
            border: '1px solid var(--system-red-light)'
          }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '12px', color: 'var(--system-red)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.3rem' }}>3️⃣</span>
              矿股（PAAS 等）
            </h3>
            <div style={{ fontSize: '0.95rem', lineHeight: '1.8', color: 'var(--text-primary)' }}>
              <p style={{ margin: 0 }}>
                仅做"超跌反弹"——股价跌破 <strong>200D MA</strong> 且现货跌停当日收盘抢入，<strong>3 日内无反弹 5% 即砍</strong>
              </p>
            </div>
          </div>

          {/* 资金纪律 */}
          <div style={{ 
            background: 'var(--system-red-light)', 
            padding: '16px', 
            borderRadius: '8px',
            border: '2px solid var(--system-red)'
          }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '12px', color: 'var(--system-red)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '1.3rem' }}>4️⃣</span>
              资金纪律
            </h3>
            <div style={{ fontSize: '0.95rem', lineHeight: '1.8', color: 'var(--text-primary)' }}>
              <ul style={{ margin: '0 0 0 20px', padding: 0, lineHeight: '2' }}>
                <li>单笔风险≤账户净值 <strong>1%</strong></li>
                <li>总敞口≤<strong>30%</strong></li>
                <li>红灯两亮即强制降到 <strong>10%</strong></li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* 每日 3 分钟检查表 */}
      <div style={{ 
        background: 'var(--system-green-light)', 
        border: '2px solid var(--system-green)', 
        borderRadius: '12px', 
        padding: '24px'
      }}>
        <h2 style={{ 
          fontSize: '1.5rem', 
          fontWeight: '700', 
          marginBottom: '16px', 
          color: 'var(--system-green)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span style={{ fontSize: '2rem' }}>✅</span>
          每日 3 分钟检查表
        </h2>
        <div style={{ 
          background: 'white', 
          padding: '16px', 
          borderRadius: '8px',
          border: '1px solid var(--system-green-light)'
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <span style={{ fontSize: '1.2rem' }}>•</span>
              <div style={{ flex: 1 }}>
                <strong style={{ color: 'var(--system-green)' }}>CME 白银库存</strong>
                <a href="https://www.cmegroup.com/markets/metals/precious/silver.html" target="_blank" rel="noopener noreferrer" style={{ marginLeft: '8px', fontSize: '0.85rem', color: 'var(--accent)', textDecoration: 'underline' }}>（链接 bookmark）</a>
                <span style={{ marginLeft: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>→ 抄"Registered"数值</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <span style={{ fontSize: '1.2rem' }}>•</span>
              <div style={{ flex: 1 }}>
                <strong style={{ color: 'var(--system-green)' }}>近月-远月价差</strong>
                <span style={{ marginLeft: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>（TradingView 连续合约）→ 截 1M-3M 升水</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <span style={{ fontSize: '1.2rem' }}>•</span>
              <div style={{ flex: 1 }}>
                <strong style={{ color: 'var(--system-green)' }}>租借利率</strong>
                <span style={{ marginLeft: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>（Kitco 或 Bloomberg SLVRRL1M）&gt;3% 画红</span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <span style={{ fontSize: '1.2rem' }}>•</span>
              <div style={{ flex: 1 }}>
                <strong style={{ color: 'var(--system-green)' }}>期权 IV</strong>
                <span style={{ marginLeft: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>（SLV 30Δ Call IV）&gt;90 百分位截屏</span>
              </div>
            </div>
          </div>
          <div style={{ 
            marginTop: '16px', 
            padding: '12px', 
            background: 'var(--system-red-light)', 
            borderRadius: '6px',
            border: '1px solid var(--system-red-light)'
          }}>
            <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--system-red)', fontWeight: '600' }}>
              ⚠️ 任意两项异常，把持仓减到"睡眠仓"
            </p>
          </div>
        </div>
      </div>

      {/* 一句话总结 */}
      <div style={{ 
        background: 'var(--accent-warm-soft)', 
        border: '2px solid var(--accent-warm)', 
        borderRadius: '12px', 
        padding: '24px'
      }}>
        <h2 style={{ 
          fontSize: '1.5rem', 
          fontWeight: '700', 
          marginBottom: '16px', 
          color: 'var(--warm-ink)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span style={{ fontSize: '2rem' }}>💡</span>
          一句话总结
        </h2>
        <div style={{ 
          background: 'white', 
          padding: '20px', 
          borderRadius: '8px',
          border: '1px solid var(--accent-warm)'
        }}>
          <p style={{ 
            margin: 0, 
            fontSize: '1.1rem', 
            lineHeight: '1.8', 
            color: 'var(--text-primary)',
            fontWeight: '500',
            fontStyle: 'italic'
          }}>
            把"涨/跌"换成"波动+逼空灯"；用期权结构替代高杠杆期货；只在红灯熄灭+深回撤时分批捡，不追阳线。
          </p>
        </div>
      </div>
    </div>
  )
}

