import React, { useState } from 'react'
import { fetchCBOEPCRatios } from '../../services/api'

export const ExecutionTab: React.FC = () => {
  const [equityPC, setEquityPC] = useState<string>('')
  const [spxPC, setSpxPC] = useState<string>('')
  const [vixNear, setVixNear] = useState<string>('')
  const [vixFar, setVixFar] = useState<string>('')
  const [netGEX, setNetGEX] = useState<string>('')
  const [goldSilverRatio, setGoldSilverRatio] = useState<string>('')
  const [loadingPCRatios, setLoadingPCRatios] = useState(false)
  const [analysisResult, setAnalysisResult] = useState<{
    status: 'safe' | 'warning' | 'danger'
    title: string
    content: string
    action: string
    advanced?: string
  } | null>(null)

  const handleFetchPCRatios = async () => {
    setLoadingPCRatios(true)
    try {
      console.log('开始获取 CBOE P/C Ratio 数据...')
      const data = await fetchCBOEPCRatios()
      console.log('获取到的数据:', data)
      
      let successCount = 0
      if (data.equityPC !== null) {
        setEquityPC(data.equityPC.toFixed(2))
        successCount++
      }
      if (data.spxPC !== null) {
        setSpxPC(data.spxPC.toFixed(2))
        successCount++
      }
      
      if (successCount === 0) {
        const openCBOE = confirm('⚠️ 无法自动获取数据\n\nCBOE 页面使用动态加载，无法直接解析。\n\n是否在新窗口打开 CBOE 页面？\n\n（打开后，请查找 "Equity Put/Call Ratio" 和 "SPX Put/Call Ratio" 数据）')
        if (openCBOE) {
          window.open('https://www.cboe.com/us/options/market_statistics/daily/', '_blank')
        }
      } else if (successCount === 1) {
        const missing = []
        if (data.equityPC === null) missing.push('Equity P/C Ratio')
        if (data.spxPC === null) missing.push('SPX P/C Ratio')
        const openCBOE = confirm(`✅ 已获取部分数据\n\n缺失：${missing.join('、')}\n\n是否打开 CBOE 页面补充缺失数据？`)
        if (openCBOE) {
          window.open('https://www.cboe.com/us/options/market_statistics/daily/', '_blank')
        }
      } else {
        alert('✅ 数据获取成功！')
      }
    } catch (error) {
      console.error('Failed to fetch P/C Ratios:', error)
      const openCBOE = confirm('❌ 获取数据失败\n\nCBOE 页面使用动态加载，无法直接解析。\n\n是否在新窗口打开 CBOE 页面手动获取？')
      if (openCBOE) {
        window.open('https://www.cboe.com/us/options/market_statistics/daily/', '_blank')
      }
    } finally {
      setLoadingPCRatios(false)
    }
  }

  const analyzeMarket = () => {
    const equity = parseFloat(equityPC)
    const spx = parseFloat(spxPC)
    const vixN = parseFloat(vixNear)
    const vixF = parseFloat(vixFar)
    const gex = parseFloat(netGEX)
    const gsRatio = parseFloat(goldSilverRatio)
    
    if (isNaN(equity) || isNaN(spx)) {
      alert('请输入 Equity P/C 和 SPX P/C 的数值')
      return
    }

    // 高阶参数分析
    let advancedAnalysis = ''
    const hasAdvanced = !isNaN(vixN) && !isNaN(vixF) || !isNaN(gex) || !isNaN(gsRatio)
    
    if (hasAdvanced) {
      const advParts: string[] = []
      
      // VIX 期限结构分析
      if (!isNaN(vixN) && !isNaN(vixF)) {
        if (vixN > vixF) {
          advParts.push('⚠️ VIX 期限结构倒挂（近期 > 远期）：这是崩盘前兆，即使大盘还在涨也要警惕！')
        } else if (vixN >= vixF * 0.9) {
          advParts.push('⚠️ VIX 期限结构接近倒挂：近期急速逼近远期，需要密切关注。')
        } else {
          advParts.push('✅ VIX 期限结构正常（远期 > 近期）：市场情绪相对稳定。')
        }
      }
      
      // Net GEX 分析
      if (!isNaN(gex)) {
        if (gex < 0) {
          advParts.push('🚨 Net GEX 为负值：市场进入崩盘区，做市商对冲行为会"越跌越卖"，价格可能自由落体！')
        } else if (gex < 10) {
          advParts.push('⚠️ Net GEX 接近零轴：市场稳定性下降，波动可能加剧。')
        } else {
          advParts.push('✅ Net GEX 为高正值：市场处于安全区，做市商会"越涨越卖，越跌越买"，波动较小。')
        }
      }
      
      // 金银比分析
      if (!isNaN(gsRatio)) {
        if (gsRatio >= 90) {
          advParts.push('💰 金银比 ≥ 90：白银极度便宜，这是确定性最高的 PAAS 买入时刻！')
        } else if (gsRatio >= 85) {
          advParts.push('💰 金银比 ≥ 85：白银相对便宜，接近 PAAS 的买入区间。')
        } else if (gsRatio < 70) {
          advParts.push('⚠️ 金银比 < 70：白银猛涨（PAAS 冲高），可能是鱼尾行情末端。')
        } else {
          advParts.push('✅ 金银比正常（70-85）：金属市场相对平衡。')
        }
      }
      
      if (advParts.length > 0) {
        advancedAnalysis = advParts.join('\n\n')
      }
    }

    let result: typeof analysisResult = null

    // 完善的分析逻辑
    if (equity < 0.7 && spx >= 1.2) {
      result = {
        status: 'safe',
        title: '当前状态：鱼尾行情（非理性繁荣，有保护）',
        content: '散户在狂欢，但机构买了大量保险。虽然看似危险，但由于对冲充足，短期内很难发生断崖式崩盘。市场可能还在涨，甚至创新高。',
        action: '资产状态：持有 YINN, NVDA | 操作：持仓不动，不加仓。继续持有现金，不要追高。',
        advanced: advancedAnalysis
      }
    } else if (equity < 0.7 && spx >= 0.85 && spx < 1.2) {
      result = {
        status: 'warning',
        title: '当前状态：诱多末期（防弹衣剥落）',
        content: 'SPX 比例从 1.22 降到 0.9 以下。市场可能还在涨，但机构的"防弹衣"没了。机构开始获利了结 Put 或不再购买昂贵的保险。散户的 Equity P/C 可能还在 0.6 以下（极度贪婪）。',
        action: '资产状态：极度危险 | 操作：考虑对 YINN 进行止盈。握紧你的 1/8 现金，暴风雨可能在 2 周内到来。',
        advanced: advancedAnalysis
      }
    } else if (equity < 0.7 && spx < 0.85) {
      result = {
        status: 'warning',
        title: '当前状态：裸奔时刻（无保护自由落体）',
        content: '个股极度贪婪，且机构撤走了对冲保护（或者对冲已经赔光）。这是崩盘前的最危险信号！导火索（如经济数据）可能即将引爆。',
        action: '资产状态：极度危险 | 操作：握紧你的 1/8 现金，暴风雨可能在 2 周内到来。',
        advanced: advancedAnalysis
      }
    } else if (equity >= 0.7 && equity < 1.0 && spx < 0.8) {
      result = {
        status: 'warning',
        title: '当前状态：踩踏期（无保护自由落体）',
        content: '导火索已引爆。因为机构没有 Put 保护，为了自保，他们开始在大盘直接砸盘抛售现货。散户开始意识到不对劲，个股跌破关键位，散户开始慌乱买入 Put 避险，Equity P/C 快速拉升。',
        action: '资产状态：账户回撤 | 操作：忍耐，手握现金。等待 Equity P/C 继续飙升。',
        advanced: advancedAnalysis
      }
    } else if (equity >= 1.2 && spx >= 0.9 && spx < 1.1) {
      result = {
        status: 'danger',
        title: '当前状态：极度恐惧（黄金坑 - 第一笔买入点）',
        content: '这是你等待的瞬间。大盘无差别暴跌，PAAS 和 RKLB 杀到你的预警位。市场上所有人都认为还要跌。散户不再买 Call，全部在割肉或买 Put 保命。',
        action: '资产状态：买入点！| 操作：1/8 现金抄底 PAAS 和 RKLB。检查股价！如果 PAAS 到了 $50-51，RKLB 到了 $55，这就是最佳分批建仓时刻。',
        advanced: advancedAnalysis
      }
    } else if (equity >= 1.1 && spx >= 1.1) {
      result = {
        status: 'warning',
        title: '当前状态：系统性风险爆发',
        content: '全市场都在买保险。虽然恐惧，但说明大家还没放弃抵抗。',
        action: '操作：等待 Equity 继续飙升或 SPX 开始回落（即机构开始投降或直接抛售现货）。',
        advanced: advancedAnalysis
      }
    } else if (equity >= 0.8 && equity < 1.0 && spx >= 0.9 && spx < 1.0) {
      result = {
        status: 'safe',
        title: '当前状态：筑底回升（熊转牛开始）',
        content: 'SPX P/C 先行见顶回落，机构不再恐慌性买入指数保险。Equity P/C 出现"极致恐慌后的平复"，想卖的人都已经卖完了。这是量价背离，说明空头动能耗尽，市场开始筑底。',
        action: '资产状态：盈利中 | 操作：持股待涨。PAAS 和 RKLB 应该在底部横盘。',
        advanced: advancedAnalysis
      }
    } else if (equity < 0.7 && spx >= 0.9 && spx < 1.2) {
      result = {
        status: 'safe',
        title: '当前状态：散户回归（新牛市开启）',
        content: '踏空的人开始追高。Equity P/C 重新跌回 0.7 以下。此时 PAAS 已经从底部回升，你的仓位已经安全盈利。',
        action: '资产状态：盈利中 | 操作：持股待涨，享受牛市。',
        advanced: advancedAnalysis
      }
    } else {
      result = {
        status: 'safe',
        title: '当前状态：震荡修复期',
        content: '多空力量交织，没有明显的极端情绪。保持耐心。',
        action: '操作：继续观察，等待更明确的信号。',
        advanced: advancedAnalysis
      }
    }

    setAnalysisResult(result)
  }

  return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* 市场情绪分析器 - 保留原有功能 */}
              <div style={{
                background: 'white',
                border: '2px solid #3b82f6',
                borderRadius: '12px',
                padding: '24px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }}>
                <h3 style={{
                  fontWeight: '700',
                  fontSize: '1.2rem',
                  marginBottom: '16px',
                  color: '#1f2937',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  borderBottom: '2px solid #3b82f6',
                  paddingBottom: '12px'
                }}>
                  <span style={{ fontSize: '1.5rem' }}>📈</span>
                  市场情绪与崩盘信号分析器
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* 数据获取部分 - 保留原有代码 */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '12px',
                    padding: '12px',
                    background: '#eff6ff',
                    borderRadius: '8px',
                    flexWrap: 'wrap',
                    gap: '8px'
                  }}>
                    <span style={{ fontSize: '0.9rem', fontWeight: '600', color: '#1e40af' }}>
                      📊 数据获取
                    </span>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        onClick={handleFetchPCRatios}
                        disabled={loadingPCRatios}
                        style={{
                          padding: '8px 16px',
                          background: loadingPCRatios ? '#9ca3af' : '#3b82f6',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '0.85rem',
                          fontWeight: '500',
                          cursor: loadingPCRatios ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        {loadingPCRatios ? '⏳ 获取中...' : '🔄 自动获取 P/C Ratio'}
                      </button>
                      <button
                        onClick={() => window.open('https://www.cboe.com/us/options/market_statistics/daily/', '_blank')}
                        style={{
                          padding: '8px 16px',
                          background: '#10b981',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '0.85rem',
                          fontWeight: '500',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        🔗 打开 CBOE 页面
                      </button>
                    </div>
                  </div>

                  {/* 优先级排名和实战清单 */}
                  <div style={{
                    padding: '12px',
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    color: '#991b1b',
                    lineHeight: '1.6',
                    marginBottom: '12px'
                  }}>
                    <div style={{ fontWeight: '700', marginBottom: '10px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      🏆 指标优先级排名（实战有效性）
                    </div>
                    <div style={{ marginBottom: '8px', padding: '8px', background: 'rgba(255,255,255,0.5)', borderRadius: '6px' }}>
                      <div style={{ fontWeight: '600', marginBottom: '4px', color: '#dc2626' }}>🥇 第一名：Equity Put/Call Ratio（核心灵魂）</div>
                      <div style={{ fontSize: '0.8rem', paddingLeft: '8px' }}>散户情绪"体温计"，确认抄底时机。只有当它 &gt; 1.1 甚至冲向 1.3 时，才是 1/8 现金进场的安全红灯。</div>
                    </div>
                    <div style={{ marginBottom: '8px', padding: '8px', background: 'rgba(255,255,255,0.5)', borderRadius: '6px' }}>
                      <div style={{ fontWeight: '600', marginBottom: '4px', color: '#f59e0b' }}>🥈 第二名：Net GEX（波动引擎）</div>
                      <div style={{ fontSize: '0.8rem', paddingLeft: '8px' }}>预测崩盘速度。一旦转负，做市商会助跌，股价会快速下跌。判断"要不要再等更低点"的关键指标。</div>
                    </div>
                    <div style={{ marginBottom: '8px', padding: '8px', background: 'rgba(255,255,255,0.5)', borderRadius: '6px' }}>
                      <div style={{ fontWeight: '600', marginBottom: '4px', color: '#3b82f6' }}>🥉 第三名：SPX Put/Call Ratio（避雷针）</div>
                      <div style={{ fontSize: '0.8rem', paddingLeft: '8px' }}>机构的动作，预测鱼尾结束。如果跌破 0.9，说明"防弹衣"脱了，这是减仓 YINN/NVDA 的最高指令。</div>
                    </div>
                    <div style={{ marginBottom: '8px', padding: '8px', background: 'rgba(255,255,255,0.5)', borderRadius: '6px' }}>
                      <div style={{ fontWeight: '600', marginBottom: '4px' }}>4️⃣ 第四名：VIX 期限结构（预警哨兵）</div>
                      <div style={{ fontSize: '0.8rem', paddingLeft: '8px' }}>长线转折预警。一旦倒挂，立刻进入"临战模式"。</div>
                    </div>
                    <div style={{ marginBottom: '0', padding: '8px', background: 'rgba(255,255,255,0.5)', borderRadius: '6px' }}>
                      <div style={{ fontWeight: '600', marginBottom: '4px' }}>5️⃣ 第五名：金/银比（专项工具）</div>
                      <div style={{ fontSize: '0.8rem', paddingLeft: '8px' }}>专门针对 PAAS。如果冲到 85-90，就算大盘还在跌，也可以开始建仓 PAAS。</div>
                    </div>
                  </div>

                  <div style={{
                    padding: '12px',
                    background: '#f0fdf4',
                    border: '1px solid #86efac',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    color: '#166534',
                    lineHeight: '1.6',
                    marginBottom: '12px'
                  }}>
                    <div style={{ fontWeight: '700', marginBottom: '10px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      💡 2026 "三步走"实战清单
                    </div>
                    <div style={{ marginBottom: '8px', padding: '8px', background: 'rgba(255,255,255,0.5)', borderRadius: '6px' }}>
                      <div style={{ fontWeight: '600', marginBottom: '4px', color: '#dc2626' }}>1️⃣ 看"撤退信号"（看第 3、4 名）</div>
                      <div style={{ fontSize: '0.8rem', paddingLeft: '8px' }}>如果 SPX P/C 下跌 + VIX 期限结构开始收窄 = <strong>撤退 YINN/NVDA</strong>，准备现金。</div>
                    </div>
                    <div style={{ marginBottom: '8px', padding: '8px', background: 'rgba(255,255,255,0.5)', borderRadius: '6px' }}>
                      <div style={{ fontWeight: '600', marginBottom: '4px', color: '#f59e0b' }}>2️⃣ 看"崩盘速度"（看第 2 名）</div>
                      <div style={{ fontSize: '0.8rem', paddingLeft: '8px' }}>如果 GEX 转负 = <strong>耐心等待</strong>。不要在刚转负时接 RKLB，因为它会跌得很快，目标位稳稳能到。</div>
                    </div>
                    <div style={{ marginBottom: '0', padding: '8px', background: 'rgba(255,255,255,0.5)', borderRadius: '6px' }}>
                      <div style={{ fontWeight: '600', marginBottom: '4px', color: '#059669' }}>3️⃣ 看"抄底红灯"（看第 1、5 名）</div>
                      <div style={{ fontSize: '0.8rem', paddingLeft: '8px' }}>如果 Equity P/C &gt; 1.2 + 金银比 &gt; 85 = <strong>全线出击</strong>。买入 PAAS 和 RKLB。</div>
                    </div>
                  </div>

                  <div style={{
                    padding: '12px',
                    background: '#f0f9ff',
                    border: '1px solid #7dd3fc',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    color: '#0c4a6e',
                    lineHeight: '1.6',
                    marginBottom: '12px'
                  }}>
                    <div style={{ fontWeight: '700', marginBottom: '12px', fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      📚 市场博弈逻辑：从"鱼尾行情"到"崩盘"再到"熊转牛"
                    </div>
                    <div style={{ marginBottom: '12px', padding: '8px', background: 'rgba(255,255,255,0.5)', borderRadius: '6px' }}>
                      <div style={{ fontWeight: '600', marginBottom: '8px', color: '#dc2626' }}>
                        📉 第一部分：熊市崩盘的三个阶段
                      </div>
                      <div style={{ marginBottom: '6px', paddingLeft: '8px' }}>
                        <strong>1. 诱多期（防弹衣剥落）：</strong>SPX 1.22 → 0.90。市场还在涨，但机构开始获利了结 Put 或不再购买昂贵的保险。散户的 Equity P/C 可能还在 0.6 以下（极度贪婪）。
                      </div>
                      <div style={{ marginBottom: '6px', paddingLeft: '8px' }}>
                        <strong>2. 踩踏期（无保护自由落体）：</strong>SPX &lt; 0.8 / Equity 0.6 → 1.0。导火索引爆，机构没有 Put 保护，开始砸盘抛售现货。散户开始慌乱买入 Put 避险。
                      </div>
                      <div style={{ marginBottom: '0', paddingLeft: '8px' }}>
                        <strong>3. 绝望期（终极洗盘）：</strong>Equity P/C &gt; 1.2。这是你等待的瞬间。大盘无差别暴跌，PAAS 和 RKLB 杀到你的预警位。这就是你的"第一笔 1/8 现金"入场点。
                      </div>
                    </div>
                    <div style={{ marginBottom: '0', padding: '8px', background: 'rgba(255,255,255,0.5)', borderRadius: '6px' }}>
                      <div style={{ fontWeight: '600', marginBottom: '8px', color: '#059669' }}>
                        📈 第二部分：熊转牛的"接力流程"
                      </div>
                      <div style={{ marginBottom: '6px', paddingLeft: '8px' }}>
                        <strong>第一步：</strong>SPX P/C 先行见顶回落（机构先嗅到转机）
                      </div>
                      <div style={{ marginBottom: '6px', paddingLeft: '8px' }}>
                        <strong>第二步：</strong>Equity P/C 出现"极致恐慌后的平复"（散户投降）
                      </div>
                      <div style={{ marginBottom: '6px', paddingLeft: '8px' }}>
                        <strong>第三步：</strong>VIX 确认（温度降下来）
                      </div>
                      <div style={{ marginBottom: '0', paddingLeft: '8px' }}>
                        <strong>第四步：</strong>散户回归（新的牛市开启）
                      </div>
                    </div>
                  </div>

                  {/* 输入字段 */}
                  <div>
                    <label style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontWeight: '600',
                      color: '#374151',
                      fontSize: '0.95rem'
                    }}>
                      Equity P/C Ratio (个股比例) - EQUITY PUT/CALL RATIO (个股看跌/看涨比)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={equityPC}
                      onChange={(e) => setEquityPC(e.target.value)}
                      placeholder="例如: 0.64"
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        fontSize: '1rem',
                        boxSizing: 'border-box'
                      }}
                    />
                    <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '6px', marginBottom: '4px' }}>
                      通常 0.7 以下为贪婪，1.1 以上为恐惧
                    </div>
                    <a
                      href="https://www.cboe.com/us/options/market_statistics/daily/"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: '0.75rem',
                        color: '#2563eb',
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
                      onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
                    >
                      🔗 查看 CBOE 数据
                      <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>↗</span>
                    </a>
                  </div>

                  <div>
                    <label style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontWeight: '600',
                      color: '#374151',
                      fontSize: '0.95rem'
                    }}>
                      SPX P/C Ratio (标普指数比例) - SPX + SPXW PUT/CALL RATIO (标普指数看跌/看涨比)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={spxPC}
                      onChange={(e) => setSpxPC(e.target.value)}
                      placeholder="例如: 1.22"
                      style={{
                        width: '100%',
                        padding: '12px',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        fontSize: '1rem',
                        boxSizing: 'border-box'
                      }}
                    />
                    <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '6px', marginBottom: '4px' }}>
                      1.2 以上代表机构对冲很强(安全垫)
                    </div>
                    <a
                      href="https://www.cboe.com/us/options/market_statistics/daily/"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: '0.75rem',
                        color: '#2563eb',
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
                      onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
                    >
                      🔗 查看 CBOE 数据
                      <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>↗</span>
                    </a>
                  </div>

                  <div style={{
                    padding: '12px',
                    background: '#f0f9ff',
                    border: '1px solid #7dd3fc',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    color: '#0c4a6e',
                    lineHeight: '1.6',
                    marginBottom: '12px'
                  }}>
                    <div style={{ fontWeight: '700', marginBottom: '8px', fontSize: '0.9rem' }}>
                      🔬 高阶参数（可选，提高判断胜率）
                    </div>
                    <div style={{ fontSize: '0.75rem', marginBottom: '12px', color: '#0369a1' }}>
                      这些参数比 P/C Ratio 更敏感，可以交叉验证市场状态
                    </div>
                  </div>

                  <div>
                    <label style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontWeight: '600',
                      color: '#374151',
                      fontSize: '0.9rem'
                    }}>
                      VIX 近月（可选）
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={vixNear}
                      onChange={(e) => setVixNear(e.target.value)}
                      placeholder="例如: 15.5"
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        fontSize: '0.9rem',
                        boxSizing: 'border-box'
                      }}
                    />
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px', marginBottom: '4px' }}>
                      VIX 期限结构：对比近月和远月，倒挂时是崩盘前兆
                    </div>
                    <a
                      href="https://finance.yahoo.com/quote/%5EVIX"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: '0.75rem',
                        color: '#2563eb',
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
                      onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
                    >
                      🔗 查看 Yahoo Finance VIX
                      <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>↗</span>
                    </a>
                  </div>

                  <div>
                    <label style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontWeight: '600',
                      color: '#374151',
                      fontSize: '0.9rem'
                    }}>
                      VIX 远月 / VXV（可选）
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={vixFar}
                      onChange={(e) => setVixFar(e.target.value)}
                      placeholder="例如: 18.2"
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        fontSize: '0.9rem',
                        boxSizing: 'border-box'
                      }}
                    />
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px', marginBottom: '4px' }}>
                      三个月后的 VIX，正常应大于近月（Contango）
                    </div>
                    <a
                      href="https://finance.yahoo.com/quote/%5EVXV"
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        fontSize: '0.75rem',
                        color: '#2563eb',
                        textDecoration: 'none',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
                      onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
                    >
                      🔗 查看 Yahoo Finance VXV
                      <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>↗</span>
                    </a>
                  </div>

                  <div>
                    <label style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontWeight: '600',
                      color: '#374151',
                      fontSize: '0.9rem'
                    }}>
                      Net GEX（可选）
                    </label>
                    <input
                      type="number"
                      step="1"
                      value={netGEX}
                      onChange={(e) => setNetGEX(e.target.value)}
                      placeholder="例如: -5000000000"
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        fontSize: '0.9rem',
                        boxSizing: 'border-box'
                      }}
                    />
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px', marginBottom: '4px' }}>
                      净看涨期权敞口，负值时市场进入崩盘区
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <a
                        href="https://tier1alpha.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: '0.75rem',
                          color: '#2563eb',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
                        onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
                      >
                        🔗 Tier1Alpha
                        <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>↗</span>
                      </a>
                      <a
                        href="https://spotgamma.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: '0.75rem',
                          color: '#2563eb',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
                        onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
                      >
                        🔗 SpotGamma
                        <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>↗</span>
                      </a>
                    </div>
                  </div>

                  <div>
                    <label style={{
                      display: 'block',
                      marginBottom: '8px',
                      fontWeight: '600',
                      color: '#374151',
                      fontSize: '0.9rem'
                    }}>
                      金银比 Gold/Silver Ratio（可选）
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={goldSilverRatio}
                      onChange={(e) => setGoldSilverRatio(e.target.value)}
                      placeholder="例如: 85.5"
                      style={{
                        width: '100%',
                        padding: '10px',
                        border: '1px solid #d1d5db',
                        borderRadius: '8px',
                        fontSize: '0.9rem',
                        boxSizing: 'border-box'
                      }}
                    />
                    <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px', marginBottom: '4px' }}>
                      ≥90 时白银极度便宜，是 PAAS 确定性最高的买入时刻
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <a
                        href="https://finance.yahoo.com/quote/GC=F"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: '0.75rem',
                          color: '#2563eb',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
                        onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
                      >
                        🔗 黄金价格
                        <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>↗</span>
                      </a>
                      <a
                        href="https://finance.yahoo.com/quote/SI=F"
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          fontSize: '0.75rem',
                          color: '#2563eb',
                          textDecoration: 'none',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.textDecoration = 'underline' }}
                        onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
                      >
                        🔗 白银价格
                        <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>↗</span>
                      </a>
                    </div>
                  </div>

                  <button
                    onClick={analyzeMarket}
                    style={{
                      width: '100%',
                      padding: '14px',
                      background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '1rem',
                      fontWeight: '600',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      boxShadow: '0 2px 8px rgba(59, 130, 246, 0.3)'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(59, 130, 246, 0.4)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(59, 130, 246, 0.3)';
                    }}
                  >
                    🔍 点击生成分析结果
                  </button>

                  {analysisResult && (
                    <div
                      style={{
                        marginTop: '20px',
                        padding: '20px',
                        borderRadius: '8px',
                        borderLeft: `5px solid ${
                          analysisResult.status === 'safe' ? '#28a745' :
                          analysisResult.status === 'warning' ? '#ffc107' : '#dc3545'
                        }`,
                        background:
                          analysisResult.status === 'safe' ? '#d4edda' :
                          analysisResult.status === 'warning' ? '#fff3cd' : '#f8d7da',
                        color:
                          analysisResult.status === 'safe' ? '#155724' :
                          analysisResult.status === 'warning' ? '#856404' : '#721c24'
                      }}
                    >
                      <div style={{
                        fontWeight: '700',
                        fontSize: '1.1rem',
                        marginBottom: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        {analysisResult.status === 'safe' ? '✅' :
                          analysisResult.status === 'warning' ? '⚠️' : '🚨'}
                        {analysisResult.title}
                      </div>
                      <div style={{
                        fontSize: '0.95rem',
                        lineHeight: '1.6',
                        marginBottom: '12px'
                      }}>
                        {analysisResult.content}
                      </div>
                      <div style={{
                        fontSize: '0.95rem',
                        fontWeight: '600',
                        padding: '12px',
                        background: 'rgba(255,255,255,0.5)',
                        borderRadius: '6px',
                        border: `1px solid ${
                          analysisResult.status === 'safe' ? '#28a745' :
                          analysisResult.status === 'warning' ? '#ffc107' : '#dc3545'
                        }`
                      }}>
                        💡 {analysisResult.action}
                      </div>
                      {analysisResult.advanced && (
                        <div style={{
                          marginTop: '16px',
                          padding: '16px',
                          background: '#eff6ff',
                          border: '1px solid #3b82f6',
                          borderRadius: '8px',
                          color: '#1e40af',
                          fontSize: '0.9rem',
                          lineHeight: '1.6',
                          whiteSpace: 'pre-line'
                        }}>
                          <div style={{ fontWeight: '700', marginBottom: '8px', fontSize: '0.95rem' }}>
                            🏆 优先级评估（按实战有效性）
                          </div>
                          <div style={{ fontSize: '0.85rem' }}>
                            {analysisResult.advanced}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* 每日执行清单 */}
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '12px', padding: '24px' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '16px', color: '#166534', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '2rem' }}>✅</span>
                  每日执行清单
                </h2>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #86efac' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#1f2937' }}>查看自选</h3>
                    <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8' }}>
                      KRE、XHB、GDX/GLD、VIX、DXY、^TNX、BTC-USD、CNN Fear & Greed 指数
                    </div>
                  </div>

                  <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #86efac' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#1f2937' }}>记录数据</h3>
                    <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8' }}>
                      当天 Equity P/C、SPX P/C、Net GEX、金银比，以及自己给市场阶段打一个标签（鱼尾 / 诱多 / 崩盘 / 恐慌 / 筑底）
                    </div>
                  </div>

                  <div style={{ background: 'white', padding: '16px', borderRadius: '8px', border: '1px solid #86efac' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: '#1f2937' }}>行动决策</h3>
                    <div style={{ fontSize: '0.9rem', color: '#374151', lineHeight: '1.8' }}>
                      <div style={{ marginBottom: '8px' }}>• 若无阶段切换信号 → 不做大动作</div>
                      <div>• 若阶段变更 → 按上表调整仓位，不做超过两步的大幅改动</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 投资纪律 */}
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '24px' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: '700', marginBottom: '16px', color: '#92400e', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '2rem' }}>⚖️</span>
                  投资纪律
                </h2>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ fontSize: '1rem', color: '#92400e', lineHeight: '1.8', fontStyle: 'italic' }}>
                    • 现金是等待成本，也是买错的止损器。
                  </div>
                  <div style={{ fontSize: '1rem', color: '#92400e', lineHeight: '1.8', fontStyle: 'italic' }}>
                    • 做空需要耐心，抄底需要勇气，二者都要有规则约束。
                  </div>
                  <div style={{ fontSize: '1rem', color: '#92400e', lineHeight: '1.8', fontStyle: 'italic' }}>
                    • 宁可错过，不要做错；宁可慢一点，不要频繁大振幅改仓。
                  </div>
                </div>
              </div>
            </div>
  )
}
