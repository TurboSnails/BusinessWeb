import React from 'react'

export const OverviewTab: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* 投资总纲 */}
      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '12px', padding: '24px' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '16px', color: '#1e40af', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '2rem' }}>🎯</span>
          投资总纲（2026）
        </h2>
        
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#1f2937' }}>目标</h3>
          <p style={{ fontSize: '0.95rem', lineHeight: '1.8', color: '#374151', marginBottom: '12px' }}>
            在可能出现的 2026 年美股中大级别回撤中，尽量避开主要跌幅，并在「极度恐慌—错杀」阶段分批建仓，获得中长期收益。
          </p>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#1f2937' }}>核心资产</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '12px' }}>
            <div style={{ background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
              <div style={{ fontWeight: '600', marginBottom: '4px', color: '#1f2937' }}>指数与权重股</div>
              <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>NVDA 等美股核心成长</div>
            </div>
            <div style={{ background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
              <div style={{ fontWeight: '600', marginBottom: '4px', color: '#1f2937' }}>杠杆放大器</div>
              <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>YINN（仅限趋势阶段）</div>
            </div>
            <div style={{ background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
              <div style={{ fontWeight: '600', marginBottom: '4px', color: '#1f2937' }}>贵金属与矿企</div>
              <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>黄金仓位 + PAAS</div>
            </div>
            <div style={{ background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
              <div style={{ fontWeight: '600', marginBottom: '4px', color: '#1f2937' }}>卫星仓</div>
              <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>RKLB 等高 Beta 小票（仅在特定阶段参与）</div>
            </div>
          </div>
        </div>

        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#1f2937' }}>适用人群</h3>
          <p style={{ fontSize: '0.95rem', lineHeight: '1.8', color: '#374151' }}>
            能承受中等回撤，有一定期权与衍生品概念，习惯按规则执行的主动投资者。
          </p>
        </div>
      </div>

      {/* 资产角色定义 */}
      <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '12px', padding: '24px' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '16px', color: '#166534', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '2rem' }}>📦</span>
          资产角色定义
        </h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          {[
            { name: '黄金', symbol: 'GOLD', type: '商品', icon: '🥇' },
            { name: '亚马逊', symbol: 'AMZN', type: '股票', icon: '📦' },
            { name: '联合健康', symbol: 'UNH', type: '股票', icon: '🏥' },
            { name: '舜宇光学', symbol: '2382.HK', type: '股票', icon: '📷' },
            { name: '美光科技', symbol: 'MU', type: '股票', icon: '💾' },
            { name: 'Adtalem', symbol: 'ATGE', type: '股票', icon: '📚' },
            { name: '诺和诺德', symbol: 'NVO', type: '股票', icon: '💊' },
            { name: 'Booz Allen', symbol: 'BAH', type: '股票', icon: '🛡️' },
            { name: '比亚迪', symbol: '002594.SZ', type: '股票', icon: '🚗' }
          ].map((asset, index) => (
            <div key={index} style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #d1fae5' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '1.5rem' }}>{asset.icon}</span>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: '#1f2937', flex: 1 }}>{asset.name}</h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.85rem', color: '#6b7280', background: '#f3f4f6', padding: '4px 8px', borderRadius: '4px' }}>{asset.symbol}</span>
                <span style={{ fontSize: '0.85rem', color: '#6b7280', background: '#f3f4f6', padding: '4px 8px', borderRadius: '4px' }}>{asset.type}</span>
              </div>
              <div style={{ fontSize: '0.9rem', color: '#166534', fontWeight: '600', textAlign: 'center', padding: '6px', background: '#f0fdf4', borderRadius: '4px' }}>
                权重: 1/9
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

