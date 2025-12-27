import React from 'react'

const InvestmentTargets: React.FC = () => {
  // 投资标的列表
  const targets = [
    { symbol: 'LLY', name: '礼来', category: 'stock' },
    { symbol: 'AXP', name: '美国运通', category: 'stock' },
    { symbol: 'GOOGL', name: '谷歌', category: 'stock' },
    { symbol: 'TSM', name: '台积电', category: 'stock' },
    { symbol: 'PAAS', name: 'Pan American Silver', category: 'stock' },
    { symbol: 'RKLB', name: 'Rocket Lab', category: 'stock' },
    { symbol: 'GOLD', name: '黄金', category: 'commodity' }
  ]

  return (
    <section className="card" style={{ marginBottom: '16px' }}>
      <h2 style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '1rem' }}>
        <span>📈</span>
        长期看好的公司
      </h2>
      
      <div style={{ overflowX: 'auto', marginTop: '8px' }}>
        <table style={{ 
          width: '100%', 
          borderCollapse: 'collapse',
          fontSize: '0.85rem'
        }}>
          <thead>
            <tr style={{ 
              background: '#f9fafb', 
              borderBottom: '1px solid #e5e7eb' 
            }}>
              <th style={{ 
                padding: '6px 8px', 
                textAlign: 'left', 
                fontWeight: '600', 
                color: '#374151',
                fontSize: '0.8rem'
              }}>
                代码
              </th>
              <th style={{ 
                padding: '6px 8px', 
                textAlign: 'left', 
                fontWeight: '600', 
                color: '#374151',
                fontSize: '0.8rem'
              }}>
                名称
              </th>
              <th style={{ 
                padding: '6px 8px', 
                textAlign: 'left', 
                fontWeight: '600', 
                color: '#374151',
                fontSize: '0.8rem'
              }}>
                类型
              </th>
            </tr>
          </thead>
          <tbody>
            {targets.map((target, index) => (
              <tr
                key={target.symbol}
                style={{
                  borderBottom: '1px solid #e5e7eb',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#f9fafb'
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                <td style={{ padding: '6px 8px', fontWeight: '600', color: '#1f2937', fontSize: '0.85rem' }}>
                  {target.symbol}
                </td>
                <td style={{ padding: '6px 8px', color: '#374151', fontSize: '0.85rem' }}>
                  {target.name}
                </td>
                <td style={{ padding: '6px 8px' }}>
                  <span style={{
                    padding: '2px 6px',
                    background: target.category === 'stock' ? '#eff6ff' : '#fef3c7',
                    color: target.category === 'stock' ? '#1e40af' : '#92400e',
                    borderRadius: '3px',
                    fontSize: '0.75rem',
                    fontWeight: '500'
                  }}>
                    {target.category === 'stock' ? '股票' : '商品'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default InvestmentTargets

