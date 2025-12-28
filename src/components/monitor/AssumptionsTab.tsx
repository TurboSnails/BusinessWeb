import React from 'react'

export const AssumptionsTab: React.FC = () => {
  return (
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
  )
}

