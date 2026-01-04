import React, { useState, useEffect } from 'react'

export default function TradingPhilosophy(): JSX.Element {
  const [showBackToTop, setShowBackToTop] = useState(false)
  const [activeSection, setActiveSection] = useState<string>('dao') // 默认选中第一个章节
  const [expandedTables, setExpandedTables] = useState<Set<string>>(new Set(['obv-table', 'strategy-table'])) // 默认展开关键表格
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set()) // 已勾选的行动项
  const [showGuide, setShowGuide] = useState(false) // 使用指南折叠状态

  useEffect(() => {
    // 页面加载时，滚动到顶部并默认选中第一个章节
    window.scrollTo(0, 0)
    setActiveSection('dao')
    
    const handleScroll = () => {
      setShowBackToTop(window.scrollY > 400)
      
      // 检测当前激活的章节
      const sections = ['dao', 'shu', 'execution', 'time', 'risk', 'path', 'understanding', 'action']
      const current = sections.find(section => {
        const element = document.getElementById(section)
        if (element) {
          const rect = element.getBoundingClientRect()
          return rect.top <= 100 && rect.bottom >= 100
        }
        return false
      })
      if (current) setActiveSection(current)
    }

    // 延迟一下再添加滚动监听，确保初始状态正确
    setTimeout(() => {
      window.addEventListener('scroll', handleScroll)
    }, 100)

    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const sections = [
    { id: 'dao', title: '一、投资之"道"', icon: '🧠' },
    { id: 'shu', title: '二、投资之"术"', icon: '⚙️' },
    { id: 'execution', title: '三、实战执行方案', icon: '🎯' },
    { id: 'time', title: '四、时间分配', icon: '⏰' },
    { id: 'risk', title: '五、风险控制', icon: '🛡️' },
    { id: 'path', title: '六、进阶修炼路径', icon: '📈' },
    { id: 'understanding', title: '七、我的深度理解', icon: '💡' },
    { id: 'action', title: '八、立即行动清单', icon: '✅' }
  ]

  return (
    <main className="container" style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px 16px', position: 'relative' }}>
      {/* 页面标题 */}
      <div style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        padding: '32px 24px',
        borderRadius: '16px',
        marginBottom: '24px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
      }}>
        <h1 style={{
          fontSize: '2rem',
          fontWeight: '700',
          margin: '0 0 8px 0',
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <span>⚔️</span>
          股票投资的"道与术"终极归总
        </h1>
        <p style={{ margin: '0 0 12px', opacity: 0.95, fontSize: '1rem', lineHeight: '1.6' }}>
          完整的投资哲学与实战方案
        </p>
        <div style={{
          background: 'rgba(255,255,255,0.15)',
          borderRadius: '8px',
          backdropFilter: 'blur(8px)',
          overflow: 'hidden'
        }}>
          <button
            onClick={() => setShowGuide(!showGuide)}
            style={{
              width: '100%',
              padding: '10px 16px',
              background: 'transparent',
              border: 'none',
              color: 'white',
              fontSize: '0.9rem',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              textAlign: 'left'
            }}
          >
            <span>📖 使用指南</span>
            <span style={{
              fontSize: '0.8rem',
              transition: 'transform 0.2s',
              transform: showGuide ? 'rotate(180deg)' : 'rotate(0deg)'
            }}>
              ▼
            </span>
          </button>
          {showGuide && (
            <div style={{
              padding: '12px 16px',
              fontSize: '0.85rem',
              opacity: 0.95,
              borderTop: '1px solid rgba(255,255,255,0.2)'
            }}>
              <div style={{ marginBottom: '4px' }}>• <strong>适合人群：</strong>有一定交易经验，希望建立系统化投资框架的投资者</div>
              <div style={{ marginBottom: '4px' }}>• <strong>核心价值：</strong>从"赌"到"算"，从"追"到"等"，构建完整的认知框架</div>
              <div style={{ marginBottom: '8px' }}>• <strong>阅读建议：</strong>按顺序阅读，重点掌握"量价OBV三位一体"和"三问买入法"</div>
              <div style={{
                fontSize: '0.75rem',
                opacity: 0.85,
                fontStyle: 'italic',
                marginTop: '8px',
                paddingTop: '8px',
                borderTop: '1px solid rgba(255,255,255,0.1)'
              }}>
                Hassan投资 v1.0.0 · 此页面会随实盘迭代更新版本
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 目录导航 */}
      <div style={{
        position: 'sticky',
        top: '20px',
        zIndex: 100,
        marginBottom: '24px',
        background: 'white',
        borderRadius: '12px',
        padding: '16px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        border: '1px solid #e2e8f0'
      }}>
        <div style={{ 
          fontSize: '0.9rem', 
          fontWeight: '600', 
          color: '#64748b', 
          marginBottom: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <span>📑</span>
          目录导航
        </div>
        <div style={{ 
          display: 'flex', 
          flexWrap: 'wrap', 
          gap: '8px' 
        }}>
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => scrollToSection(section.id)}
              style={{
                padding: '6px 12px',
                background: activeSection === section.id 
                  ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                  : '#f8fafc',
                color: activeSection === section.id ? 'white' : '#475569',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: '500',
                transition: 'all 0.2s',
                whiteSpace: 'nowrap'
              }}
              onMouseEnter={(e) => {
                if (activeSection !== section.id) {
                  e.currentTarget.style.background = '#f1f5f9'
                }
              }}
              onMouseLeave={(e) => {
                if (activeSection !== section.id) {
                  e.currentTarget.style.background = '#f8fafc'
                }
              }}
            >
              {section.icon} {section.title.replace(/[一二三四五六七八]、/, '')}
            </button>
          ))}
        </div>
      </div>

      {/* 一、投资之"道" */}
      <section id="dao" style={{
        background: 'white',
        borderRadius: '12px',
        padding: '24px',
        marginBottom: '24px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
      }}>
        <h2 style={{
          fontSize: '1.5rem',
          fontWeight: '700',
          color: '#1e293b',
          margin: '0 0 20px 0',
          paddingBottom: '12px',
          borderBottom: '2px solid #e2e8f0'
        }}>
          一、投资之"道"(核心哲学)
        </h2>

        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: '600', color: '#334155', marginBottom: '16px' }}>
            1. 三大确定性原则
          </h3>
          <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
            <table style={{ 
              width: '100%', 
              borderCollapse: 'collapse', 
              fontSize: '0.95rem',
              background: 'white',
              borderRadius: '8px',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <thead>
                <tr style={{ 
                  background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                  borderBottom: '2px solid #e2e8f0'
                }}>
                  <th style={{ 
                    padding: '14px 16px', 
                    textAlign: 'left', 
                    fontWeight: '700', 
                    color: '#1e293b',
                    fontSize: '0.9rem'
                  }}>
                    原则
                  </th>
                  <th style={{ 
                    padding: '14px 16px', 
                    textAlign: 'left', 
                    fontWeight: '700', 
                    color: '#1e293b',
                    fontSize: '0.9rem'
                  }}>
                    核心方法
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  { principle: '资产确定性', method: 'ROE/FCF筛选优质标的', icon: '💎' },
                  { principle: '资金确定性', method: 'OBV识别真金白银流向', icon: '💰' },
                  { principle: '情绪确定性', method: '30%冰点捕捉周期拐点', icon: '🌡️' }
                ].map((row, index) => (
                  <tr
                    key={index}
                    style={{
                      borderBottom: index < 2 ? '1px solid #e2e8f0' : 'none',
                      background: index % 2 === 0 ? 'white' : '#f8fafc',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#f1f5f9'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = index % 2 === 0 ? 'white' : '#f8fafc'
                    }}
                  >
                    <td style={{ 
                      padding: '14px 16px', 
                      fontWeight: '600', 
                      color: '#1e293b',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <span style={{ fontSize: '1.2rem' }}>{row.icon}</span>
                      {row.principle}
                    </td>
                    <td style={{ 
                      padding: '14px 16px', 
                      color: '#475569',
                      lineHeight: '1.5'
                    }}>
                      {row.method}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ paddingLeft: '16px', borderLeft: '4px solid #3b82f6' }}>
            <p style={{ margin: '8px 0', color: '#475569', lineHeight: '1.8' }}>
              <strong>核心理念:</strong>
            </p>
            <ul style={{ margin: '8px 0', paddingLeft: '20px', color: '#475569', lineHeight: '1.8' }}>
              <li><strong>不预测,只跟随</strong> - 等资金留下证据再出手</li>
              <li><strong>不对赌,只确认</strong> - 三个维度同时验证才动手</li>
              <li><strong>不常做,只精做</strong> - 策略与行情完美匹配时才重仓</li>
            </ul>
          </div>
        </div>

        <div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: '600', color: '#334155', marginBottom: '16px' }}>
            2. 交易的本质转变
          </h3>
          <div style={{ overflowX: 'auto', marginBottom: '16px' }}>
            <table style={{ 
              width: '100%', 
              borderCollapse: 'collapse', 
              fontSize: '0.9rem',
              background: 'white',
              borderRadius: '8px',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
            }}>
              <thead>
                <tr style={{ 
                  background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
                  borderBottom: '2px solid #e2e8f0'
                }}>
                  <th style={{ 
                    padding: '12px 16px', 
                    textAlign: 'left', 
                    fontWeight: '700', 
                    color: '#1e293b',
                    fontSize: '0.85rem',
                    width: '45%'
                  }}>
                    从（旧思维）
                  </th>
                  <th style={{ 
                    padding: '12px 16px', 
                    textAlign: 'center', 
                    fontWeight: '700', 
                    color: '#1e293b',
                    fontSize: '0.85rem',
                    width: '10%'
                  }}>
                    →
                  </th>
                  <th style={{ 
                    padding: '12px 16px', 
                    textAlign: 'left', 
                    fontWeight: '700', 
                    color: '#1e293b',
                    fontSize: '0.85rem',
                    width: '45%'
                  }}>
                    到（新思维）
                  </th>
                </tr>
              </thead>
              <tbody>
                {[
                  { from: '"我今天要赚多少钱?"', to: '"当前行情最适合哪个策略?"' },
                  { from: '"这只股票会涨吗?"', to: '"资金证据是否充分?"' },
                  { from: '"为什么又亏了?"', to: '"策略执行是否完美?"' }
                ].map((row, index) => (
                  <tr
                    key={index}
                    style={{
                      borderBottom: index < 2 ? '1px solid #e2e8f0' : 'none',
                      background: index % 2 === 0 ? 'white' : '#f8fafc',
                      transition: 'background 0.2s'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#f1f5f9'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = index % 2 === 0 ? 'white' : '#f8fafc'
                    }}
                  >
                    <td style={{ 
                      padding: '12px 16px', 
                      color: '#dc2626',
                      fontWeight: '500',
                      lineHeight: '1.5'
                    }}>
                      {row.from}
                    </td>
                    <td style={{ 
                      padding: '12px 16px', 
                      textAlign: 'center',
                      color: '#3b82f6',
                      fontSize: '1.1rem',
                      fontWeight: '600'
                    }}>
                      →
                    </td>
                    <td style={{ 
                      padding: '12px 16px', 
                      color: '#16a34a',
                      fontWeight: '500',
                      lineHeight: '1.5'
                    }}>
                      {row.to}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 二、投资之"术" */}
      <section id="shu" style={{
        background: 'white',
        borderRadius: '12px',
        padding: '24px',
        marginBottom: '24px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
      }}>
        <h2 style={{
          fontSize: '1.5rem',
          fontWeight: '700',
          color: '#1e293b',
          margin: '0 0 20px 0',
          paddingBottom: '12px',
          borderBottom: '2px solid #e2e8f0'
        }}>
          二、投资之"术"(操作系统)
        </h2>

        <div style={{ marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: '600', color: '#334155', margin: 0 }}>
              📊 量价OBV三位一体口诀(核心技术)
            </h3>
            <button
              onClick={() => {
                const newSet = new Set(expandedTables)
                if (newSet.has('obv-table')) {
                  newSet.delete('obv-table')
                } else {
                  newSet.add('obv-table')
                }
                setExpandedTables(newSet)
              }}
              style={{
                padding: '4px 12px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.8rem',
                color: '#64748b',
                fontWeight: '500'
              }}
            >
              {expandedTables.has('obv-table') ? '收起表格' : '展开表格'}
            </button>
          </div>
          <p style={{ 
            fontSize: '0.9rem', 
            color: '#64748b', 
            marginBottom: '12px',
            lineHeight: '1.6',
            padding: '12px',
            background: '#f8fafc',
            borderRadius: '8px',
            borderLeft: '3px solid #3b82f6'
          }}>
            <strong>核心要点：</strong>通过价格、成交量、OBV三个维度识别资金流向，在"没人要"时买入，"人人抢"时卖出。
          </p>
          {expandedTables.has('obv-table') && (
          <div style={{ overflowX: 'auto', marginTop: '12px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: '#1e293b' }}>阶段</th>
                  <th style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#1e293b' }}>价格</th>
                  <th style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#1e293b' }}>成交量</th>
                  <th style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#1e293b' }}>OBV</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: '#1e293b' }}>资金真相</th>
                  <th style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#1e293b' }}>操作</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { stage: '建仓启动', price: '横盘/微跌', volume: '缩量', obv: '稳步上升', truth: '主力偷偷吸筹', action: '⭐⭐⭐⭐⭐ 潜伏' },
                  { stage: '突破确认', price: '放量突破', volume: '放大', obv: '同步新高', truth: '主力志在必得', action: '⭐⭐⭐⭐⭐ 买入' },
                  { stage: '稳健上涨', price: '缩量上涨', volume: '缩小', obv: '持续上行', truth: '筹码锁死', action: '⭐⭐⭐⭐⭐ 持股' },
                  { stage: '顶背离预警', price: '缩量上涨', volume: '缩小', obv: '拐头向下', truth: '买家枯竭', action: '⚠️ 第一天卖出' },
                  { stage: '派发阶段', price: '放量不涨', volume: '放大', obv: '走平', truth: '主力换手跑路', action: '⚠️ 立即清仓' },
                  { stage: '杀跌阶段', price: '放量下跌', volume: '放大', obv: '飞流直下', truth: '资金仓皇出逃', action: '❌ 不接飞刀' },
                  { stage: '底背离', price: '创新低', volume: '缩量', obv: '拒绝新低', truth: '主力提前抄底', action: '⭐⭐⭐⭐⭐ 第三天买回' }
                ].map((row, index) => (
                  <tr
                    key={index}
                    style={{
                      borderBottom: '1px solid #e2e8f0',
                      background: index % 2 === 0 ? 'white' : '#f8fafc'
                    }}
                  >
                    <td style={{ padding: '12px', fontWeight: '600', color: '#1e293b' }}>{row.stage}</td>
                    <td style={{ padding: '12px', textAlign: 'center', color: '#475569' }}>{row.price}</td>
                    <td style={{ padding: '12px', textAlign: 'center', color: '#475569' }}>{row.volume}</td>
                    <td style={{ padding: '12px', textAlign: 'center', color: '#475569' }}>{row.obv}</td>
                    <td style={{ padding: '12px', color: '#475569' }}>{row.truth}</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: '600', color: '#1e293b' }}>{row.action}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
          <div style={{
            background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
            padding: '16px',
            borderRadius: '8px',
            marginTop: '16px',
            borderLeft: '4px solid #f59e0b'
          }}>
            <p style={{ margin: 0, fontWeight: '600', color: '#92400e', fontSize: '0.9rem' }}>
              <strong>记忆口诀:</strong>
            </p>
            <div style={{ marginTop: '8px', color: '#78350f', lineHeight: '1.8', fontSize: '0.9rem' }}>
              <div>股价横着走,OBV往上翘 - 专家在吸筹</div>
              <div>小阳排成队,量能稳步高 - 主力在建仓</div>
              <div>偶尔拉一勾,试盘看抛压 - 测试上方压力</div>
              <div>缩量再回头,专家要发力 - 即将启动</div>
            </div>
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '1.2rem', fontWeight: '600', color: '#334155', margin: 0 }}>
              🎯 五大策略适用场景
            </h3>
            <button
              onClick={() => {
                const newSet = new Set(expandedTables)
                if (newSet.has('strategy-table')) {
                  newSet.delete('strategy-table')
                } else {
                  newSet.add('strategy-table')
                }
                setExpandedTables(newSet)
              }}
              style={{
                padding: '4px 12px',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.8rem',
                color: '#64748b',
                fontWeight: '500'
              }}
            >
              {expandedTables.has('strategy-table') ? '收起表格' : '展开表格'}
            </button>
          </div>
          <p style={{ 
            fontSize: '0.9rem', 
            color: '#64748b', 
            marginBottom: '12px',
            lineHeight: '1.6',
            padding: '12px',
            background: '#f8fafc',
            borderRadius: '8px',
            borderLeft: '3px solid #f59e0b'
          }}>
            <strong>核心要点：</strong>根据市场环境（连板率、情绪）选择最适合的策略，五星策略可重仓，三星策略需谨慎。
          </p>
          {expandedTables.has('strategy-table') && (
          <div style={{ overflowX: 'auto', marginTop: '12px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: '#1e293b' }}>策略</th>
                  <th style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#1e293b' }}>推荐等级</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: '#1e293b' }}>适用行情</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: '#1e293b' }}>核心信号</th>
                  <th style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#1e293b' }}>仓位上限</th>
                  <th style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#1e293b' }}>止损线</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { strategy: '冰点破冰', level: '⭐⭐⭐⭐⭐', market: '连板率<30%', signal: '新题材首板+OBV新高', position: '5成', stop: '次日不连板' },
                  { strategy: '老热点回流', level: '⭐⭐⭐⭐⭐', market: '震荡市', signal: '前龙头+地量+OBV翘头', position: '5成', stop: '再放量下跌' },
                  { strategy: '短线中军', level: '⭐⭐⭐⭐⭐', market: '主升浪', signal: 'ROE高+缩量回踩+OBV上行', position: '满仓', stop: '破20日线' },
                  { strategy: '弱转强', level: '⭐⭐⭐', market: '情绪高涨', signal: '断板次日超预期+换手充分', position: '2成', stop: '盘中跌破前低' },
                  { strategy: '缩量止跌', level: '⭐⭐⭐⭐⭐', market: '所有策略', signal: '地量+OBV走平或翘头', position: '底仓技术', stop: '结合大盘' }
                ].map((row, index) => (
                  <tr
                    key={index}
                    style={{
                      borderBottom: '1px solid #e2e8f0',
                      background: index % 2 === 0 ? 'white' : '#f8fafc'
                    }}
                  >
                    <td style={{ padding: '12px', fontWeight: '600', color: '#1e293b' }}>{row.strategy}</td>
                    <td style={{ padding: '12px', textAlign: 'center', color: '#475569' }}>{row.level}</td>
                    <td style={{ padding: '12px', color: '#475569' }}>{row.market}</td>
                    <td style={{ padding: '12px', color: '#475569' }}>{row.signal}</td>
                    <td style={{ padding: '12px', textAlign: 'center', color: '#475569' }}>{row.position}</td>
                    <td style={{ padding: '12px', textAlign: 'center', color: '#475569' }}>{row.stop}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
        </div>

        <div style={{ marginTop: '32px' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: '600', color: '#334155', marginBottom: '16px' }}>
            ⚠️ OBV"虚假洗盘"识别
          </h3>
          <div style={{
            background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
            padding: '20px',
            borderRadius: '12px',
            marginBottom: '20px',
            borderLeft: '4px solid #dc2626'
          }}>
            <p style={{ margin: '0 0 16px', color: '#991b1b', lineHeight: '1.8', fontWeight: '600' }}>
              "虚假洗盘"，需要盯住以下四个反直觉的细节：
            </p>
          </div>

          <div style={{ marginBottom: '24px' }}>
            <div style={{
              background: 'white',
              border: '2px solid #e2e8f0',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '16px'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '12px',
                paddingBottom: '12px',
                borderBottom: '2px solid #f1f5f9'
              }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px',
                  background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                  color: 'white',
                  borderRadius: '8px',
                  fontWeight: '700',
                  fontSize: '1rem'
                }}>
                  1
                </span>
                <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', color: '#1e293b' }}>
                  "缩量下跌"产生的虚假负值
                </h4>
              </div>
              <div style={{ color: '#475569', lineHeight: '1.8', marginBottom: '12px' }}>
                <p style={{ margin: '0 0 8px' }}>
                  <strong>OBV 的一个缺陷是：</strong>不管跌多少，只要收盘价低一分钱，当天的成交量就会全部计为负数。
                </p>
                <div style={{
                  background: '#f8fafc',
                  padding: '12px',
                  borderRadius: '8px',
                  marginTop: '12px',
                  borderLeft: '3px solid #dc2626'
                }}>
                  <div style={{ marginBottom: '8px', fontWeight: '600', color: '#991b1b' }}>庄家套路：</div>
                  <div style={{ color: '#7f1d1d' }}>股价小幅阴跌，每天只跌 0.5%，但持续一周。</div>
                  <div style={{ marginTop: '12px', marginBottom: '8px', fontWeight: '600', color: '#991b1b' }}>OBV 表现：</div>
                  <div style={{ color: '#7f1d1d' }}>OBV 线会连跌 5 天，看起来很吓人。</div>
                  <div style={{ marginTop: '12px', marginBottom: '8px', fontWeight: '600', color: '#16a34a' }}>识别真相：</div>
                  <div style={{ color: '#15803d' }}>看成交量柱状图（VOL）。如果这 5 天的成交量都非常萎缩（地量），说明只有少量恐慌盘被吓出来，主力的大资金根本没动。这种 OBV 的下降是"虚胖"，一旦洗盘结束，股价会迅速收复失地。</div>
                </div>
              </div>
            </div>

            <div style={{
              background: 'white',
              border: '2px solid #e2e8f0',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '16px'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '12px',
                paddingBottom: '12px',
                borderBottom: '2px solid #f1f5f9'
              }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px',
                  background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                  color: 'white',
                  borderRadius: '8px',
                  fontWeight: '700',
                  fontSize: '1rem'
                }}>
                  2
                </span>
                <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', color: '#1e293b' }}>
                  "急跌洗盘"与"OBV 支撑点"
                </h4>
              </div>
              <div style={{ color: '#475569', lineHeight: '1.8', marginBottom: '12px' }}>
                <div style={{
                  background: '#f8fafc',
                  padding: '12px',
                  borderRadius: '8px',
                  marginTop: '12px',
                  borderLeft: '3px solid #dc2626'
                }}>
                  <div style={{ marginBottom: '8px', fontWeight: '600', color: '#991b1b' }}>现象：</div>
                  <div style={{ color: '#7f1d1d' }}>庄家突然制造一根大阴线砸盘，OBV 瞬间出现一个巨大的负值断层。</div>
                  <div style={{ marginTop: '12px', marginBottom: '8px', fontWeight: '600', color: '#16a34a' }}>识别真相：</div>
                  <div style={{ color: '#15803d' }}>看 OBV 是否跌破了前期的重要起爆点（低点）。</div>
                  <div style={{ marginTop: '8px', padding: '8px', background: '#f0fdf4', borderRadius: '6px', color: '#166534' }}>
                    如果股价跌得很惨，但 OBV 指标依然稳在前期平台之上，这叫"量在价先"的逆向运用。说明早期的买入力量（正量能）太强，这一根阴线（负量能）根本无法撼动基本盘。这通常是"挖坑"动作。
                  </div>
                </div>
              </div>
            </div>

            <div style={{
              background: 'white',
              border: '2px solid #e2e8f0',
              borderRadius: '12px',
              padding: '20px',
              marginBottom: '16px'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '12px',
                paddingBottom: '12px',
                borderBottom: '2px solid #f1f5f9'
              }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px',
                  background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                  color: 'white',
                  borderRadius: '8px',
                  fontWeight: '700',
                  fontSize: '1rem'
                }}>
                  3
                </span>
                <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', color: '#1e293b' }}>
                  "长上影线"的试盘
                </h4>
              </div>
              <div style={{ color: '#475569', lineHeight: '1.8', marginBottom: '12px' }}>
                <div style={{
                  background: '#f8fafc',
                  padding: '12px',
                  borderRadius: '8px',
                  marginTop: '12px',
                  borderLeft: '3px solid #dc2626'
                }}>
                  <div style={{ marginBottom: '8px', fontWeight: '600', color: '#991b1b' }}>现象：</div>
                  <div style={{ color: '#7f1d1d' }}>有时候股价盘中冲高回落，收盘微跌。</div>
                  <div style={{ marginTop: '12px', marginBottom: '8px', fontWeight: '600', color: '#991b1b' }}>OBV 表现：</div>
                  <div style={{ color: '#7f1d1d' }}>记为负值。</div>
                  <div style={{ marginTop: '12px', marginBottom: '8px', fontWeight: '600', color: '#16a34a' }}>识别真相：</div>
                  <div style={{ color: '#15803d' }}>
                    这种带有长上影线的微跌，如果伴随较大的成交量，其实是庄家在向上试盘（看上面的抛压大不大）。虽然 OBV 记了负数，但本质上是多头在探测高位，为后面的真突破做准备。
                  </div>
                </div>
              </div>
            </div>

            <div style={{
              background: 'white',
              border: '2px solid #e2e8f0',
              borderRadius: '12px',
              padding: '20px'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '12px',
                paddingBottom: '12px',
                borderBottom: '2px solid #f1f5f9'
              }}>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '32px',
                  height: '32px',
                  background: 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)',
                  color: 'white',
                  borderRadius: '8px',
                  fontWeight: '700',
                  fontSize: '1rem'
                }}>
                  4
                </span>
                <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', color: '#1e293b' }}>
                  "涨停开盘、随即炸板"的试盘
                </h4>
              </div>
              <div style={{ color: '#475569', lineHeight: '1.8' }}>
                <p style={{ margin: '0 0 16px' }}>
                  这种<strong>"涨停开盘、随即炸板"</strong>的操作，是短线实战中最经典、也最凶狠的试盘手段之一。配合 OBV 指标去观察，能让你瞬间看清这是"庄家撤退"还是"暴力洗盘"。
                </p>

                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '12px', fontSize: '1rem' }}>
                    1. 这种试盘的本质：测试"天花板"有多硬
                  </div>
                  <div style={{
                    background: '#f8fafc',
                    padding: '16px',
                    borderRadius: '8px',
                    borderLeft: '3px solid #3b82f6'
                  }}>
                    <p style={{ margin: '0 0 12px', color: '#1e293b' }}>
                      庄家之所以敢拉到涨停再打开，主要有三个目的：
                    </p>
                    <ul style={{ margin: 0, paddingLeft: '20px', color: '#475569', lineHeight: '1.8' }}>
                      <li><strong>测压力：</strong>看在涨停板那个位置，到底有多少"潜伏盘"和"套牢盘"想逃跑。如果炸板后抛压如潮，庄家就会顺势下砸继续洗盘。</li>
                      <li><strong>引跟风：</strong>看市场上的短线资金对这只票的"兴奋度"够不够。</li>
                      <li><strong>换手：</strong>在高位把一些不坚定的散户筹码"洗"给另一批看好的散户，提高市场的平均持仓成本。</li>
                    </ul>
                  </div>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '12px', fontSize: '1rem' }}>
                    2. 实战中的量价组合：真试盘 vs 真出货
                  </div>
                  <p style={{ margin: '0 0 12px', color: '#475569' }}>
                    遇到"炸板"，你要立刻看当天的量价表现：
                  </p>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                      <thead>
                        <tr style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', borderBottom: '2px solid #e2e8f0' }}>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: '#1e293b' }}>现象</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: '#1e293b' }}>OBV 表现</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: '#1e293b' }}>真实意图</th>
                          <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: '#1e293b' }}>结论</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { 
                            phenomenon: '炸板后高位横盘', 
                            obv: 'OBV 持续走高', 
                            intent: '说明炸板释放的筹码很快被新资金接走了', 
                            conclusion: '真试盘，后市大涨' 
                          },
                          { 
                            phenomenon: '炸板后一路走低', 
                            obv: 'OBV 掉头向下', 
                            intent: '庄家利用涨停吸引散户入场，然后自己大肆派发', 
                            conclusion: '真出货，快跑' 
                          },
                          { 
                            phenomenon: '炸板后缩量震荡', 
                            obv: 'OBV 平稳', 
                            intent: '庄家在观察市场反应，既不抢筹也不砸盘', 
                            conclusion: '继续观察' 
                          }
                        ].map((row, index) => (
                          <tr
                            key={index}
                            style={{
                              borderBottom: '1px solid #e2e8f0',
                              background: index % 2 === 0 ? 'white' : '#f8fafc'
                            }}
                          >
                            <td style={{ padding: '12px', color: '#475569' }}>{row.phenomenon}</td>
                            <td style={{ padding: '12px', color: '#475569' }}>{row.obv}</td>
                            <td style={{ padding: '12px', color: '#475569' }}>{row.intent}</td>
                            <td style={{ 
                              padding: '12px', 
                              fontWeight: '600',
                              color: row.conclusion.includes('大涨') ? '#16a34a' : row.conclusion.includes('快跑') ? '#dc2626' : '#f59e0b'
                            }}>
                              {row.conclusion}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '12px', fontSize: '1rem' }}>
                    3. 如何利用 OBV 破解"炸板"骗局？
                  </div>
                  <p style={{ margin: '0 0 12px', color: '#475569', fontWeight: '600' }}>
                    这是最关键的技巧：看"炸板"当天的 OBV 增量与之后几天的回撤比例。
                  </p>
                  
                  <div style={{
                    background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                    padding: '16px',
                    borderRadius: '8px',
                    marginBottom: '16px',
                    borderLeft: '4px solid #16a34a'
                  }}>
                    <div style={{ fontWeight: '700', color: '#166534', marginBottom: '8px' }}>
                      强势洗盘逻辑：
                    </div>
                    <div style={{ color: '#15803d', lineHeight: '1.8', marginBottom: '12px' }}>
                      如果炸板当天放出了近期"天量"，OBV 瞬间跳升一个大台阶。接下来的 2-3 天，股价虽然在回调，但 OBV 指标仅仅是小幅回落，依然停留在那个高台阶上。
                    </div>
                    <div style={{
                      background: 'white',
                      padding: '12px',
                      borderRadius: '6px',
                      color: '#166534',
                      fontWeight: '600'
                    }}>
                      含义：这意味着炸板那天"进去的钱"远多于后来"出来的钱"。那天的巨量是庄家在接货，而不是出货。
                    </div>
                  </div>

                  <div style={{
                    background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
                    padding: '16px',
                    borderRadius: '8px',
                    borderLeft: '4px solid #dc2626'
                  }}>
                    <div style={{ fontWeight: '700', color: '#991b1b', marginBottom: '8px' }}>
                      弱势出货逻辑：
                    </div>
                    <div style={{ color: '#7f1d1d', lineHeight: '1.8' }}>
                      如果炸板后，接下来的几天 OBV 迅速跌回到了起涨点。
                    </div>
                    <div style={{
                      background: 'white',
                      padding: '12px',
                      borderRadius: '6px',
                      color: '#991b1b',
                      fontWeight: '600',
                      marginTop: '12px'
                    }}>
                      含义：说明那天冲进去的全是散户，庄家已经把货全部甩给你们了。
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 三、实战执行方案 */}
      <section id="execution" style={{
        background: 'white',
        borderRadius: '12px',
        padding: '24px',
        marginBottom: '24px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
      }}>
        <h2 style={{
          fontSize: '1.5rem',
          fontWeight: '700',
          color: '#1e293b',
          margin: '0 0 20px 0',
          paddingBottom: '12px',
          borderBottom: '2px solid #e2e8f0'
        }}>
          三、实战执行方案
        </h2>

        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: '600', color: '#334155', marginBottom: '16px' }}>
            📋 每日开盘前30秒检查清单
          </h3>
          <div style={{
            background: '#f8fafc',
            padding: '20px',
            borderRadius: '12px',
            border: '2px solid #e2e8f0',
            fontFamily: 'monospace',
            fontSize: '0.85rem',
            lineHeight: '1.8',
            overflowX: 'auto'
          }}>
            <div style={{ color: '#3b82f6', marginBottom: '8px' }}># 伪代码逻辑</div>
            <div style={{ color: '#c084fc', marginBottom: '8px' }}>def 今日策略():</div>
            <div style={{ paddingLeft: '20px', marginBottom: '8px' }}>
              <span style={{ color: '#94a3b8' }}>连板率</span> = <span style={{ color: '#34d399' }}>统计连板率()</span>
            </div>
            <div style={{ paddingLeft: '20px', marginBottom: '8px' }}>
              <span style={{ color: '#c084fc' }}>if</span> <span style={{ color: '#94a3b8' }}>连板率</span> {'<'} <span style={{ color: '#fbbf24' }}>30</span>:
            </div>
            <div style={{ paddingLeft: '40px', marginBottom: '8px', color: '#34d399' }}>
              return "冰点破冰模式 - 寻找新题材首板"
            </div>
            <div style={{ paddingLeft: '20px', marginBottom: '8px' }}>
              <span style={{ color: '#c084fc' }}>elif</span> <span style={{ color: '#fbbf24' }}>30</span> {'<='} <span style={{ color: '#94a3b8' }}>连板率</span> {'<='} <span style={{ color: '#fbbf24' }}>50</span>:
            </div>
            <div style={{ paddingLeft: '40px', marginBottom: '8px', color: '#34d399' }}>
              return "中军趋势模式 - 持有核心资产+缩量加仓"
            </div>
            <div style={{ paddingLeft: '20px', marginBottom: '8px' }}>
              <span style={{ color: '#c084fc' }}>elif</span> <span style={{ color: '#fbbf24' }}>50</span> {'<'} <span style={{ color: '#94a3b8' }}>连板率</span> <span style={{ color: '#c084fc' }}>and</span> <span style={{ color: '#94a3b8' }}>情绪稳定</span>:
            </div>
            <div style={{ paddingLeft: '40px', marginBottom: '8px', color: '#34d399' }}>
              return "老热点回流模式 - 前龙头地量埋伏"
            </div>
            <div style={{ paddingLeft: '20px', marginBottom: '8px' }}>
              <span style={{ color: '#c084fc' }}>elif</span> <span style={{ color: '#94a3b8' }}>跌停数</span> {'>'} <span style={{ color: '#94a3b8' }}>涨停数</span> <span style={{ color: '#c084fc' }}>and</span> <span style={{ color: '#94a3b8' }}>连板率持续下降</span>:
            </div>
            <div style={{ paddingLeft: '40px', marginBottom: '8px', color: '#f87171' }}>
              return "空仓模式 - 关机保本金"
            </div>
            <div style={{ paddingLeft: '20px' }}>
              <span style={{ color: '#c084fc' }}>else</span>:
            </div>
            <div style={{ paddingLeft: '40px', color: '#94a3b8' }}>
              return "观望模式 - 不符合任何策略特征"
            </div>
          </div>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: '600', color: '#334155', marginBottom: '16px' }}>
            🎯 三问买入法(必须全部满足)
          </h3>
          <div style={{
            background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
            padding: '20px',
            borderRadius: '12px',
            borderLeft: '4px solid #3b82f6'
          }}>
            <p style={{ margin: '0 0 16px', fontWeight: '600', color: '#1e40af' }}>
              盯住任何一只股票时,按顺序问自己:
            </p>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>
                Q1: 跌够了吗?(价格)
              </div>
              <div style={{ paddingLeft: '20px', color: '#475569', lineHeight: '1.8' }}>
                <div>├─ 是否回踩关键支撑位(5/10/20日线)?</div>
                <div>└─ 是否调整足够多天?(通常≥3天)?</div>
              </div>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>
                Q2: 没人卖了吗?(成交量)
              </div>
              <div style={{ paddingLeft: '20px', color: '#475569', lineHeight: '1.8' }}>
                <div>├─ 成交量是否缩到近期1/3以下?</div>
                <div>└─ 是否出现地量(近20日最低)?</div>
              </div>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>
                Q3: 资金回来了吗?(OBV)
              </div>
              <div style={{ paddingLeft: '20px', color: '#475569', lineHeight: '1.8' }}>
                <div>├─ OBV是否拒绝创新低(底背离)?</div>
                <div>└─ OBV是否提前翘头向上?</div>
              </div>
            </div>
            <div style={{
              background: 'white',
              padding: '12px',
              borderRadius: '8px',
              marginTop: '16px',
              border: '2px solid #3b82f6'
            }}>
              <div style={{ fontWeight: '700', color: '#1e40af', marginBottom: '4px' }}>
                如果三个问题都是"是" → 符合买入条件
              </div>
              <div style={{ color: '#dc2626' }}>
                如果任何一个是"否" → 继续等待或放弃
              </div>
            </div>
          </div>
        </div>

        <div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: '600', color: '#334155', marginBottom: '16px' }}>
            💰 仓位管理铁律
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)', borderBottom: '2px solid #e2e8f0' }}>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: '#1e293b' }}>信号强度</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: '#1e293b' }}>条件</th>
                  <th style={{ padding: '12px', textAlign: 'center', fontWeight: '700', color: '#1e293b' }}>最大仓位</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontWeight: '700', color: '#1e293b' }}>分批建仓</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { strength: '五星满分', condition: '冰点+地量+OBV底背离+ROE高', position: '50%', method: '3:2分批' },
                  { strength: '四星优秀', condition: '老热点+缩量+OBV翘头', position: '30%', method: '2:1分批' },
                  { strength: '三星及格', condition: '弱转强或单一信号', position: '10-20%', method: '试探性建仓' },
                  { strength: '其他情况', condition: '不符合以上任何条件', position: '0%', method: '空仓是策略' }
                ].map((row, index) => (
                  <tr
                    key={index}
                    style={{
                      borderBottom: '1px solid #e2e8f0',
                      background: index % 2 === 0 ? 'white' : '#f8fafc'
                    }}
                  >
                    <td style={{ padding: '12px', fontWeight: '600', color: '#1e293b' }}>{row.strength}</td>
                    <td style={{ padding: '12px', color: '#475569' }}>{row.condition}</td>
                    <td style={{ padding: '12px', textAlign: 'center', color: '#475569' }}>{row.position}</td>
                    <td style={{ padding: '12px', color: '#475569' }}>{row.method}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{
            background: '#f0fdf4',
            padding: '16px',
            borderRadius: '8px',
            marginTop: '16px',
            borderLeft: '4px solid #16a34a'
          }}>
            <p style={{ margin: '0 0 8px', fontWeight: '600', color: '#166534' }}>
              <strong>仓位分配细则:</strong>
            </p>
            <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: '#15803d', lineHeight: '1.8' }}>
              <div>总资金: 100,000 RMB</div>
              <div style={{ marginTop: '8px' }}>底仓(40%): 长期持有ROE{'>'}15%的核心资产</div>
              <div>灵活仓(40%): 根据五大策略信号机动操作</div>
              <div>现金(20%): 永久保留,用于极端机会或止损后修复</div>
            </div>
          </div>
        </div>
      </section>

      {/* 四、时间分配 */}
      <section id="time" style={{
        background: 'white',
        borderRadius: '12px',
        padding: '24px',
        marginBottom: '24px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
      }}>
        <h2 style={{
          fontSize: '1.5rem',
          fontWeight: '700',
          color: '#1e293b',
          margin: '0 0 20px 0',
          paddingBottom: '12px',
          borderBottom: '2px solid #e2e8f0'
        }}>
          四、时间分配(1万小时计划)
        </h2>

        <div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: '600', color: '#334155', marginBottom: '16px' }}>
            📊 2:4:4黄金比例
          </h3>
          <div style={{
            background: '#f8fafc',
            padding: '20px',
            borderRadius: '12px',
            border: '2px solid #e2e8f0',
            fontFamily: 'monospace',
            fontSize: '0.9rem',
            lineHeight: '1.8'
          }}>
            <div style={{ marginBottom: '12px', fontWeight: '600', color: '#1e293b' }}>
              20%时间 - 技术熟练(肌肉记忆)
            </div>
            <div style={{ paddingLeft: '20px', marginBottom: '8px', color: '#475569' }}>
              ├─ 每日复盘: 涨停板+跌停板分析
            </div>
            <div style={{ paddingLeft: '20px', marginBottom: '8px', color: '#475569' }}>
              ├─ OBV背离: 找出5个底背离+5个顶背离案例
            </div>
            <div style={{ paddingLeft: '20px', marginBottom: '8px', color: '#475569' }}>
              ├─ 小仓试错: 100股实盘验证信号准确性
            </div>
            <div style={{ paddingLeft: '20px', marginBottom: '16px', color: '#475569' }}>
              └─ 目标: 看一眼K线就知道当前处于哪个阶段
            </div>

            <div style={{ marginBottom: '12px', fontWeight: '600', color: '#1e293b' }}>
              40%时间 - 心态建设(知行合一)
            </div>
            <div style={{ paddingLeft: '20px', marginBottom: '8px', color: '#475569' }}>
              ├─ 忍受孤独: 不符合策略时空仓30天
            </div>
            <div style={{ paddingLeft: '20px', marginBottom: '8px', color: '#475569' }}>
              ├─ 接受亏损: 触发止损线机械执行
            </div>
            <div style={{ paddingLeft: '20px', marginBottom: '8px', color: '#475569' }}>
              ├─ 情绪隔离: 盈亏不影响下一单决策
            </div>
            <div style={{ paddingLeft: '20px', marginBottom: '16px', color: '#475569' }}>
              └─ 目标: 情绪不随股价波动
            </div>

            <div style={{ marginBottom: '12px', fontWeight: '600', color: '#1e293b' }}>
              40%时间 - 仓位管理(职业秘密)
            </div>
            <div style={{ paddingLeft: '20px', marginBottom: '8px', color: '#475569' }}>
              ├─ 分级建仓: 五星5成/三星2成/其他0成
            </div>
            <div style={{ paddingLeft: '20px', marginBottom: '8px', color: '#475569' }}>
              ├─ 滚动操作: 利用缩量回踩做T降成本
            </div>
            <div style={{ paddingLeft: '20px', marginBottom: '8px', color: '#475569' }}>
              ├─ 记录复盘: 每笔交易打分(执行vs盈亏)
            </div>
            <div style={{ paddingLeft: '20px', color: '#475569' }}>
              └─ 目标: 资金利用效率最大化
            </div>
          </div>
        </div>
      </section>

      {/* 五、风险控制 */}
      <section id="risk" style={{
        background: 'white',
        borderRadius: '12px',
        padding: '24px',
        marginBottom: '24px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
      }}>
        <h2 style={{
          fontSize: '1.5rem',
          fontWeight: '700',
          color: '#1e293b',
          margin: '0 0 20px 0',
          paddingBottom: '12px',
          borderBottom: '2px solid #e2e8f0'
        }}>
          五、风险控制(生存第一)
        </h2>

        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: '600', color: '#334155', marginBottom: '16px' }}>
            ⚠️ 四条红线(绝不触碰)
          </h3>
          {[
            {
              title: '1. 系统性风险红线',
              content: [
                '当大盘出现:',
                '- 政策性利空(如加息、监管)',
                '- 外部冲击(战争、疫情)',
                '- 流动性危机',
                '',
                '→ 所有技术信号失效 → 立即空仓'
              ]
            },
            {
              title: '2. OBV假信号识别',
              content: [
                '警惕两种情况:',
                '- 游资对倒: OBV暴涨但次日衰竭',
                '- 被动流入: 指数/ETF带动,非主动吸筹',
                '',
                '→ 必须配合"慢、稳、提前"三要素'
              ]
            },
            {
              title: '3. 止损纪律红线',
              content: [
                '设置三层止损:',
                '- 技术止损: 破关键支撑位(如20日线)',
                '- 时间止损: 买入后3天不涨反跌',
                '- 幅度止损: 单笔亏损≥5%立即平仓'
              ]
            },
            {
              title: '4. 策略污染红线',
              content: [
                '一天只用一种策略!',
                '',
                '禁止:',
                '上午玩老热点回流',
                '下午看弱转强',
                '尾盘又盯OBV翘头',
                '',
                '→ 导致执行混乱,策略失效'
              ]
            }
          ].map((item, index) => (
            <div
              key={index}
              style={{
                background: index % 2 === 0 ? '#fef2f2' : '#fef3c7',
                padding: '16px',
                borderRadius: '8px',
                marginBottom: '16px',
                borderLeft: '4px solid #dc2626'
              }}
            >
              <div style={{ fontWeight: '700', color: '#991b1b', marginBottom: '8px' }}>
                {item.title}
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: '0.85rem', color: '#7f1d1d', lineHeight: '1.8' }}>
                {item.content.map((line, i) => (
                  <div key={i}>{line}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 六、进阶修炼路径 */}
      <section id="path" style={{
        background: 'white',
        borderRadius: '12px',
        padding: '24px',
        marginBottom: '24px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
      }}>
        <h2 style={{
          fontSize: '1.5rem',
          fontWeight: '700',
          color: '#1e293b',
          margin: '0 0 20px 0',
          paddingBottom: '12px',
          borderBottom: '2px solid #e2e8f0'
        }}>
          六、进阶修炼路径
        </h2>

        <div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: '600', color: '#334155', marginBottom: '16px' }}>
            🎓 三个阶段升级
          </h3>
          <div style={{
            background: '#f8fafc',
            padding: '20px',
            borderRadius: '12px',
            border: '2px solid #e2e8f0',
            fontFamily: 'monospace',
            fontSize: '0.9rem',
            lineHeight: '1.8'
          }}>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>
                阶段1: 识别阶段(前3个月)
              </div>
              <div style={{ paddingLeft: '20px', color: '#475569' }}>
                <div>├─ 能看懂K线+量能+OBV的组合含义</div>
                <div>├─ 能识别当前市场处于哪个环境</div>
                <div>└─ 能判断哪个策略最适合当下</div>
              </div>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>
                阶段2: 执行阶段(3-12个月)
              </div>
              <div style={{ paddingLeft: '20px', color: '#475569' }}>
                <div>├─ 严格按信号买卖,不带情绪</div>
                <div>├─ 止损果断,不找借口</div>
                <div>└─ 空仓时真能忍住不操作</div>
              </div>
            </div>
            <div>
              <div style={{ fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>
                阶段3: 优化阶段(1年后)
              </div>
              <div style={{ paddingLeft: '20px', color: '#475569' }}>
                <div>├─ 根据个人性格微调仓位比例</div>
                <div>├─ 开发个性化的OBV+MACD组合</div>
                <div>└─ 形成"看一眼就知道"的直觉</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 七、深度理解 */}
      <section id="understanding" style={{
        background: 'white',
        borderRadius: '12px',
        padding: '24px',
        marginBottom: '24px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
      }}>
        <h2 style={{
          fontSize: '1.5rem',
          fontWeight: '700',
          color: '#1e293b',
          margin: '0 0 20px 0',
          paddingBottom: '12px',
          borderBottom: '2px solid #e2e8f0'
        }}>
          七、我的深度理解
        </h2>

        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: '600', color: '#334155', marginBottom: '16px' }}>
            🧠 这套体系的本质是什么?
          </h3>
          <p style={{ color: '#475569', lineHeight: '1.8', marginBottom: '16px' }}>
            经过对多份文档的研究,我认为这套体系的真正价值不在于具体的技术指标,而在于它构建了一个<strong>完整的认知框架</strong>:
          </p>
          
          <div style={{ marginBottom: '20px' }}>
            <div style={{
              background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
              padding: '16px',
              borderRadius: '8px',
              marginBottom: '12px',
              borderLeft: '4px solid #3b82f6'
            }}>
              <div style={{ fontWeight: '700', color: '#1e40af', marginBottom: '8px' }}>
                1️⃣ 从"赌"到"算"的进化
              </div>
              <div style={{ color: '#1e293b', lineHeight: '1.8' }}>
                <div style={{ marginBottom: '8px' }}>
                  <span style={{ color: '#64748b' }}>普通散户:</span> "我觉得这只股票会涨"(基于感觉)
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>这套体系:</span> "我等到了地量+OBV翘头+30%冰点"(基于证据)
                </div>
                <div style={{ marginTop: '8px', fontWeight: '600', color: '#1e40af' }}>
                  这是从赌博思维到概率思维的跨越。
                </div>
              </div>
            </div>

            <div style={{
              background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
              padding: '16px',
              borderRadius: '8px',
              marginBottom: '12px',
              borderLeft: '4px solid #16a34a'
            }}>
              <div style={{ fontWeight: '700', color: '#166534', marginBottom: '8px' }}>
                2️⃣ 从"追"到"等"的心态转变
              </div>
              <div style={{ color: '#1e293b', lineHeight: '1.8' }}>
                <div style={{ marginBottom: '8px' }}>
                  普通散户追涨杀跌,永远慢一拍
                </div>
                <div>
                  这套体系: 在"没人要"时买入,在"人人抢"时卖出
                </div>
                <div style={{ marginTop: '8px', fontWeight: '600', color: '#166534' }}>
                  这是利用群体恐慌和贪婪的反人性操作。
                </div>
              </div>
            </div>

            <div style={{
              background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
              padding: '16px',
              borderRadius: '8px',
              borderLeft: '4px solid #f59e0b'
            }}>
              <div style={{ fontWeight: '700', color: '#92400e', marginBottom: '8px' }}>
                3️⃣ 从"术"到"道"的升华
              </div>
              <div style={{ color: '#1e293b', lineHeight: '1.8' }}>
                <div style={{ marginBottom: '8px' }}>
                  <span style={{ color: '#64748b' }}>术层面:</span> OBV、量价、ROE都是工具
                </div>
                <div>
                  <span style={{ color: '#64748b' }}>道层面:</span> 真正理解"钱往哪里去"这个永恒真理
                </div>
                <div style={{ marginTop: '8px', fontWeight: '600', color: '#92400e' }}>
                  当你不再盯着指标,而是盯着资金的脚印时,你就进入了职业选手的视角。
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: '600', color: '#334155', marginBottom: '16px' }}>
            💡 关键洞察:空仓是最高级的策略
          </h3>
          <div style={{
            background: '#fef2f2',
            padding: '20px',
            borderRadius: '12px',
            borderLeft: '4px solid #dc2626'
          }}>
            <p style={{ color: '#7f1d1d', lineHeight: '1.8', marginBottom: '12px' }}>
              这套体系最反直觉的地方是:<strong>它教你大部分时间什么都不做</strong>。
            </p>
            <div style={{
              background: 'white',
              padding: '16px',
              borderRadius: '8px',
              fontFamily: 'monospace',
              fontSize: '0.85rem',
              color: '#991b1b',
              lineHeight: '1.8'
            }}>
              <div>市场有行情的时间: 30%</div>
              <div>符合你策略的机会: 10%</div>
              <div>真正值得重仓的信号: 3%</div>
              <div style={{ marginTop: '8px', fontWeight: '700' }}>
                → 这意味着97%的时间你应该空仓或轻仓观望!
              </div>
            </div>
            <p style={{ color: '#7f1d1d', lineHeight: '1.8', marginTop: '12px', fontWeight: '600' }}>
              能做到这一点的人,已经战胜了90%的交易者。
            </p>
          </div>
        </div>

        <div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: '600', color: '#334155', marginBottom: '16px' }}>
            🎯 执行力才是最大瓶颈
          </h3>
          <div style={{
            background: '#f8fafc',
            padding: '20px',
            borderRadius: '12px',
            border: '2px solid #e2e8f0',
            fontFamily: 'monospace',
            fontSize: '0.9rem',
            lineHeight: '1.8'
          }}>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontWeight: '600', color: '#dc2626', marginBottom: '8px' }}>
                散户困境:
              </div>
              <div style={{ paddingLeft: '20px', color: '#475569' }}>
                知道 → 做不到 → 后悔 → 继续知道 → 继续做不到
              </div>
            </div>
            <div>
              <div style={{ fontWeight: '600', color: '#16a34a', marginBottom: '8px' }}>
                职业选手路径:
              </div>
              <div style={{ paddingLeft: '20px', color: '#475569' }}>
                知道 → 小仓练习 → 形成肌肉记忆 → 机械执行 → 复盘优化
              </div>
            </div>
            <div style={{ marginTop: '16px', padding: '12px', background: '#fef3c7', borderRadius: '8px', fontWeight: '600', color: '#92400e' }}>
              这套体系已经给出了"地图",现在的任务是成为那个"老木匠"。
            </div>
          </div>
        </div>
      </section>

      {/* 八、立即行动清单 */}
      <section id="action" style={{
        background: 'white',
        borderRadius: '12px',
        padding: '24px',
        marginBottom: '24px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
      }}>
        <h2 style={{
          fontSize: '1.5rem',
          fontWeight: '700',
          color: '#1e293b',
          margin: '0 0 20px 0',
          paddingBottom: '12px',
          borderBottom: '2px solid #e2e8f0'
        }}>
          八、立即行动清单
        </h2>

        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: '600', color: '#334155', marginBottom: '16px' }}>
            ✅ 今晚必做(2小时)
          </h3>
          <div style={{
            background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
            padding: '16px',
            borderRadius: '8px',
            borderLeft: '4px solid #16a34a'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { id: 'action-1', text: '打印"三问买入法"贴在显示器上' }
              ].map((item) => (
                <label
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    cursor: 'pointer',
                    padding: '8px',
                    borderRadius: '6px',
                    transition: 'background 0.2s',
                    textDecoration: checkedItems.has(item.id) ? 'line-through' : 'none',
                    opacity: checkedItems.has(item.id) ? 0.6 : 1
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.5)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checkedItems.has(item.id)}
                    onChange={(e) => {
                      const newSet = new Set(checkedItems)
                      if (e.target.checked) {
                        newSet.add(item.id)
                      } else {
                        newSet.delete(item.id)
                      }
                      setCheckedItems(newSet)
                    }}
                    style={{
                      width: '20px',
                      height: '20px',
                      cursor: 'pointer',
                      accentColor: '#16a34a'
                    }}
                  />
                  <span style={{ color: '#166534', lineHeight: '1.6' }}>{item.text}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div style={{ marginBottom: '24px' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: '600', color: '#334155', marginBottom: '16px' }}>
            ✅ 本周必做(每天1小时)
          </h3>
          <div style={{
            background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
            padding: '16px',
            borderRadius: '8px',
            borderLeft: '4px solid #3b82f6'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { id: 'action-4', text: '复盘当日涨停板,标注符合哪个策略' },
                { id: 'action-5', text: '找出1个OBV底背离+1个顶背离实例' },
                { id: 'action-6', text: '模拟盘用100股验证一次买入信号' }
              ].map((item) => (
                <label
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    cursor: 'pointer',
                    padding: '8px',
                    borderRadius: '6px',
                    transition: 'background 0.2s',
                    textDecoration: checkedItems.has(item.id) ? 'line-through' : 'none',
                    opacity: checkedItems.has(item.id) ? 0.6 : 1
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.5)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checkedItems.has(item.id)}
                    onChange={(e) => {
                      const newSet = new Set(checkedItems)
                      if (e.target.checked) {
                        newSet.add(item.id)
                      } else {
                        newSet.delete(item.id)
                      }
                      setCheckedItems(newSet)
                    }}
                    style={{
                      width: '20px',
                      height: '20px',
                      cursor: 'pointer',
                      accentColor: '#3b82f6'
                    }}
                  />
                  <span style={{ color: '#1e40af', lineHeight: '1.6' }}>{item.text}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div>
          <h3 style={{ fontSize: '1.2rem', fontWeight: '600', color: '#334155', marginBottom: '16px' }}>
            ✅ 本月必做
          </h3>
          <div style={{
            background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
            padding: '16px',
            borderRadius: '8px',
            borderLeft: '4px solid #f59e0b'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { id: 'action-7', text: '完成20笔小仓位实盘交易(盈亏不重要)' },
                { id: 'action-8', text: '建立交易日志,每笔打分(策略执行vs最终盈亏)' },
                { id: 'action-9', text: '统计自己最擅长哪个策略,最容易在哪里犯错' }
              ].map((item) => (
                <label
                  key={item.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    cursor: 'pointer',
                    padding: '8px',
                    borderRadius: '6px',
                    transition: 'background 0.2s',
                    textDecoration: checkedItems.has(item.id) ? 'line-through' : 'none',
                    opacity: checkedItems.has(item.id) ? 0.6 : 1
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.5)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checkedItems.has(item.id)}
                    onChange={(e) => {
                      const newSet = new Set(checkedItems)
                      if (e.target.checked) {
                        newSet.add(item.id)
                      } else {
                        newSet.delete(item.id)
                      }
                      setCheckedItems(newSet)
                    }}
                    style={{
                      width: '20px',
                      height: '20px',
                      cursor: 'pointer',
                      accentColor: '#f59e0b'
                    }}
                  />
                  <span style={{ color: '#92400e', lineHeight: '1.6' }}>{item.text}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 最后的话 */}
      <div style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        padding: '32px 24px',
        borderRadius: '16px',
        textAlign: 'center',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)'
      }}>
        <div style={{ fontSize: '1.1rem', lineHeight: '1.8', marginBottom: '16px', opacity: 0.95 }}>
          <div style={{ fontWeight: '700', marginBottom: '12px' }}>
            "这套体系不会让你一夜暴富,但会让你十年不败。"
          </div>
          <div>
            "当别人恐惧时你贪婪的前提是:你真的看到了资金的脚印。"
          </div>
        </div>
        <div style={{
          marginTop: '24px',
          padding: '16px',
          background: 'rgba(255,255,255,0.2)',
          borderRadius: '8px',
          fontSize: '1rem',
          fontWeight: '600'
        }}>
          现在,关掉所有学习资料,打开行情软件,开始你的1万小时刻意练习吧! 🚀
        </div>
      </div>

      {/* 返回顶部按钮 */}
      {showBackToTop && (
        <button
          onClick={scrollToTop}
          style={{
            position: 'fixed',
            bottom: '32px',
            right: '32px',
            width: '48px',
            height: '48px',
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
            border: 'none',
            borderRadius: '50%',
            cursor: 'pointer',
            fontSize: '1.5rem',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.3s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-4px)'
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.2)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'
          }}
        >
          ↑
        </button>
      )}
    </main>
  )
}

