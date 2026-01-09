import React from 'react'
import {
  tableWrapperStyle,
  tableStyle,
  thStyle,
  tdStyle,
  highlightStyle,
  contentStyle,
  getTrStyle,
  getTrHoverStyle
} from './TableStyles'

export default function Investment2026AI(): JSX.Element {
  const mobileContentStyle: React.CSSProperties = {
    ...contentStyle
  }

  const holdings = [
    { id: 1, level: 'A核心', name: '汉得信息', code: '300170.SZ', market: '深交所', weight: '25%', scene: '企业智能体"燕"', certainty: '⭐⭐⭐⭐⭐' },
    { id: 2, level: 'A核心', name: '金山办公', code: '688111.SH', market: '科创板', weight: '15%', scene: 'WPS AI 2.0办公Agent', certainty: '⭐⭐⭐⭐⭐' },
    { id: 3, level: 'B主线', name: '致远互联', code: '688369.SH', market: '科创板', weight: '9%', scene: 'AI-COP协同运营Agent', certainty: '⭐⭐⭐⭐☆' },
    { id: 4, level: 'B主线', name: '科大讯飞', code: '002230.SZ', market: '深交所', weight: '7%', scene: '教育/医疗/城市Agent', certainty: '⭐⭐⭐⭐' },
    { id: 5, level: 'B主线', name: '鼎捷数智', code: '300378.SZ', market: '深交所', weight: '7%', scene: '工业智能排产Agent', certainty: '⭐⭐⭐⭐☆' },
    { id: 6, level: 'B主线', name: '润达医疗', code: '603108.SH', market: '上交所', weight: '3%', scene: '临床检验Agent"慧检"', certainty: '⭐⭐⭐⭐' },
    { id: 7, level: 'B主线', name: '拓尔思', code: '300229.SZ', market: '创业板', weight: '2%', scene: '政务舆情/投研Agent', certainty: '⭐⭐⭐' },
    { id: 8, level: 'C弹性', name: '蓝色光标', code: '300058.SZ', market: '深交所', weight: '8%', scene: '字节营销/出海Agent', certainty: '⭐⭐⭐⭐' },
    { id: 9, level: 'C弹性', name: '焦点科技', code: '002315.SZ', market: '深交所', weight: '5%', scene: '外贸AI Agent', certainty: '⭐⭐⭐' },
    { id: 10, level: 'C弹性', name: '酷特智能', code: '300840.SZ', market: '创业板', weight: '4%', scene: '华为智能产线Agent', certainty: '⭐⭐⭐' },
    { id: 11, level: 'C弹性', name: '彩讯股份', code: '300634.SZ', market: '创业板', weight: '3%', scene: '华为邮箱Agent', certainty: '⭐⭐⭐' },
    { id: 12, level: 'D医药', name: '药明康德', code: '603259.SH', market: '上交所', weight: '4%', scene: 'AI+CRO平台', certainty: '⭐⭐⭐⭐' },
    { id: 13, level: 'D医药', name: '成都先导', code: '688222.SH', market: '科创板', weight: '3%', scene: 'DEL库AI筛选', certainty: '⭐⭐⭐⭐' },
    { id: 14, level: 'D医药', name: '美迪西', code: '688202.SH', market: '科创板', weight: '3%', scene: 'AI毒理CDMO', certainty: '⭐⭐⭐⭐' }
  ]

  return (
    <div style={mobileContentStyle} className="mainland-content">
      <style>{`
        @media (max-width: 768px) {
          .mainland-content {
            padding: 20px 16px !important;
          }
          .mainland-content h2 {
            font-size: 1.4rem !important;
          }
          .mainland-content h3 {
            font-size: 1.2rem !important;
          }
          .mainland-content h4 {
            font-size: 1rem !important;
          }
          .mainland-content table {
            font-size: 0.8rem !important;
          }
          .mainland-content th,
          .mainland-content td {
            padding: 8px 6px !important;
          }
        }
        .mainland-content table tbody tr:hover {
          background: #f0f4ff !important;
          transform: scale(1.002);
          box-shadow: 0 2px 8px rgba(102, 126, 234, 0.1);
        }
      `}</style>
      
      <h2 style={{ fontSize: '1.8rem', marginBottom: '24px', color: '#1f2937' }}>
        🎯 中国AI-Agent与AI创新药投资组合终极版
      </h2>

      <h3 style={{ fontSize: '1.4rem', marginTop: '32px', marginBottom: '16px', color: '#374151' }}>
        📋 完整持仓清单（14只，100%配置）
      </h3>
      <div style={tableWrapperStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>序号</th>
              <th style={thStyle}>层级</th>
              <th style={thStyle}>股票名称</th>
              <th style={thStyle}>代码</th>
              <th style={thStyle}>市场</th>
              <th style={thStyle}>仓位</th>
              <th style={thStyle}>AI场景</th>
              <th style={thStyle}>2026确定性</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((item, index) => (
              <tr key={item.id} style={getTrStyle(index % 2 === 0)}>
                <td style={tdStyle}>{item.id}</td>
                <td style={{...tdStyle, fontWeight: '600', color: '#667eea'}}><strong>{item.level}</strong></td>
                <td style={{...tdStyle, fontWeight: '600'}}>{item.name}</td>
                <td style={tdStyle}>{item.code}</td>
                <td style={tdStyle}>{item.market}</td>
                <td style={tdStyle}>
                  <span style={highlightStyle}><strong>{item.weight}</strong></span>
                </td>
                <td style={tdStyle}>{item.scene}</td>
                <td style={tdStyle}>{item.certainty}</td>
              </tr>
            ))}
            <tr style={{ background: '#f3f4f6', fontWeight: '600' }}>
              <td style={tdStyle} colSpan={3}><strong>合计</strong></td>
              <td style={tdStyle}><strong>14只</strong></td>
              <td style={tdStyle}></td>
              <td style={tdStyle}>
                <span style={highlightStyle}><strong>100%</strong></span>
              </td>
              <td style={tdStyle} colSpan={2}></td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3 style={{ fontSize: '1.4rem', marginTop: '48px', marginBottom: '16px', color: '#374151' }}>
        🏗️ 四层金字塔架构
      </h3>
      <div style={{
        background: '#f9fafb',
        padding: '24px',
        borderRadius: '12px',
        fontFamily: 'monospace',
        fontSize: '0.9rem',
        lineHeight: '2',
        marginTop: '16px'
      }}>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontWeight: '600', marginBottom: '8px' }}>💎 A核心底仓 40%</div>
          <div style={{ borderTop: '2px solid #667eea', paddingTop: '8px', marginBottom: '16px' }}>
            汉得信息 25% + 金山办公 15%<br/>
            → 商业闭环已跑通，2026业绩确定
          </div>
        </div>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontWeight: '600', marginBottom: '8px' }}>🚀 B主线成长 28%</div>
          <div style={{ borderTop: '2px solid #667eea', paddingTop: '8px', marginBottom: '16px' }}>
            致远9% + 科大7% + 鼎捷7% + 润达3% + 拓尔思2%<br/>
            → 订单验证期，放量路径清晰
          </div>
        </div>
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontWeight: '600', marginBottom: '8px' }}>⚡ C弹性进攻 20%</div>
          <div style={{ borderTop: '2px solid #667eea', paddingTop: '8px', marginBottom: '16px' }}>
            蓝色8% + 焦点5% + 酷特4% + 彩讯3%<br/>
            → 高Beta，绑定大厂/海外/新场景
          </div>
        </div>
        <div>
          <div style={{ fontWeight: '600', marginBottom: '8px' }}>🏥 D医药对冲 10%</div>
          <div style={{ borderTop: '2px solid #667eea', paddingTop: '8px' }}>
            药明4% + 成都3% + 美迪西3%<br/>
            → 低相关性，平滑组合波动
          </div>
        </div>
      </div>

      <h3 style={{ fontSize: '1.4rem', marginTop: '48px', marginBottom: '16px', color: '#374151' }}>
        🎯 三种配置方案
      </h3>

      {[
        { title: '方案1️⃣：进取型（最大弹性）', data: [
          { level: 'A核心', ratio: '30%', desc: '能接受20%+回撤' },
          { level: 'B主线', ratio: '25%', desc: '风险承受力强' },
          { level: 'C弹性', ratio: '35%', desc: '追求最大收益' },
          { level: 'D医药', ratio: '10%', desc: '' }
        ]},
        { title: '方案2️⃣：平衡型（推荐⭐）', data: [
          { level: 'A核心', ratio: '40%', desc: '确定性与弹性平衡', highlight: true },
          { level: 'B主线', ratio: '28%', desc: '中等风险偏好', highlight: true },
          { level: 'C弹性', ratio: '20%', desc: '主流投资者', highlight: true },
          { level: 'D医药', ratio: '10%', desc: '', highlight: true }
        ]},
        { title: '方案3️⃣：保守型（防守优先）', data: [
          { level: 'A核心', ratio: '50%', desc: '低风险偏好' },
          { level: 'B主线', ratio: '30%', desc: '以防守为主' },
          { level: 'C弹性', ratio: '10%', desc: '不追求高弹性' },
          { level: 'D医药', ratio: '10%', desc: '' }
        ]}
      ].map((scheme, idx) => (
        <div key={idx}>
          <h4 style={{ fontSize: '1.2rem', marginTop: idx === 0 ? '24px' : '32px', marginBottom: '12px', color: '#4b5563' }}>
            {scheme.title}
          </h4>
          <div style={tableWrapperStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}>层级</th>
                  <th style={thStyle}>配比</th>
                  <th style={thStyle}>适合人群</th>
                </tr>
              </thead>
              <tbody>
                {scheme.data.map((item, i) => (
                  <tr key={i} style={getTrStyle(i % 2 === 0)}>
                    <td style={tdStyle}>{item.level}</td>
                    <td style={tdStyle}>
                      {item.highlight ? (
                        <span style={highlightStyle}><strong>{item.ratio}</strong></span>
                      ) : (
                        item.ratio
                      )}
                    </td>
                    <td style={tdStyle}>{item.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      <h3 style={{ fontSize: '1.4rem', marginTop: '48px', marginBottom: '16px', color: '#374151' }}>
        ⏰ 操作节奏建议
      </h3>
      <ul style={{ lineHeight: '2', paddingLeft: '24px' }}>
        <li style={{ marginBottom: '12px' }}>
          <strong>✅ 立即可进（估值+基本面安全）</strong><br/>
          汉得信息、致远互联、鼎捷数智、蓝色光标、润达医疗
        </li>
        <li style={{ marginBottom: '12px' }}>
          <strong>⏸️ 等回调10%再进（短期涨幅过大）</strong><br/>
          金山办公、科大讯飞
        </li>
        <li style={{ marginBottom: '12px' }}>
          <strong>📊 分批建仓（波动较大）</strong><br/>
          焦点科技、酷特智能、彩讯股份
        </li>
        <li>
          <strong>🏥 长期持有型（对冲仓）</strong><br/>
          药明康德、成都先导、美迪西
        </li>
      </ul>

      <h3 style={{ fontSize: '1.4rem', marginTop: '48px', marginBottom: '16px', color: '#374151' }}>
        💡 组合核心逻辑
      </h3>
      <div style={{
        background: '#f9fafb',
        padding: '20px',
        borderRadius: '12px',
        marginBottom: '24px'
      }}>
        <p style={{ marginBottom: '12px', lineHeight: '1.8' }}>
          <strong>筛选标准</strong>：订单可见 + 业绩可验证 + 估值合理（PEG≤1.5）
        </p>
        <p style={{ margin: '0', lineHeight: '1.8' }}>
          <strong>场景覆盖</strong>：办公、企业、工业、营销、外贸、医疗、制药
        </p>
      </div>

      <h3 style={{ fontSize: '1.4rem', marginTop: '48px', marginBottom: '16px', color: '#374151' }}>
        ⚠️ 风险提示
      </h3>
      <div style={tableWrapperStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>风险类型</th>
              <th style={thStyle}>具体内容</th>
              <th style={thStyle}>应对策略</th>
            </tr>
          </thead>
          <tbody>
            {[
              { type: '技术迭代', content: 'AI技术路线快速演进', strategy: '分散到7大场景' },
              { type: '订单波动', content: 'B/C组依赖大客户', strategy: 'A组40%托底' },
              { type: '估值压缩', content: '科技股估值弹性大', strategy: 'D组10%对冲' },
              { type: '地缘政治', content: '药明等涉及国际业务', strategy: '仅配4%，可控' }
            ].map((item, i) => (
              <tr key={i} style={getTrStyle(i % 2 === 0)}>
                <td style={tdStyle}><strong>{item.type}</strong></td>
                <td style={tdStyle}>{item.content}</td>
                <td style={tdStyle}>{item.strategy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ fontSize: '1.4rem', marginTop: '48px', marginBottom: '16px', color: '#374151' }}>
        🔑 一句话总结
      </h3>
      <div style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: '#fff',
        padding: '24px',
        borderRadius: '12px',
        fontSize: '1.1rem',
        lineHeight: '1.8',
        marginTop: '16px'
      }}>
        <strong>这是一个「能进攻、能防守、能拿住」的2026 AI-Agent投资组合</strong><br/>
        核心是：订单在手 + 业绩能验 + 估值合理
      </div>

      <div style={{
        marginTop: '48px',
        padding: '24px',
        background: '#f3f4f6',
        borderRadius: '12px',
        fontSize: '0.9rem',
        color: '#6b7280',
        textAlign: 'center'
      }}>
        <p style={{ margin: '0 0 8px 0' }}>
          <strong>本组合仅供参考，不构成投资建议</strong>
        </p>
        <p style={{ margin: '0 0 8px 0' }}>
          <strong>投资有风险，入市需谨慎</strong>
        </p>
        <p style={{ margin: '0' }}>
          <em>最后更新：2026年1月</em><br/>
          <em>数据来源：Wind、公司公告</em>
        </p>
      </div>
    </div>
  )
}
