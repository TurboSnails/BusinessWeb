import React from 'react'

export const IndicatorsTab: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* 指标体系与优先级 */}
      <div style={{ background: 'var(--accent-soft)', border: '1px solid var(--accent-soft)', borderRadius: '12px', padding: '24px' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '16px', color: 'var(--accent-ink)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '2rem' }}>📊</span>
          指标体系与优先级
        </h2>
        
        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: 'var(--text-primary)' }}>一级指标（核心灵魂）</h3>
          <div style={{ background: 'var(--system-red-light)', border: '1px solid var(--system-red-light)', borderRadius: '8px', padding: '16px', marginBottom: '12px' }}>
            <div style={{ fontWeight: '600', marginBottom: '8px', color: 'var(--system-red)' }}>🥇 Equity Put/Call Ratio</div>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '12px' }}>
              散户情绪"体温计"，用于识别极度恐慌与过度乐观，确认抄底时机。
            </p>
          </div>
          <div style={{ background: 'var(--system-red-light)', border: '1px solid var(--system-red-light)', borderRadius: '8px', padding: '16px' }}>
            <div style={{ fontWeight: '600', marginBottom: '8px', color: 'var(--system-red)' }}>🥈 Net GEX</div>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
              判断是否进入负 Gamma 崩盘区，决定是否禁止加仓高 Beta。
            </p>
          </div>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: 'var(--text-primary)' }}>二级指标（辅助验证）</h3>
          <div style={{ background: 'var(--accent-warm-soft)', border: '1px solid var(--accent-warm-soft)', borderRadius: '8px', padding: '16px', marginBottom: '12px' }}>
            <div style={{ fontWeight: '600', marginBottom: '8px', color: 'var(--accent-warm)' }}>🥉 SPX Put/Call Ratio</div>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)', marginBottom: '12px' }}>
              机构对冲意愿变化，辅助判断"防弹衣是否已脱"。
            </p>
          </div>
          <div style={{ background: 'var(--accent-warm-soft)', border: '1px solid var(--accent-warm-soft)', borderRadius: '8px', padding: '16px' }}>
            <div style={{ fontWeight: '600', marginBottom: '8px', color: 'var(--accent-warm)' }}>4️⃣ VIX 及其期限结构</div>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
              观察恐慌程度与期限倒挂。
            </p>
          </div>
        </div>

        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: 'var(--text-primary)' }}>三级指标（专项工具）</h3>
          <div style={{ background: 'var(--system-green-light)', border: '1px solid var(--system-green-light)', borderRadius: '8px', padding: '16px' }}>
            <div style={{ fontWeight: '600', marginBottom: '8px', color: 'var(--system-green)' }}>5️⃣ 金银比（Gold/Silver Ratio）</div>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
              用于在极端错价时调整黄金与白银矿仓位。
            </p>
          </div>
        </div>
      </div>

      {/* 指标阈值与行动表格 */}
      <div style={{ background: 'white', border: '2px solid var(--accent)', borderRadius: '12px', padding: '24px' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '20px', color: 'var(--accent-ink)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '2rem' }}>📋</span>
          指标阈值与行动表
        </h2>
        
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ background: 'var(--accent-soft)', borderBottom: '2px solid var(--accent)' }}>
                <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: 'var(--accent-ink)' }}>指标</th>
                <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: 'var(--accent-ink)' }}>条件</th>
                <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: 'var(--accent-ink)' }}>动作</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={{ padding: '12px', fontWeight: '600', color: 'var(--text-primary)' }}>Equity Put/Call Ratio</td>
                <td style={{ padding: '12px', color: 'var(--text-primary)' }}>0.5 &lt; P/C &lt; 0.8</td>
                <td style={{ padding: '12px', color: 'var(--text-primary)' }}>情绪偏乐观，维持持仓，不再加仓高 Beta</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--system-red-light)' }}>
                <td style={{ padding: '12px', fontWeight: '600', color: 'var(--text-primary)' }}>Equity Put/Call Ratio</td>
                <td style={{ padding: '12px', color: 'var(--text-primary)' }}>P/C ≥ 1.1</td>
                <td style={{ padding: '12px', color: 'var(--system-red)', fontWeight: '600' }}>极度恐慌，启动 1/8 现金抄底 PAAS，如已持有则只加仓高分散度标的</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={{ padding: '12px', fontWeight: '600', color: 'var(--text-primary)' }}>SPX Put/Call Ratio</td>
                <td style={{ padding: '12px', color: 'var(--text-primary)' }}>SPX P/C &lt; 0.9 且指数创新高</td>
                <td style={{ padding: '12px', color: 'var(--text-primary)' }}>视为机构对冲意愿下降，逐步减仓 YINN/NVDA</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: 'var(--system-red-light)' }}>
                <td style={{ padding: '12px', fontWeight: '600', color: 'var(--text-primary)' }}>Net GEX</td>
                <td style={{ padding: '12px', color: 'var(--text-primary)' }}>进入明显负 Gamma 区</td>
                <td style={{ padding: '12px', color: 'var(--system-red)', fontWeight: '600' }}>禁止加仓高 Beta（RKLB/YINN 等），只允许减仓或对冲</td>
              </tr>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <td style={{ padding: '12px', fontWeight: '600', color: 'var(--text-primary)' }}>金银比</td>
                <td style={{ padding: '12px', color: 'var(--text-primary)' }}>GSR &gt; 85–90</td>
                <td style={{ padding: '12px', color: 'var(--text-primary)' }}>白银相对极度便宜，可把部分黄金敞口换成 PAAS 分批买入</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

