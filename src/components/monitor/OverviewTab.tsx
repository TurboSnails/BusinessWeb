import React from 'react'

export const OverviewTab: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* 投资总纲 */}
      <div style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-soft)', borderRadius: '12px', padding: '24px' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '16px', color: 'var(--accent-ink)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '2rem' }}>🎯</span>
          投资总纲（2026）
        </h2>
        
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: 'var(--text-primary)' }}>目标</h3>
          <p style={{ fontSize: '0.95rem', lineHeight: '1.8', color: 'var(--text-primary)', marginBottom: '12px' }}>
            通过全球多元化配置（美股+港股+A股+商品），采用等权分散策略降低单一资产风险，在宏观不确定性中寻求稳健收益。
          </p>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: 'var(--text-primary)' }}>核心资产（等权配置 各1/9）</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '12px' }}>
            <div style={{ background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontWeight: '600', marginBottom: '4px', color: 'var(--text-primary)' }}>🥇 避险资产</div>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>黄金（GOLD）</div>
            </div>
            <div style={{ background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontWeight: '600', marginBottom: '4px', color: 'var(--text-primary)' }}>🏥 医疗健康</div>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>联合健康（UNH）、诺和诺德（NVO）</div>
            </div>
            <div style={{ background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontWeight: '600', marginBottom: '4px', color: 'var(--text-primary)' }}>💾 科技半导体</div>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>亚马逊（AMZN）、美光（MU）、舜宇光学（2382.HK）</div>
            </div>
            <div style={{ background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontWeight: '600', marginBottom: '4px', color: 'var(--text-primary)' }}>🛡️ 防御成长</div>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Adtalem（ATGE）、Booz Allen（BAH）</div>
            </div>
            <div style={{ background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
              <div style={{ fontWeight: '600', marginBottom: '4px', color: 'var(--text-primary)' }}>🚗 新能源车</div>
              <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>比亚迪（002594.SZ）</div>
            </div>
          </div>
        </div>

        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: 'var(--text-primary)' }}>策略特点</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            <span style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)', padding: '6px 12px', borderRadius: '6px', fontSize: '0.9rem', fontWeight: '500' }}>等权配置 1/9</span>
            <span style={{ background: 'var(--system-green-light)', color: 'var(--down-ink)', padding: '6px 12px', borderRadius: '6px', fontSize: '0.9rem', fontWeight: '500' }}>全球多元化</span>
            <span style={{ background: 'var(--accent-warm-soft)', color: 'var(--warm-ink)', padding: '6px 12px', borderRadius: '6px', fontSize: '0.9rem', fontWeight: '500' }}>跨市场配置</span>
            <span style={{ background: 'var(--bg-secondary)', color: 'var(--system-purple)', padding: '6px 12px', borderRadius: '6px', fontSize: '0.9rem', fontWeight: '500' }}>行业分散</span>
          </div>
        </div>
      </div>

      {/* 资产角色定义 */}
      <div style={{ background: 'var(--system-green-light)', border: '1px solid var(--system-green-light)', borderRadius: '12px', padding: '24px' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '16px', color: 'var(--down-ink)', display: 'flex', alignItems: 'center', gap: '8px' }}>
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
            <div key={index} style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid var(--system-green-light)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ fontSize: '1.5rem' }}>{asset.icon}</span>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '600', color: 'var(--text-primary)', flex: 1 }}>{asset.name}</h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', padding: '4px 8px', borderRadius: '4px' }}>{asset.symbol}</span>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', background: 'var(--bg-secondary)', padding: '4px 8px', borderRadius: '4px' }}>{asset.type}</span>
              </div>
              <div style={{ fontSize: '0.9rem', color: 'var(--down-ink)', fontWeight: '600', textAlign: 'center', padding: '6px', background: 'var(--system-green-light)', borderRadius: '4px' }}>
                权重: 1/9
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

