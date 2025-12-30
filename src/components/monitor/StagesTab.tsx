import React from 'react'

export const StagesTab: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

    {/* 当前持仓与黄金分析 */}

    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '24px' }}>

    <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '16px', color: '#92400e', display: 'flex', alignItems: 'center', gap: '8px' }}>

    <span style={{ fontSize: '2rem' }}>💰</span>

    当前持仓与黄金分析

    </h2>

    <div style={{ marginBottom: '20px' }}>

    <p style={{ fontSize: '0.95rem', lineHeight: '1.8', color: '#78350f', marginBottom: '12px' }}>

    您的组合包括 <strong>AMZN(20%)、TSM(20%)、LLY(15%)、AXP(15%)、QQQ/SPY(15%)、RKLB(5%)、GOLD(10%)</strong>。合并PAAS和GOLD，仅保留10%作为纯粹的对冲工具。

    </p>

    <p style={{ fontSize: '0.95rem', lineHeight: '1.8', color: '#78350f', marginBottom: '12px' }}>

    <strong>2025年黄金表现：</strong>金价从年初约$2450/盎司涨至年末约$3900/盎司（基于GLD代理），YTD +59%，受益于地缘不确定、中央银行购买和关税影响。然而，2025后期涨幅放缓（7-8月微跌），显示潜在峰值。

    </p>

    </div>

    <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #fde68a', marginBottom: '16px' }}>

    <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#1f2937' }}>黄金卖出时机</h3>

    <p style={{ fontSize: '0.9rem', color: '#374151', marginBottom: '8px' }}>不宜盲目持有。基于2025市场，卖出信号包括：</p>

    <ul style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8', paddingLeft: '20px' }}>

    <li><strong>宏观指标：</strong>利率上升（10年美债收益率&gt;4%），美元强势（DXY&gt;105），通胀回落（CPI&lt;2%），这些削弱黄金吸引力。</li>

    <li><strong>技术信号：</strong>金价回调&gt;10%从峰值，或金/道指比率接近1:1（当前约0.08，远未到）。银/金比率&lt;30:1也暗示过热。</li>

    <li><strong>市场周期：</strong>在权益牛市（如金屋行情）卖出，转入成长股；泡沫后期若VIX&gt;20，渐减。</li>

    <li><strong>个人规则：</strong>设定止盈（如+20% YTD卖1/3），或若相信2026继续涨（J.P. Morgan预测更高），持有。</li>

    </ul>

    <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '12px', fontStyle: 'italic' }}>

    当前（2025.12.27）：金价高位稳定，但若美联储加息信号强，考虑减仓5-10%。

    </p>

    </div>

    </div>

    {/* 优化后组合 */}

    <div style={{ background: 'white', border: '2px solid #10b981', borderRadius: '12px', padding: '24px' }}>

    <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '20px', color: '#059669', display: 'flex', alignItems: 'center', gap: '8px' }}>

    <span style={{ fontSize: '2rem' }}>📊</span>

    优化后组合（整合黄金卖出）

    </h2>

    <p style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '16px' }}>

    比例微调：保持黄金10-15%，但添加卖出阈值（如&gt; +20%卖部分）。

    </p>

    <div style={{ overflowX: 'auto' }}>

    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>

    <thead>

    <tr style={{ background: '#d1fae5', borderBottom: '2px solid #10b981' }}>

    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: '#059669' }}>资产</th>

    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: '#059669' }}>优化比例</th>

    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: '#059669' }}>理由</th>

    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: '#059669' }}>当前YTD</th>

    <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: '#059669' }}>Beta（约）</th>

    </tr>

    </thead>

    <tbody>

    <tr style={{ borderBottom: '1px solid #e5e7eb' }}>

    <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937' }}>AMZN</td>

    <td style={{ padding: '12px', color: '#374151' }}>20%</td>

    <td style={{ padding: '12px', color: '#374151' }}>电商云服务 - 核心建议：将谷歌换为亚马逊，捕捉其50%的潜在涨幅</td>

    <td style={{ padding: '12px', color: '#059669' }}>+0.79%</td>

    <td style={{ padding: '12px', color: '#374151' }}>0.8</td>

    </tr>

    <tr style={{ borderBottom: '1px solid #e5e7eb' }}>

    <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937' }}>AXP</td>

    <td style={{ padding: '12px', color: '#374151' }}>15%</td>

    <td style={{ padding: '12px', color: '#374151' }}>金融稳定 - 维持不变，作为消费和金融的稳定器，提供分红和抗跌性</td>

    <td style={{ padding: '12px', color: '#059669' }}>+0.55%</td>

    <td style={{ padding: '12px', color: '#374151' }}>1.4</td>

    </tr>

    <tr style={{ borderBottom: '1px solid #e5e7eb' }}>

    <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937' }}>TSM</td>

    <td style={{ padding: '12px', color: '#374151' }}>20%</td>

    <td style={{ padding: '12px', color: '#374151' }}>半导体核心 - 维持不变，AI芯片制造垄断地位，是2026年算力需求的"卖铲人"</td>

    <td style={{ padding: '12px', color: '#059669' }}>+0.07%</td>

    <td style={{ padding: '12px', color: '#374151' }}>1.1</td>

    </tr>

    <tr style={{ borderBottom: '1px solid #e5e7eb' }}>

    <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937' }}>LLY</td>

    <td style={{ padding: '12px', color: '#374151' }}>15%</td>

    <td style={{ padding: '12px', color: '#374151' }}>制药增长 - 稍作减仓，锁定部分利润，降低单一医药股风险</td>

    <td style={{ padding: '12px', color: '#059669' }}>+2.07%</td>

    <td style={{ padding: '12px', color: '#374151' }}>1.3</td>

    </tr>

    <tr style={{ borderBottom: '1px solid #e5e7eb' }}>

    <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937' }}>QQQ/SPY</td>

    <td style={{ padding: '12px', color: '#374151' }}>15%</td>

    <td style={{ padding: '12px', color: '#374151' }}>市场Beta - 新增：将部分个股风险转化为市场Beta收益，如果不想选ETF，可考虑微软(MSFT)</td>

    <td style={{ padding: '12px', color: '#6b7280' }}>N/A</td>

    <td style={{ padding: '12px', color: '#374151' }}>1.0</td>

    </tr>

    <tr style={{ borderBottom: '1px solid #e5e7eb' }}>

    <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937' }}>RKLB</td>

    <td style={{ padding: '12px', color: '#374151' }}>5%</td>

    <td style={{ padding: '12px', color: '#374151' }}>航天潜力 - 降至5%，保留"彩票"性质的爆发力，但控制回撤风险</td>

    <td style={{ padding: '12px', color: '#dc2626' }}>-2.00%</td>

    <td style={{ padding: '12px', color: '#374151' }}>2.0</td>

    </tr>

    <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#fef3c7' }}>

    <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937' }}>GOLD</td>

    <td style={{ padding: '12px', color: '#374151' }}>10%</td>

    <td style={{ padding: '12px', color: '#374151' }}>黄金商品 - 合并PAAS和GOLD，仅保留10%作为纯粹的对冲工具</td>

    <td style={{ padding: '12px', color: '#059669' }}>+3.03%</td>

    <td style={{ padding: '12px', color: '#374151' }}>0.9</td>

    </tr>

    <tr style={{ borderBottom: '1px solid #e5e7eb' }}>

    <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937' }}>现金/TLT</td>

    <td style={{ padding: '12px', color: '#374151' }}>10%/5%</td>

    <td style={{ padding: '12px', color: '#374151' }}>防御</td>

    <td style={{ padding: '12px', color: '#6b7280' }}>N/A</td>

    <td style={{ padding: '12px', color: '#374151' }}>低</td>

    </tr>

    <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#fee2e2' }}>

    <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937' }}>做空工具</td>

    <td style={{ padding: '12px', color: '#374151' }}>&lt;5-10%</td>

    <td style={{ padding: '12px', color: '#374151' }}>熊市对冲</td>

    <td style={{ padding: '12px', color: '#6b7280' }}>N/A</td>

    <td style={{ padding: '12px', color: '#374151' }}>高负</td>

    </tr>

    </tbody>

    </table>

    </div>

    </div>

    {/* 市场阶段与操作规则表格 */}

    <div style={{ background: 'white', border: '2px solid #3b82f6', borderRadius: '12px', padding: '24px' }}>

    <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '20px', color: '#1e40af', display: 'flex', alignItems: 'center', gap: '8px' }}>

    <span style={{ fontSize: '2rem' }}>📈</span>

    基于市场周期的动态策略（融入持仓+做空+黄金卖出）

    </h2>

    <div style={{ overflowX: 'auto' }}>

    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>

    <thead>

    <tr style={{ background: '#eff6ff', borderBottom: '2px solid #3b82f6' }}>

    <th style={{ padding: '10px', textAlign: 'left', fontWeight: '700', color: '#1e40af' }}>阶段</th>

    <th style={{ padding: '10px', textAlign: 'left', fontWeight: '700', color: '#1e40af' }}>情绪与指标特征</th>

    <th style={{ padding: '10px', textAlign: 'left', fontWeight: '700', color: '#1e40af' }}>仓位大致范围</th>

    <th style={{ padding: '10px', textAlign: 'left', fontWeight: '700', color: '#1e40af' }}>分沽操作</th>

    <th style={{ padding: '10px', textAlign: 'left', fontWeight: '700', color: '#1e40af' }}>基准操作</th>

    <th style={{ padding: '10px', textAlign: 'left', fontWeight: '700', color: '#1e40af' }}>做空部分</th>

    <th style={{ padding: '10px', textAlign: 'left', fontWeight: '700', color: '#1e40af' }}>黄金卖出规则</th>

    </tr>

    </thead>

    <tbody>

    <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f0fdf4' }}>

    <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937' }}>金屋行情</td>

    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>指数创新高，P/C &lt;0.7，VIX &lt;15</td>

    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>权益70-80%，商品15-20%，现金5%</td>

    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>持有LLY/TSM/AMZN，加RKLB</td>

    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>增科技，监控AI</td>

    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>无</td>

    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>持有GOLD；若金价+20% YTD，卖1/3转权益（如TSM）</td>

    </tr>

    <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#fff7ed' }}>

    <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937' }}>泡沫初期</td>

    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>指数高位，P/C 0.7-1.0，VIX 15-20</td>

    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>权益60-70%，商品20-25%，现金10%</td>

    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>减RKLB，转AMZN</td>

    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>加TLT；止盈&gt;10%</td>

    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>1-3% SQQQ</td>

    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>监控金价峰值；若美债&gt;4%，卖GOLD 20%，转现金</td>

    </tr>

    <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#fef2f2' }}>

    <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937' }}>泡沫后期</td>

    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>指数急跌，Net GEX负大，VIX &gt;20</td>

    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>权益40-50%，商品25-30%，现金20-30%</td>

    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>只减不加；VIX PUT。止损-8%</td>

    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>移仓GOLD；限交易</td>

    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>5-10% SQQQ/SPXS</td>

    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>持有作为防御；但若美元&gt;105，卖GOLD 30%，避回调</td>

    </tr>

    <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#fef2f2' }}>

    <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937' }}>中期筑底</td>

    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>Equity P/C &gt;1.2，VIX &lt;30回落</td>

    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>权益30-40%，商品30%，现金30-40%</td>

    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>1/8现金买GOLD</td>

    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>All in优质；增商品若CPI&gt;3%</td>

    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>3-5% SPXS</td>

    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>增持GOLD；卖出信号弱，观察通胀降&lt;2%再减</td>

    </tr>

    <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f0fdf4' }}>

    <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937' }}>熊市后期</td>

    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>指数比跌，P/C 中性，VIX &lt;20</td>

    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>权益60-70%，商品20-25%，现金10%</td>

    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>增TSM/AMZN</td>

    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>再平衡，卖&lt; -5%</td>

    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>5% short弱势</td>

    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>若权益反弹，卖GOLD 20%，转成长股；金/道指&gt;0.1持，否则卖</td>

    </tr>

    <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f0fdf4' }}>

    <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937' }}>筑底回升</td>

    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>指数止跌，P/C 中性，VIX &lt;15</td>

    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>权益60-70%，商品20-25%，现金10-15%</td>

    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>加LLY/AXP；止损-5%</td>

    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>观察美联储，加权益</td>

    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>&lt;3%局部</td>

    <td style={{ padding: '10px', color: '#374151', fontSize: '0.7rem' }}>渐减GOLD若价格稳定高位；卖若回调&gt;10%，或2026预测转弱</td>

    </tr>

    </tbody>

    </table>

    </div>

    <div style={{ marginTop: '20px', padding: '16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px' }}>

    <p style={{ fontSize: '0.85rem', color: '#1e40af', lineHeight: '1.6', marginBottom: '8px' }}>

    <strong>实施：</strong>每周查指标（如VIX、DXY），季度再平衡。回测显示添加卖出规则可减波动15%。

    </p>

    <p style={{ fontSize: '0.75rem', color: '#6b7280', fontStyle: 'italic' }}>

    非建议，咨询顾问。

    </p>

    </div>

    </div>

    </div>

    )

    }

