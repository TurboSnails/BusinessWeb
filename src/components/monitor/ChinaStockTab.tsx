import React from 'react'

export const ChinaStockTab: React.FC = () => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* 资产配置 */}
      <div style={{ background: 'white', border: '2px solid #3b82f6', borderRadius: '12px', padding: '24px' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '20px', color: '#1e40af', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '2rem' }}>📊</span>
          一、资产配置（总仓位85%，现金15%）
        </h2>
        
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
            <thead>
              <tr style={{ background: '#eff6ff', borderBottom: '2px solid #3b82f6' }}>
                <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: '#1e40af' }}>资产类别</th>
                <th style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#1e40af' }}>比例</th>
                <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: '#1e40af' }}>核心标的</th>
                <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: '#1e40af' }}>目标</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937' }}>稳健股票</td>
                <td style={{ padding: '12px', textAlign: 'center', color: '#374151' }}>30%</td>
                <td style={{ padding: '12px', color: '#374151' }}>财务筛选个股</td>
                <td style={{ padding: '12px', color: '#374151' }}>长期跑赢大盘</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937' }}>红利防御</td>
                <td style={{ padding: '12px', textAlign: 'center', color: '#374151' }}>25%</td>
                <td style={{ padding: '12px', color: '#374151' }}>515300(15%) + 513690(10%)</td>
                <td style={{ padding: '12px', color: '#374151' }}>降低波动，稳定分红</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937' }}>宽基成长</td>
                <td style={{ padding: '12px', textAlign: 'center', color: '#374151' }}>15%</td>
                <td style={{ padding: '12px', color: '#374151' }}>510300(10%) + 588000(5%)</td>
                <td style={{ padding: '12px', color: '#374151' }}>捕捉市场Beta+创新红利</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937' }}>板块轮动</td>
                <td style={{ padding: '12px', textAlign: 'center', color: '#374151' }}>10%</td>
                <td style={{ padding: '12px', color: '#374151' }}>半导体/数据要素/储能/创新药</td>
                <td style={{ padding: '12px', color: '#374151' }}>捕捉热点超额收益</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937' }}>避险资产</td>
                <td style={{ padding: '12px', textAlign: 'center', color: '#374151' }}>5%</td>
                <td style={{ padding: '12px', color: '#374151' }}>518880(3%) + 159980(2%)</td>
                <td style={{ padding: '12px', color: '#374151' }}>对冲系统性风险</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #e5e7eb', background: '#f0fdf4' }}>
                <td style={{ padding: '12px', fontWeight: '600', color: '#1f2937' }}>现金储备</td>
                <td style={{ padding: '12px', textAlign: 'center', color: '#374151' }}>15%</td>
                <td style={{ padding: '12px', color: '#374151' }}>国债逆回购</td>
                <td style={{ padding: '12px', color: '#374151' }}>机动+逆回购收益</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 稳健股票筛选 */}
      <div style={{ background: 'white', border: '2px solid #10b981', borderRadius: '12px', padding: '24px' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '20px', color: '#059669', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '2rem' }}>📊</span>
          二、核心操作规则 - 稳健股票筛选（30%核心仓）
        </h2>
        
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#166534' }}>8项筛选标准</h3>
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>必选指标：</div>
            <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8', paddingLeft: '16px' }}>
              <div>✓ ROE &gt; 15%</div>
              <div>✓ 自由现金流/市值 &gt; 3%</div>
              <div>✓ 扣非净利润增速 &gt; 10%</div>
              <div>✓ 经营现金流/净利润 &gt; 1.0</div>
            </div>
          </div>
          <div>
            <div style={{ fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>加分项：</div>
            <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8', paddingLeft: '16px' }}>
              <div>✓ ESG评级 ≥ BBB</div>
              <div>✓ 研发费用率 &gt; 5%</div>
              <div>✓ 机构持股比例 &gt; 20%</div>
              <div>✓ 股息率 &gt; 1.5%</div>
            </div>
          </div>
        </div>

        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#991b1b' }}>防雷红线</h3>
          <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8' }}>
            <div>• 应收账款增速 &lt; 营收增速</div>
            <div>• 实控人质押率 &lt; 40%</div>
            <div>• 无监管处罚记录</div>
          </div>
        </div>

        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '16px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#92400e' }}>操作纪律</h3>
          <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8' }}>
            <div>• 等权重持有10-12只，单只≤3%</div>
            <div>• 每年4月/10月财报后调仓（避开密集期）</div>
            <div>• 优先行业：国产替代、专精特新、高端制造</div>
            <div>• 止损：单只-15%，立即退出</div>
          </div>
        </div>
      </div>

      {/* 红利防御配置 */}
      <div style={{ background: 'white', border: '2px solid #f59e0b', borderRadius: '12px', padding: '24px' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '20px', color: '#d97706', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '2rem' }}>🛡️</span>
          红利防御配置（25%压舱石）
        </h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '16px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '8px', color: '#92400e' }}>1. 中证红利低波ETF（515300）—— 15%</h3>
            <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8' }}>
              <div>• A股高股息+低波动</div>
              <div>• 长期持有，分红再投资</div>
            </div>
          </div>
          
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '16px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '8px', color: '#92400e' }}>2. 恒生高股息ETF（513690）—— 10%</h3>
            <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8' }}>
              <div>• 港股通红利，分散地域风险</div>
              <div>• 人民币计价，无换汇成本</div>
            </div>
          </div>
        </div>

        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '16px', marginTop: '16px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '8px', color: '#166534' }}>动态调整</h3>
          <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8' }}>
            <div>• 股息率 - 10年期国债收益率 &gt; 2% 时，可超配至30%</div>
            <div>• 指数PE &lt; 历史30%分位时，加仓信号</div>
          </div>
        </div>
      </div>

      {/* 宽基+成长配置 */}
      <div style={{ background: 'white', border: '2px solid #8b5cf6', borderRadius: '12px', padding: '24px' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '20px', color: '#7c3aed', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '2rem' }}>📈</span>
          宽基+成长配置（15%基础仓）
        </h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '8px', padding: '16px' }}>
            <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8' }}>
              <div><strong>• 沪深300ETF（510300）—— 10%</strong>（市场基准）</div>
              <div><strong>• 科创50ETF（588000）—— 5%</strong>（创新成长）</div>
            </div>
          </div>
          
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '16px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '8px', color: '#166534' }}>作用</h3>
            <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8' }}>
              <div>• 捕捉市场平均收益</div>
              <div>• 参与科创板硬科技红利</div>
              <div>• 长期持有，季度再平衡</div>
            </div>
          </div>
        </div>
      </div>

      {/* 板块轮动策略 */}
      <div style={{ background: 'white', border: '2px solid #ef4444', borderRadius: '12px', padding: '24px' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '20px', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '2rem' }}>🚀</span>
          板块轮动策略（10%卫星仓）
        </h2>
        
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#991b1b' }}>四大候选板块（单选持有）</h3>
          <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8' }}>
            <div>1. 半导体ETF（512480）</div>
            <div>2. 数据要素ETF（516003）← 新政策方向</div>
            <div>3. 储能ETF（159566）</div>
            <div>4. 创新药ETF（515120）</div>
          </div>
        </div>

        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#166534' }}>严格入场信号（三重验证）</h3>
          <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8' }}>
            <div><strong>触发条件（必须同时满足）：</strong></div>
            <div style={{ paddingLeft: '16px', marginTop: '8px' }}>
              <div>1. 政策催化事件（新政发布/产业规划）</div>
              <div>2. 主力资金连续3日净流入 &gt; 8亿</div>
              <div>3. RSI &lt; 55 且放量突破关键位</div>
            </div>
          </div>
        </div>

        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '16px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#991b1b' }}>风控铁律</h3>
          <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8' }}>
            <div>• 持有期 ≤ 15个交易日</div>
            <div>• 止损：-8%立即清仓</div>
            <div>• 止盈：+15%减半，+25%清仓</div>
            <div>• 黑天鹅熔断：单日跌幅&gt;7%立即止损</div>
          </div>
        </div>
      </div>

      {/* 避险资产配置 */}
      <div style={{ background: 'white', border: '2px solid #f59e0b', borderRadius: '12px', padding: '24px' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '20px', color: '#d97706', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '2rem' }}>🪙</span>
          避险资产配置（5%保险栓）
        </h2>
        
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#92400e' }}>组合配置</h3>
          <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8' }}>
            <div>• 华安黄金ETF（518880）—— 3%</div>
            <div>• 中概互联商品ETF（159980）—— 2%</div>
          </div>
        </div>

        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#166534' }}>加仓触发（满足任一条件）</h3>
          <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8' }}>
            <div>1. 沪深300市盈率 &lt; 历史20%分位</div>
            <div>2. 波动率指数VIX &gt; 30（恐慌指标）</div>
            <div>3. 地缘政治重大事件</div>
          </div>
        </div>

        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '16px' }}>
          <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8', fontWeight: '600' }}>
            正常持有：5%，极端行情可加至10%
          </div>
        </div>
      </div>

      {/* 现金管理 */}
      <div style={{ background: 'white', border: '2px solid #10b981', borderRadius: '12px', padding: '24px' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '20px', color: '#059669', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '2rem' }}>💰</span>
          现金管理（15%机动资金）
        </h2>
        
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '16px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#166534' }}>三层用途</h3>
          <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8' }}>
            <div><strong>1. 逆回购收益（8%）：</strong>日常用国债逆回购增厚收益（年化2%+）</div>
            <div><strong>2. 补仓资金（5%）：</strong>沪深300单月跌&gt;8%时定投</div>
            <div><strong>3. 自主交易（2%）：</strong>仅买符合8项筛选标准的个股</div>
          </div>
        </div>

        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '16px', marginTop: '16px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#92400e' }}>自主交易原则</h3>
          <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8' }}>
            <div>• 必须符合稳健股筛选标准</div>
            <div>• 近期机构调研增加</div>
            <div>• 单只持仓 ≤ 1%</div>
          </div>
        </div>
      </div>

      {/* 风控体系 */}
      <div style={{ background: 'white', border: '2px solid #ef4444', borderRadius: '12px', padding: '24px' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '20px', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '2rem' }}>⚠️</span>
          三、风控体系
        </h2>
        
        <div style={{ marginBottom: '20px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#1f2937' }}>多层熔断机制</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: '#fef2f2', borderBottom: '2px solid #fecaca' }}>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: '#991b1b' }}>触发条件</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: '#991b1b' }}>立即行动</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '12px', color: '#374151' }}>沪深300单月跌 &gt; 8%</td>
                  <td style={{ padding: '12px', color: '#374151' }}>现金增至20%，暂停板块轮动</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '12px', color: '#374151' }}>组合回撤 &gt; 10%</td>
                  <td style={{ padding: '12px', color: '#374151' }}>黄金+商品加仓至10%，个股单只降至≤1.5%</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '12px', color: '#374151' }}>VIX波动率 &gt; 30</td>
                  <td style={{ padding: '12px', color: '#374151' }}>所有高风险资产降仓50%</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '16px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#166534' }}>再平衡规则</h3>
          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>季度检查（3/6/9/12月）：</div>
            <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8', paddingLeft: '16px' }}>
              <div>• 偏离目标比例±5%时调整</div>
              <div>• 盈利资产减仓，亏损优质资产加仓</div>
              <div>• 记录操作原因，定期复盘</div>
            </div>
          </div>
          <div>
            <div style={{ fontWeight: '600', marginBottom: '8px', color: '#1f2937' }}>年度大调整（1月）：</div>
            <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8', paddingLeft: '16px' }}>
              <div>• 重新筛选稳健股池</div>
              <div>• 评估宏观环境，微调配置比例</div>
              <div>• 计算年度收益与回撤</div>
            </div>
          </div>
        </div>
      </div>

      {/* 执行检查清单 */}
      <div style={{ background: 'white', border: '2px solid #8b5cf6', borderRadius: '12px', padding: '24px' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '20px', color: '#7c3aed', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '2rem' }}>📋</span>
          四、执行检查清单
        </h2>
        
        <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#7c3aed' }}>定期监控（简化版）</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#f3f4f6', borderBottom: '2px solid #d1d5db' }}>
                  <th style={{ padding: '10px', textAlign: 'left', fontWeight: '700', color: '#1f2937' }}>频率</th>
                  <th style={{ padding: '10px', textAlign: 'left', fontWeight: '700', color: '#1f2937' }}>监控内容</th>
                  <th style={{ padding: '10px', textAlign: 'left', fontWeight: '700', color: '#1f2937' }}>工具</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937' }}>实时</td>
                  <td style={{ padding: '10px', color: '#374151' }}>主力资金异动（&gt;5亿）</td>
                  <td style={{ padding: '10px', color: '#374151' }}>同花顺L2</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937' }}>每日</td>
                  <td style={{ padding: '10px', color: '#374151' }}>政策关键词（自主可控/安全）</td>
                  <td style={{ padding: '10px', color: '#374151' }}>财联社快讯</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937' }}>每周</td>
                  <td style={{ padding: '10px', color: '#374151' }}>板块景气度+持仓占比</td>
                  <td style={{ padding: '10px', color: '#374151' }}>东方财富板块监控</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937' }}>每月</td>
                  <td style={{ padding: '10px', color: '#374151' }}>宏观数据（M2/PPI/美债）</td>
                  <td style={{ padding: '10px', color: '#374151' }}>金十数据</td>
                </tr>
                <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  <td style={{ padding: '10px', fontWeight: '600', color: '#1f2937' }}>每季</td>
                  <td style={{ padding: '10px', color: '#374151' }}>组合风险价值（VaR）</td>
                  <td style={{ padding: '10px', color: '#374151' }}>券商压力测试</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 新手简化方案 */}
      <div style={{ background: 'white', border: '2px solid #10b981', borderRadius: '12px', padding: '24px' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '20px', color: '#059669', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '2rem' }}>📚</span>
          五、新手简化方案
        </h2>
        
        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
          <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8', marginBottom: '12px' }}>
            <strong>如果没时间盯盘，用这个配置：</strong>
          </div>
          <div style={{ background: 'white', padding: '12px', borderRadius: '6px', fontSize: '0.9rem', color: '#374151', lineHeight: '1.8' }}>
            <div><strong>配置比例：</strong></div>
            <div style={{ paddingLeft: '16px', marginTop: '8px' }}>
              <div>├─ 55% 稳健股（定期筛选+年调仓1次）</div>
              <div>├─ 25% 红利ETF（515300 + 513690）</div>
              <div>└─ 20% 黄金+现金（518880 + 逆回购）</div>
            </div>
          </div>
        </div>

        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '16px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#92400e' }}>操作原则</h3>
          <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8' }}>
            <div>✓ 禁用板块轮动和频繁交易</div>
            <div>✓ 每年1月固定再平衡</div>
            <div>✓ 使用ETF定投工具自动执行</div>
          </div>
        </div>
      </div>

      {/* 工具推荐 */}
      <div style={{ background: 'white', border: '2px solid #6366f1', borderRadius: '12px', padding: '24px' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '20px', color: '#4f46e5', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '2rem' }}>🛠️</span>
          六、工具推荐
        </h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '16px' }}>
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '16px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#166534' }}>免费工具</h3>
            <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8' }}>
              <div><strong>筛选：</strong>理杏仁（财务筛选）、雪球（机构调研）</div>
              <div><strong>监控：</strong>东方财富（板块资金流）、同花顺（主力监控）</div>
              <div><strong>学习：</strong>中证指数官网（估值分位数）、央行政策库</div>
            </div>
          </div>
          
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '16px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#92400e' }}>付费工具（可选）</h3>
            <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8' }}>
              <div><strong>Wind终端：</strong>专业数据+产业链穿透</div>
              <div><strong>且慢组合诊断：</strong>组合β值+回撤测算</div>
            </div>
          </div>
        </div>
      </div>

      {/* 核心原则 */}
      <div style={{ background: 'white', border: '2px solid #ef4444', borderRadius: '12px', padding: '24px' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '20px', color: '#dc2626', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '2rem' }}>🔥</span>
          七、核心原则（必须遵守）
        </h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '16px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#991b1b' }}>三倍冗余原则</h3>
            <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8' }}>
              任何交易决策需要3个独立信号验证：
              <div style={{ paddingLeft: '16px', marginTop: '8px' }}>
                <div>• 政策面（产业支持）</div>
                <div>• 资金面（主力流入）</div>
                <div>• 技术面（突破/超跌）</div>
              </div>
            </div>
          </div>
          
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '16px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#92400e' }}>时间管理</h3>
            <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8' }}>
              <div>• 每日主动交易时间 ≤ 1小时</div>
              <div>• 避免盘中冲动决策</div>
              <div>• 设置条件单自动执行</div>
            </div>
          </div>
          
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '16px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#166534' }}>反脆弱设计</h3>
            <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8' }}>
              极端行情下，防御资产（红利+黄金+现金）≥ 60%
            </div>
          </div>
        </div>
      </div>

      {/* 成本控制 */}
      <div style={{ background: 'white', border: '2px solid #6366f1', borderRadius: '12px', padding: '24px' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '20px', color: '#4f46e5', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '2rem' }}>💰</span>
          八、成本控制
        </h2>
        
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#1e40af' }}>年度目标</h3>
          <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8' }}>
            <div>• 券商佣金：万0.3 + 免5（2025年主流）</div>
            <div>• 换手率：≤ 200%（减少摩擦成本）</div>
            <div>• 冲击成本：单笔交易 &lt; 日成交额0.5%</div>
          </div>
        </div>

        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '16px' }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#166534' }}>隐性成本优化</h3>
          <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8' }}>
            <div>• 避开集合竞价高峰（9:15-9:25）</div>
            <div>• 大单分拆，尾盘执行</div>
            <div>• ETF优先选头部产品（流动性好）</div>
          </div>
        </div>
      </div>

      {/* 终极提醒 */}
      <div style={{ background: 'white', border: '2px solid #10b981', borderRadius: '12px', padding: '24px' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '20px', color: '#059669', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '2rem' }}>🎯</span>
          终极提醒
        </h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '16px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#166534' }}>✅ 成功要素</h3>
            <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8' }}>
              <div>1. <strong>纪律 &gt; 预测</strong>：严格执行规则，不凭感觉</div>
              <div>2. <strong>分散 &gt; 集中</strong>：任何单一资产 ≤ 30%</div>
              <div>3. <strong>时间 &gt; 择时</strong>：长期持有优质资产</div>
            </div>
          </div>
          
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '16px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#991b1b' }}>⚠️ 致命错误</h3>
            <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8' }}>
              <div>• ❌ 追涨杀跌（板块轮动除外）</div>
              <div>• ❌ 重仓单只个股（&gt;5%）</div>
              <div>• ❌ 无止损交易</div>
              <div>• ❌ 用急钱投资</div>
            </div>
          </div>
          
          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '16px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#92400e' }}>🎯 执行建议</h3>
            <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8' }}>
              <div>1. <strong>先试水：</strong>用10万元运行3个月</div>
              <div>2. <strong>记录复盘：</strong>每次操作记录原因+结果</div>
              <div>3. <strong>持续学习：</strong>每月读1篇政策解读</div>
              <div>4. <strong>定期体检：</strong>每季度用Wind回测组合表现</div>
            </div>
          </div>
        </div>

        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '16px', marginTop: '16px' }}>
          <div style={{ fontSize: '0.95rem', color: '#1e40af', lineHeight: '1.8', fontStyle: 'italic', marginBottom: '12px' }}>
            <strong>最后的话：</strong>
          </div>
          <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8' }}>
            这个策略的核心是 <strong>"稳健为基，适度进攻，严守纪律"</strong>。
          </div>
          <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8', marginTop: '8px' }}>
            市场永远充满不确定性，但有纪律的投资者能在波动中获得长期收益。
          </div>
          <div style={{ fontSize: '0.9rem', color: '#dc2626', lineHeight: '1.8', marginTop: '12px', fontWeight: '600' }}>
            <strong>记住：战胜80%散户的秘诀不是聪明，而是耐心和执行力。</strong>
          </div>
        </div>
      </div>
    </div>
  )
}

