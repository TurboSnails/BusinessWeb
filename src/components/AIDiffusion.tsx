import React from 'react'
import {
  tableWrapperStyle,
  tableStyle,
  thStyle,
  tdStyle,
  contentStyle,
  getTrStyle
} from './TableStyles'

export default function AIDiffusion(): JSX.Element {
  const mobileContentStyle: React.CSSProperties = {
    ...contentStyle
  }

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
        AI行情扩散 - 核心标的推荐
      </h2>

      <div style={{
        background: '#f0f9ff',
        padding: '20px',
        borderRadius: '12px',
        marginBottom: '32px',
        borderLeft: '4px solid #3b82f6'
      }}>
        <p style={{ margin: '0 0 8px 0', fontWeight: '600' }}>
          <strong>市场背景</strong>：AI行情正从单一算力炒作转向"基建→终端→应用"的全面扩散阶段
        </p>
        <p style={{ margin: '0 0 8px 0' }}>
          <strong>投资逻辑</strong>：确定性排序为 基建（液冷/电力）&gt; 垂直应用 &gt; 终端设备 &gt; 硬科技补涨
        </p>
        <p style={{ margin: '0', color: '#6b7280', fontSize: '0.9rem' }}>
          <strong>时间节点</strong>：2026年1月，数据截至最新交易日
        </p>
      </div>

      {/* 一、AI基础设施 */}
      <h3 style={{ fontSize: '1.4rem', marginTop: '32px', marginBottom: '16px', color: '#374151' }}>
        📊 一、AI基础设施延伸：电力与液冷
      </h3>
      <p style={{ marginBottom: '16px', color: '#6b7280' }}>
        <strong>投资逻辑</strong>：GB300等高功耗服务器使单机柜功率向100kW迈进，液冷和电力已成数据中心刚需
      </p>
      <h4 style={{ fontSize: '1.2rem', marginTop: '24px', marginBottom: '12px', color: '#4b5563' }}>
        核心推荐（5只）
      </h4>
      <div style={tableWrapperStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>股票名称</th>
              <th style={thStyle}>代码</th>
              <th style={thStyle}>核心优势</th>
              <th style={thStyle}>2026预期</th>
              <th style={thStyle}>风险提示</th>
            </tr>
          </thead>
          <tbody>
            {[
              { name: '英维克', code: '002837', advantage: '液冷温控龙头，深度绑定华为/字节', expect: '营收+25%', risk: '竞争加剧' },
              { name: '曙光数创', code: '872808', advantage: 'AI超算液冷总包，市占率35%+', expect: '订单+40%', risk: '北交所流动性' },
              { name: '中石科技', code: '300684', advantage: '液态金属液冷板独供，价值量提升10倍', expect: '毛利率提升', risk: '技术迭代' },
              { name: '申菱环境', code: '301018', advantage: 'CDA冷却分配单元+浸没式散热', expect: '营收+20%', risk: '客户集中度高' },
              { name: '思源电气', code: '002028', advantage: 'AI数据中心变压器，出海订单饱满', expect: '海外收入+30%', risk: '汇率波动' }
            ].map((item, i) => (
              <tr key={i} style={getTrStyle(i % 2 === 0)}>
                <td style={{...tdStyle, fontWeight: '600'}}><strong>{item.name}</strong></td>
                <td style={tdStyle}>{item.code}</td>
                <td style={tdStyle}>{item.advantage}</td>
                <td style={tdStyle}>{item.expect}</td>
                <td style={tdStyle}>{item.risk}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ marginTop: '12px', color: '#6b7280', fontSize: '0.9rem' }}>
        <strong>补充标的</strong>：科华数据(002335)、飞荣达(300602)
      </p>

      {/* 二、AI终端 */}
      <h3 style={{ fontSize: '1.4rem', marginTop: '48px', marginBottom: '16px', color: '#374151' }}>
        📱 二、AI终端爆发：AI眼镜 + AI手机
      </h3>

      <h4 style={{ fontSize: '1.2rem', marginTop: '24px', marginBottom: '12px', color: '#4b5563' }}>
        （1）AI眼镜赛道（5只）
      </h4>
      <p style={{ marginBottom: '16px', color: '#6b7280', fontSize: '0.95rem' }}>
        <strong>投资逻辑</strong>：2026年为AI眼镜元年，Meta/雷鸟/字节产品落地带动产业链重估
      </p>
      <div style={tableWrapperStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>股票名称</th>
              <th style={thStyle}>代码</th>
              <th style={thStyle}>产业链位置</th>
              <th style={thStyle}>核心客户</th>
              <th style={thStyle}>催化剂</th>
            </tr>
          </thead>
          <tbody>
            {[
              { name: '水晶光电', code: '002273', position: '光波导核心模组', client: 'Meta/小米/雷鸟', catalyst: '新品放量' },
              { name: '歌尔股份', code: '002241', position: '整机ODM+声学', client: 'Meta/华为/小米', catalyst: 'ASP提升3倍' },
              { name: '蓝思科技', code: '300433', position: 'Rokid整机+光学玻璃', client: 'Rokid/Meta', catalyst: 'CES展会订单' },
              { name: '立讯精密', code: '002475', position: '阿里夸克AI眼镜代工', client: '阿里/苹果生态', catalyst: '高端眼镜放量' },
              { name: '虹软科技', code: '688088', position: '端侧视觉AI算法', client: '5家头部品牌', catalyst: '算法授权费' }
            ].map((item, i) => (
              <tr key={i} style={getTrStyle(i % 2 === 0)}>
                <td style={{...tdStyle, fontWeight: '600'}}><strong>{item.name}</strong></td>
                <td style={tdStyle}>{item.code}</td>
                <td style={tdStyle}>{item.position}</td>
                <td style={tdStyle}>{item.client}</td>
                <td style={tdStyle}>{item.catalyst}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h4 style={{ fontSize: '1.2rem', marginTop: '32px', marginBottom: '12px', color: '#4b5563' }}>
        （2）AI手机赛道（4只）
      </h4>
      <p style={{ marginBottom: '16px', color: '#6b7280', fontSize: '0.95rem' }}>
        <strong>投资逻辑</strong>：AI手机需要更强散热/电池/存储，供应链价值量提升
      </p>
      <div style={tableWrapperStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>股票名称</th>
              <th style={thStyle}>代码</th>
              <th style={thStyle}>核心产品</th>
              <th style={thStyle}>单机价值</th>
              <th style={thStyle}>备注</th>
            </tr>
          </thead>
          <tbody>
            {[
              { name: '德赛电池', code: '000049', product: '6000mAh快充电池', value: '+50%', note: 'AI手机高功耗刚需' },
              { name: '兆易创新', code: '603986', product: 'NOR/NAND Flash', value: '翻倍', note: '端侧AI运行底座' },
              { name: '长盈精密', code: '300115', product: '折叠屏铰链', value: 'ASP提升5倍', note: '技术壁垒高' },
              { name: '昀冢科技', code: '688260', product: 'CMI一体化组件', value: '270元/台', note: '豆包AI手机独供' }
            ].map((item, i) => (
              <tr key={i} style={getTrStyle(i % 2 === 0)}>
                <td style={{...tdStyle, fontWeight: '600'}}><strong>{item.name}</strong></td>
                <td style={tdStyle}>{item.code}</td>
                <td style={tdStyle}>{item.product}</td>
                <td style={tdStyle}>{item.value}</td>
                <td style={tdStyle}>{item.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ marginTop: '12px', color: '#6b7280', fontSize: '0.9rem' }}>
        <strong>港股补充</strong>：小米集团(1810.HK)、联想集团(0992.HK)
      </p>

      {/* 三、垂直应用 */}
      <h3 style={{ fontSize: '1.4rem', marginTop: '48px', marginBottom: '16px', color: '#374151' }}>
        🏥 三、AI+垂直行业应用：医疗与金融
      </h3>
      <p style={{ marginBottom: '16px', color: '#6b7280' }}>
        <strong>投资逻辑</strong>：AI从"能说话"转向"能解决问题"，医疗影像与金融风控变现最清晰
      </p>
      <h4 style={{ fontSize: '1.2rem', marginTop: '24px', marginBottom: '12px', color: '#4b5563' }}>
        核心推荐（5只）
      </h4>
      <div style={tableWrapperStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>股票名称</th>
              <th style={thStyle}>代码</th>
              <th style={thStyle}>应用场景</th>
              <th style={thStyle}>商业化进展</th>
              <th style={thStyle}>2026预期</th>
            </tr>
          </thead>
          <tbody>
            {[
              { name: '联影医疗', code: '688271', scene: 'AI医学影像诊断', progress: '元智大模型商用', expect: '营收+22%' },
              { name: '科大讯飞', code: '002230', scene: '医疗记录+金融客服', progress: '覆盖3000家医院', expect: 'AI业务翻倍' },
              { name: '恒生电子', code: '600570', scene: '光子大模型量化投研', progress: '机构版年费8万元', expect: '利润+20%' },
              { name: '卫宁健康', code: '300253', scene: 'AI临床路径+病历生成', progress: 'WingNurse收费模式', expect: '订阅收入激增' },
              { name: '同花顺', code: '300033', scene: '问财大模型日活600万', progress: 'AI投顾付费渗透', expect: '营收贡献25亿' }
            ].map((item, i) => (
              <tr key={i} style={getTrStyle(i % 2 === 0)}>
                <td style={{...tdStyle, fontWeight: '600'}}><strong>{item.name}</strong></td>
                <td style={tdStyle}>{item.code}</td>
                <td style={tdStyle}>{item.scene}</td>
                <td style={tdStyle}>{item.progress}</td>
                <td style={tdStyle}>{item.expect}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ marginTop: '12px', color: '#6b7280', fontSize: '0.9rem' }}>
        <strong>补充标的</strong>：迈瑞医疗(300760)、润达医疗(603108)
      </p>

      {/* 四、硬科技 */}
      <h3 style={{ fontSize: '1.4rem', marginTop: '48px', marginBottom: '16px', color: '#374151' }}>
        🔬 四、硬科技补涨：半导体国产替代 + 智能驾驶
      </h3>

      <h4 style={{ fontSize: '1.2rem', marginTop: '24px', marginBottom: '12px', color: '#4b5563' }}>
        （1）半导体国产替代（5只）
      </h4>
      <p style={{ marginBottom: '16px', color: '#6b7280', fontSize: '0.95rem' }}>
        <strong>投资逻辑</strong>：国产替代进入深水区，先进制程设备+封测环节加速突破
      </p>
      <div style={tableWrapperStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>股票名称</th>
              <th style={thStyle}>代码</th>
              <th style={thStyle}>细分领域</th>
              <th style={thStyle}>国产化率</th>
              <th style={thStyle}>催化剂</th>
            </tr>
          </thead>
          <tbody>
            {[
              { name: '北方华创', code: '002371', field: '刻蚀机/薄膜沉积', rate: '设备龙头', catalyst: '先进制程突破' },
              { name: '中芯国际', code: '688981', field: '晶圆代工', rate: '成熟制程产能', catalyst: 'AI芯片需求' },
              { name: '长电科技', code: '600584', field: 'Chiplet封测', rate: '高端封测龙头', catalyst: '大算力芯片' },
              { name: '中微公司', code: '688012', field: '等离子蚀刻', rate: '国产核心工具', catalyst: '7nm工艺支持' },
              { name: '韦尔股份', code: '603501', field: '车载CIS芯片', rate: '市占率35%', catalyst: '8M摄像头放量' }
            ].map((item, i) => (
              <tr key={i} style={getTrStyle(i % 2 === 0)}>
                <td style={{...tdStyle, fontWeight: '600'}}><strong>{item.name}</strong></td>
                <td style={tdStyle}>{item.code}</td>
                <td style={tdStyle}>{item.field}</td>
                <td style={tdStyle}>{item.rate}</td>
                <td style={tdStyle}>{item.catalyst}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h4 style={{ fontSize: '1.2rem', marginTop: '32px', marginBottom: '12px', color: '#4b5563' }}>
        （2）智能驾驶（4只）
      </h4>
      <p style={{ marginBottom: '16px', color: '#6b7280', fontSize: '0.95rem' }}>
        <strong>投资逻辑</strong>：L3/L4级自动驾驶迎来政策+技术双突破
      </p>
      <div style={tableWrapperStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>股票名称</th>
              <th style={thStyle}>代码</th>
              <th style={thStyle}>产品线</th>
              <th style={thStyle}>客户</th>
              <th style={thStyle}>亮点</th>
            </tr>
          </thead>
          <tbody>
            {[
              { name: '德赛西威', code: '002920', product: '8295座舱+Orin域控', client: '在手订单260亿', highlight: '双龙头地位' },
              { name: '比亚迪', code: '002594', product: '智能驾驶系统集成', client: '自有车型', highlight: '垂直整合优势' },
              { name: '斯达半导', code: '603290', product: '车规IGBT/SiC模块', client: '市占25%', highlight: '800V平台唯一国产' },
              { name: '华域汽车', code: '600741', product: '4D毫米波雷达', client: '华为ADS 2.0', highlight: '国产化率70%' }
            ].map((item, i) => (
              <tr key={i} style={getTrStyle(i % 2 === 0)}>
                <td style={{...tdStyle, fontWeight: '600'}}><strong>{item.name}</strong></td>
                <td style={tdStyle}>{item.code}</td>
                <td style={tdStyle}>{item.product}</td>
                <td style={tdStyle}>{item.client}</td>
                <td style={tdStyle}>{item.highlight}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ marginTop: '12px', color: '#6b7280', fontSize: '0.9rem' }}>
        <strong>港股补充</strong>：小鹏汽车(9868.HK)、蔚来(9866.HK)
      </p>

      {/* 投资策略 */}
      <h3 style={{ fontSize: '1.4rem', marginTop: '48px', marginBottom: '16px', color: '#374151' }}>
        💡 投资策略建议
      </h3>
      <h4 style={{ fontSize: '1.2rem', marginTop: '24px', marginBottom: '12px', color: '#4b5563' }}>
        配置权重（参考）
      </h4>
      <div style={{
        background: '#f9fafb',
        padding: '24px',
        borderRadius: '12px',
        fontFamily: 'monospace',
        fontSize: '0.9rem',
        lineHeight: '2',
        marginBottom: '24px'
      }}>
        <div style={{ marginBottom: '12px' }}>
          <strong>基建（液冷/电力）</strong>：30% - 确定性最高，订单可跟踪
        </div>
        <div style={{ marginBottom: '12px' }}>
          <strong>垂直应用（医疗/金融）</strong>：25% - 现金流清晰，业绩兑现
        </div>
        <div style={{ marginBottom: '12px' }}>
          <strong>AI终端（眼镜/手机）</strong>：25% - 弹性最大，关注新品周期
        </div>
        <div>
          <strong>硬科技补涨（半导体/智驾）</strong>：20% - 政策受益，波动较大
        </div>
      </div>

      <h4 style={{ fontSize: '1.2rem', marginTop: '24px', marginBottom: '12px', color: '#4b5563' }}>
        分批建仓节点
      </h4>
      <ul style={{ lineHeight: '2', paddingLeft: '24px' }}>
        <li style={{ marginBottom: '12px' }}>
          <strong>立即配置</strong>：液冷龙头（英维克/曙光）+ 医疗AI（联影/科大讯飞）
        </li>
        <li style={{ marginBottom: '12px' }}>
          <strong>回调加仓</strong>：AI眼镜产业链，等待Meta新品发布前回调
        </li>
        <li>
          <strong>业绩验证后</strong>：半导体设备股，关注Q1财报订单数据
        </li>
      </ul>

      {/* 风险提示 */}
      <h3 style={{ fontSize: '1.4rem', marginTop: '48px', marginBottom: '16px', color: '#374151' }}>
        ⚠️ 风险提示
      </h3>
      <div style={tableWrapperStyle}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={thStyle}>风险类型</th>
              <th style={thStyle}>具体内容</th>
            </tr>
          </thead>
          <tbody>
            {[
              { type: '短期风险', content: 'AI板块估值偏高，需警惕情绪退潮' },
              { type: '中期风险', content: '中美科技博弈影响供应链稳定性' },
              { type: '长期风险', content: '部分应用场景商业化不及预期' }
            ].map((item, i) => (
              <tr key={i} style={getTrStyle(i % 2 === 0)}>
                <td style={tdStyle}><strong>{item.type}</strong></td>
                <td style={tdStyle}>{item.content}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 后续跟踪 */}
      <h3 style={{ fontSize: '1.4rem', marginTop: '48px', marginBottom: '16px', color: '#374151' }}>
        📈 后续跟踪重点
      </h3>
      <ul style={{ lineHeight: '2', paddingLeft: '24px' }}>
        <li style={{ marginBottom: '12px' }}>
          <strong>基建维度</strong>：关注字节/腾讯数据中心招标公告，跟踪英维克/曙光月度订单披露
        </li>
        <li style={{ marginBottom: '12px' }}>
          <strong>终端维度</strong>：Meta AI眼镜2代发布时间（预计Q2），小米/华为AI手机新品参数对比
        </li>
        <li style={{ marginBottom: '12px' }}>
          <strong>应用维度</strong>：联影医疗元智大模型付费医院数量，恒生电子光子大模型机构版续约率
        </li>
        <li>
          <strong>硬科技维度</strong>：北方华创先进制程设备验证进度，德赛西威L3级域控制器定点公告
        </li>
      </ul>

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
          <strong>最后更新</strong>：2026年1月9日
        </p>
        <p style={{ margin: '0' }}>
          <strong>免责声明</strong>：以上内容仅供参考，不构成投资建议，据此操作风险自负
        </p>
      </div>
    </div>
  )
}
