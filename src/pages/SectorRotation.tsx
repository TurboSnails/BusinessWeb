import React, { useState, useEffect, useCallback } from 'react'

interface SectorData {
  name: string
  code: string // 板块代码
  changePercent: number
  rank: number
  date: string
}

interface SectorDetail {
  name: string
  code: string // 板块代码
  changePercent: number
  date: string
  rank: number
  timesInTop10: number // 近1个月排进前10的次数
}

interface HotStock {
  code: string // 股票代码
  name: string // 股票名称
  price: number // 最新价
  changePercent: number // 涨跌幅
  volume: number // 成交量
  amount: number // 成交额
}

export default function SectorRotation(): JSX.Element {
  const [selectedDates, setSelectedDates] = useState<string[]>([])
  const [sectorDataByDate, setSectorDataByDate] = useState<Record<string, SectorData[]>>({})
  // 保存财联社返回的原始板块数据（包含stock_list），用于获取热门股票
  const [plateRawDataByDate, setPlateRawDataByDate] = useState<Record<string, any[]>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedSector, setSelectedSector] = useState<SectorDetail | null>(null)
  const [hotStocks, setHotStocks] = useState<HotStock[]>([])
  const [loadingHotStocks, setLoadingHotStocks] = useState(false)
  const [filterType, setFilterType] = useState<'industry' | 'concept'>('concept')
  const [sortBy, setSortBy] = useState<'change' | 'rank'>('change')
  const [topN, setTopN] = useState<number>(10)
  
  // 从东方财富接口获取的板块类型映射（板块名称 -> 类型）
  const [sectorTypeMap, setSectorTypeMap] = useState<Map<string, 'industry' | 'concept'>>(new Map())
  const [sectorTypeMapLoaded, setSectorTypeMapLoaded] = useState(false)

  // CORS代理配置
  const CORS_PROXY_MAIN = (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`
  const CORS_PROXY_BACKUP = (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`
  const CORS_PROXY_THIRD = (url: string) => `https://proxy.cors.sh/${url}`
  const CORS_PROXIES = [CORS_PROXY_MAIN, CORS_PROXY_BACKUP, CORS_PROXY_THIRD]

  // 从东方财富接口获取板块类型映射
  const fetchSectorTypeMap = useCallback(async () => {
    if (sectorTypeMapLoaded) return
    
    try {
      console.log('🔄 从东方财富接口获取板块类型映射...')
      const typeMap = new Map<string, 'industry' | 'concept'>()
      
      // 获取行业板块列表 (m:90+t:2)
      const industryUrl = `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=500&po=1&np=1&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fid=f3&fs=m:90+t:2`
      const industryProxyUrl = CORS_PROXY_MAIN(industryUrl)
      const industryResponse = await fetch(industryProxyUrl, {
        headers: { 'Accept': 'application/json' }
      })
      
      if (industryResponse.ok) {
        const industryData = await industryResponse.json()
        const industryList = industryData?.data?.diff || []
        industryList.forEach((item: any) => {
          const name = (item.f14 || item.name || '').trim()
          if (name) {
            // 添加原始名称
            typeMap.set(name, 'industry')
            // 添加去掉"行业"、"板块"后缀的版本
            const nameClean = name.replace(/行业$|板块$/, '').trim()
            if (nameClean && nameClean !== name && nameClean.length > 0) {
              typeMap.set(nameClean, 'industry')
            }
            // 如果原名称没有"行业"后缀，也添加带"行业"的版本
            if (!name.includes('行业') && !name.includes('板块')) {
              typeMap.set(name + '行业', 'industry')
            }
          }
        })
        console.log(`✅ 获取到 ${industryList.length} 个行业板块，映射表大小: ${typeMap.size}`)
        // 显示前10个行业板块名称
        const industryNames = industryList.slice(0, 10).map((item: any) => item.f14 || item.name)
        console.log(`  行业板块示例（前10个）:`, industryNames)
        // 检查"纺织服装"是否在映射表中
        if (typeMap.has('纺织服装')) {
          console.log(`  ✅ "纺织服装"在映射表中，类型: ${typeMap.get('纺织服装')}`)
        } else {
          console.log(`  ⚠️ "纺织服装"不在映射表中`)
          // 查找包含"纺织"的键
          const textileKeys = Array.from(typeMap.keys()).filter(k => k.includes('纺织'))
          console.log(`  包含"纺织"的键:`, textileKeys)
        }
        // 检查"有色金属"是否在映射表中
        if (typeMap.has('有色金属')) {
          console.log(`  ✅ "有色金属"在映射表中，类型: ${typeMap.get('有色金属')}`)
        } else {
          console.log(`  ⚠️ "有色金属"不在映射表中`)
          // 查找包含"有色"的键
          const metalKeys = Array.from(typeMap.keys()).filter(k => k.includes('有色'))
          console.log(`  包含"有色"的键:`, metalKeys)
        }
      }
      
      // 获取概念板块列表 (m:90+t:3) - 获取更多数据
      const conceptUrl = `https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=1000&po=1&np=1&ut=bd1d9ddb04089700cf9c27f6f7426281&fltt=2&invt=2&fid=f3&fs=m:90+t:3`
      const conceptProxyUrl = CORS_PROXY_MAIN(conceptUrl)
      const conceptResponse = await fetch(conceptProxyUrl, {
        headers: { 'Accept': 'application/json' }
      })
      
      if (conceptResponse.ok) {
        const conceptData = await conceptResponse.json()
        const conceptList = conceptData?.data?.diff || []
        conceptList.forEach((item: any) => {
          const name = (item.f14 || item.name || '').trim()
          if (name) {
            // 添加原始名称
            typeMap.set(name, 'concept')
            // 添加去掉"概念"后缀的版本
            const nameClean = name.replace(/概念$|题材$|主题$/, '').trim()
            if (nameClean && nameClean !== name) {
              typeMap.set(nameClean, 'concept')
            }
            // 添加"概念"后缀的版本（如果原名称没有）
            if (!name.includes('概念') && !name.includes('题材') && !name.includes('主题')) {
              typeMap.set(name + '概念', 'concept')
            }
          }
        })
        console.log(`✅ 获取到 ${conceptList.length} 个概念板块，映射表大小: ${typeMap.size}`)
        // 显示前10个概念板块名称
        const conceptNames = conceptList.slice(0, 10).map((item: any) => item.f14 || item.name)
        console.log(`  概念板块示例（前10个）:`, conceptNames)
      }
      
      setSectorTypeMap(typeMap)
      setSectorTypeMapLoaded(true)
      console.log(`✅ 板块类型映射加载完成，共 ${typeMap.size} 个板块`)
      // 显示所有映射的键（前30个）
      const allKeys = Array.from(typeMap.keys()).slice(0, 30)
      console.log(`  映射表键示例（前30个）:`, allKeys)
    } catch (error) {
      console.warn('⚠️ 获取板块类型映射失败，将使用关键词匹配:', error)
      setSectorTypeMapLoaded(true) // 标记为已加载，避免重复请求
    }
  }, [sectorTypeMapLoaded])
  
  // 初始化时获取板块类型映射
  useEffect(() => {
    fetchSectorTypeMap()
  }, [fetchSectorTypeMap])

  // 初始化日期列表（最近7个交易日，跳过周末和节假日）
  useEffect(() => {
    // 中国节假日列表（2025-2026年）
    const holidays = [
      // 2025年节假日
      '2025-01-01', // 元旦
      '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31', // 春节
      '2025-02-03', '2025-02-04', '2025-02-05', '2025-02-06', '2025-02-07',
      '2025-04-04', '2025-04-05', '2025-04-06', // 清明节
      '2025-05-01', '2025-05-02', '2025-05-03', '2025-05-04', '2025-05-05', // 劳动节
      '2025-05-31', // 端午节
      '2025-10-01', '2025-10-02', '2025-10-03', '2025-10-04', '2025-10-05', '2025-10-06', '2025-10-07', '2025-10-08', // 国庆节
      // 2026年节假日
      '2026-01-01', '2026-01-02', '2026-01-03', // 元旦
      '2026-02-16', '2026-02-17', '2026-02-18', '2026-02-19', '2026-02-20', '2026-02-21', '2026-02-22', // 春节
      '2026-04-04', '2026-04-05', '2026-04-06', // 清明节
      '2026-05-01', '2026-05-02', '2026-05-03', // 劳动节
      '2026-06-19', '2026-06-20', '2026-06-21', '2026-06-22', // 端午节
      '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', // 国庆节
    ]

    const dates: string[] = []
    const today = new Date()
    let count = 0
    let currentDate = new Date(today)
    
    // 获取最近7个交易日（跳过周末和节假日）
    while (dates.length < 7 && count < 21) {
      const dayOfWeek = currentDate.getDay()
      const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`
      
      // 跳过周末和节假日
      if (dayOfWeek !== 0 && dayOfWeek !== 6 && !holidays.includes(dateStr)) {
        dates.push(dateStr)
      }
      currentDate.setDate(currentDate.getDate() - 1)
      count++
    }
    
    setSelectedDates(dates)
  }, [])

  // 获取单个日期的板块数据（使用财联社API，支持历史日期）
  // 返回处理后的板块数据和原始数据
  const fetchSectorData = useCallback(async (date: string): Promise<{sectors: SectorData[], rawData: any[]}> => {
    const dateStr = date.replace(/-/g, '')
    // 财联社API支持历史日期参数
    const apiUrl = `https://x-quote.cls.cn/v2/quote/a/plate/up_down_analysis?up_limit=0&date=${dateStr}`
    
    console.log(`📅 获取${filterType === 'industry' ? '行业' : '概念'}板块数据，日期: ${date}`)
    
    const fetchFromProxy = async (proxyFn: (url: string) => string): Promise<any> => {
      const proxyUrl = proxyFn(apiUrl)
      const response = await fetch(proxyUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json, text/html, */*',
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15'
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const contentType = response.headers.get('content-type') || ''
      
      if (contentType.includes('application/json')) {
        return await response.json()
      } else {
        const html = await response.text()
        // 尝试从HTML中提取JSON
        const scriptMatch = 
          html.match(/<script[^>]*>[\s\S]*?window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/i) ||
          html.match(/<script[^>]*>[\s\S]*?var\s+data\s*=\s*({[\s\S]*?});/i) ||
          html.match(/<script[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/i)
        
        if (scriptMatch && scriptMatch[1]) {
          return JSON.parse(scriptMatch[1])
        }
        throw new Error('无法从HTML中提取JSON')
      }
    }

    // 尝试多个代理
    for (const proxy of CORS_PROXIES) {
      try {
        const data = await fetchFromProxy(proxy)
        
        // 财联社API返回格式：{ code: 200, data: { plate_stock: [...] } }
        if (data?.code === 200 && data?.data?.plate_stock) {
          const plateStockData = data.data.plate_stock
          
          // 根据类型过滤板块数据
          // 优先检查API返回的字段，如果没有类型字段，则使用智能匹配
          let matchMethod = 'name' // 记录使用的匹配方法：'api', 'code', 'name'
          let hasApiTypeField = false
          
          const filteredData = plateStockData.filter((plate: any) => {
            const name = String(plate.secu_name || plate.name || '').trim()
            const code = String(plate.secu_code || plate.code || plate.plate_code || '').trim()
            
            // 方法1：检查API是否有类型字段（最可靠）
            const plateType = plate.plate_type || plate.type || plate.category || plate.kind || plate.class
            if (plateType) {
              matchMethod = 'api'
              const typeStr = String(plateType).toLowerCase()
              if (filterType === 'industry') {
                return typeStr.includes('industry') || typeStr.includes('行业') || typeStr === '2'
              } else {
                return typeStr.includes('concept') || typeStr.includes('概念') || typeStr === '3'
              }
            }
            
            // 方法2：使用从东方财富接口获取的板块类型映射（最可靠，不依赖本地关键词）
            if (sectorTypeMapLoaded && sectorTypeMap.size > 0) {
              // 清理名称：去掉常见后缀，用于匹配
              const cleanName = (n: string) => {
                return n
                  .replace(/概念$|题材$|主题$|行业$|板块$|产业链$/, '')
                  .trim()
              }
              
              const nameCleaned = cleanName(name)
              
              // 调试：只在第一个板块时输出详细信息
              const isFirstPlate = plateStockData.indexOf(plate) === 0
              
              // 调试：输出匹配尝试信息（仅对特定板块）
              if (isFirstPlate || name === '纺织服装' || name === '有色金属概念') {
                console.log(`  🔍 尝试匹配板块: "${name}" (清理后: "${nameCleaned}"), 目标类型: ${filterType}`)
              }
              
              // 1. 精确匹配
              let mappedType = sectorTypeMap.get(name)
              if (mappedType) {
                matchMethod = 'apiMap'
                if (isFirstPlate || name === '纺织服装' || name === '有色金属概念') {
                  console.log(`  ✅ 精确匹配: "${name}" -> ${mappedType}`)
                }
                return mappedType === filterType
              }
              
              // 2. 清理后的名称匹配（去掉"概念"等后缀后匹配）
              mappedType = sectorTypeMap.get(nameCleaned)
              if (mappedType) {
                matchMethod = 'apiMap'
                if (isFirstPlate || name === '纺织服装' || name === '有色金属概念') {
                  console.log(`  ✅ 清理后匹配: "${nameCleaned}" -> ${mappedType}`)
                }
                return mappedType === filterType
              }
              
              // 调试：如果"纺织服装"或"有色金属概念"没有匹配上，输出详细信息
              if (name === '纺织服装' || name === '有色金属概念') {
                console.log(`  ⚠️ "${name}" 未在步骤1-2中匹配`)
                console.log(`  检查映射表: has("${name}") = ${sectorTypeMap.has(name)}, has("${nameCleaned}") = ${sectorTypeMap.has(nameCleaned)}`)
                if (name === '有色金属概念') {
                  console.log(`  检查"有色金属": has("有色金属") = ${sectorTypeMap.has('有色金属')}, type = ${sectorTypeMap.get('有色金属')}`)
                }
              }
              
              // 3. 反向清理匹配（映射表中的名称去掉后缀后，与财联社名称匹配）
              for (const [mappedName, mappedType] of sectorTypeMap.entries()) {
                const mappedNameCleaned = cleanName(mappedName)
                // 如果财联社名称（清理后）等于映射表名称（清理后），则匹配
                if (nameCleaned === mappedNameCleaned && nameCleaned.length > 0) {
                  matchMethod = 'apiMap'
                  if (isFirstPlate) {
                    console.log(`  ✅ 反向清理匹配: "${nameCleaned}" <-> "${mappedNameCleaned}" -> ${mappedType}`)
                  }
                  return mappedType === filterType
                }
                // 如果财联社名称（清理后）等于映射表原始名称，也匹配
                if (nameCleaned === mappedName && nameCleaned.length > 0) {
                  matchMethod = 'apiMap'
                  if (isFirstPlate) {
                    console.log(`  ✅ 反向清理匹配2: "${nameCleaned}" <-> "${mappedName}" -> ${mappedType}`)
                  }
                  return mappedType === filterType
                }
                // 如果财联社原始名称等于映射表名称（清理后），也匹配
                if (name === mappedNameCleaned && mappedNameCleaned.length > 0) {
                  matchMethod = 'apiMap'
                  if (isFirstPlate) {
                    console.log(`  ✅ 反向清理匹配3: "${name}" <-> "${mappedNameCleaned}" -> ${mappedType}`)
                  }
                  return mappedType === filterType
                }
                // 如果财联社原始名称等于映射表原始名称，也匹配（这个应该在步骤1就匹配了，但为了保险再加一次）
                if (name === mappedName) {
                  matchMethod = 'apiMap'
                  if (isFirstPlate) {
                    console.log(`  ✅ 反向清理匹配4: "${name}" <-> "${mappedName}" -> ${mappedType}`)
                  }
                  return mappedType === filterType
                }
              }
              
              // 4. 双向包含匹配（更宽松）
              for (const [mappedName, mappedType] of sectorTypeMap.entries()) {
                const mappedNameCleaned = cleanName(mappedName)
                
                // 双向包含匹配（原始名称和清理后的名称都尝试）
                if (name === mappedName || nameCleaned === mappedNameCleaned ||
                    name.includes(mappedName) || mappedName.includes(name) ||
                    nameCleaned.includes(mappedNameCleaned) || mappedNameCleaned.includes(nameCleaned) ||
                    name.includes(mappedNameCleaned) || mappedNameCleaned.includes(name) ||
                    mappedName.includes(nameCleaned) || nameCleaned.includes(mappedName)) {
                  matchMethod = 'apiMap'
                  if (isFirstPlate) {
                    console.log(`  ✅ 包含匹配: "${name}" <-> "${mappedName}" -> ${mappedType}`)
                  }
                  return mappedType === filterType
                }
              }
              
              // 4. 关键词匹配（提取核心关键词，至少3个字）
              const extractKeywords = (n: string) => {
                const keywords: string[] = []
                // 提取3-6字的关键词（更精确）
                for (let len = 6; len >= 3; len--) {
                  for (let i = 0; i <= n.length - len; i++) {
                    const keyword = n.substring(i, i + len)
                    if (keyword.length >= 3) {
                      keywords.push(keyword)
                    }
                  }
                }
                return keywords
              }
              
              const nameKeywords = extractKeywords(nameCleaned)
              for (const [mappedName, mappedType] of sectorTypeMap.entries()) {
                const mappedNameCleaned = cleanName(mappedName)
                const mappedKeywords = extractKeywords(mappedNameCleaned)
                
                // 检查是否有共同的关键词（至少3个字匹配）
                const commonKeywords = nameKeywords.filter(k => 
                  mappedKeywords.some(mk => k === mk && k.length >= 3)
                )
                
                if (commonKeywords.length > 0) {
                  matchMethod = 'apiMap'
                  if (isFirstPlate) {
                    console.log(`  ✅ 关键词匹配: "${name}" <-> "${mappedName}" (共同关键词: ${commonKeywords.join(', ')}) -> ${mappedType}`)
                  }
                  return mappedType === filterType
                }
              }
              
              // 如果所有匹配都失败，输出调试信息
              if (isFirstPlate) {
                console.log(`  ⚠️ 板块 "${name}" 未在映射表中找到匹配`)
                console.log(`  映射表大小: ${sectorTypeMap.size}`)
                // 显示映射表中的前20个板块名称作为参考
                const sampleNames = Array.from(sectorTypeMap.keys()).slice(0, 20)
                console.log(`  映射表示例（前20个）:`, sampleNames)
                // 显示财联社的板块名称
                const clsNames = plateStockData.slice(0, 10).map((p: any) => p.secu_name || p.name)
                console.log(`  财联社板块名称（前10个）:`, clsNames)
              }
            }
            
            // 方法3：根据板块代码模式判断（如果有规律）
            // 财联社代码格式可能是：cls80290（概念）、cls80123（行业）等
            // 如果代码有规律，可以根据代码范围判断
            // 注意：这个需要根据实际数据调整
            // TODO: 分析板块代码规律，如果发现规律，可以添加代码模式匹配
            
            // 方法4：使用名称关键词匹配（fallback，仅在接口映射未加载时使用）
            // 先定义概念和行业关键词列表（两个分支都需要用到）
            const conceptKeywords = [
              // AI相关
              'AI', '人工智能', 'ChatGPT', 'Sora', 'Kimi', 'AIGC', '多模态', '文生视频', '文生图', '大模型',
              'AI制药', 'AI语料', 'AI芯片', '智谱AI',
              // 芯片相关
              '存储芯片', '汽车芯片', '第三代半导体', '第四代半导体', '芯片产业链',
              // 机器人相关
              '机器人', '人形机器人', '工业机器人', '服务机器人', '机器人执行器',
              // 智能相关
              '智能驾驶', '自动驾驶', '无人驾驶', '车联网', '智能汽车',
              // 新能源相关
              '光伏', '风电', '储能', '氢能', '锂电池', '钠电池', '固态电池', '钙钛矿', 'HJT', 'TOPCon', 'BC电池',
              // 数字相关
              '数字货币', '数字人民币', '区块链', '元宇宙', 'Web3', 'NFT',
              // 数据相关
              '数据要素', '数据确权', '数据安全', '数据交易', '数据资产',
              // 信创相关
              '信创', '国产软件', '国产芯片', '国产替代', '自主可控',
              // 航天相关
              '卫星', '卫星互联网', '卫星导航', '空间站', '商业航天',
              // 医疗生物相关
              '人脑工程', 'CAR-T', '细胞疗法', '重组蛋白', '基因测序',
              // 其他新兴概念
              '同步磁阻电机', '减速器', '3D玻璃', '噪声防治',
              'UWB', '碳纤', 'PEEK', '华为', '跨境', '支付',
              '飞行汽车', '低空经济', 'eVTOL',
              '量子', '量子通信', '量子计算',
              '6G', 'MR', 'VR', 'AR', 'XR',
              '超导', '室温超导', '可控核聚变',
              '减肥药', '创新药', 'CRO', 'CDMO',
              '辅助生殖', '养老', '医美', '医疗美容',
              'PLC', '产业链'
            ]
            
            const industryKeywords = [
              '银行', '保险', '证券', '房地产开发', '建筑', '建材', '水泥', '钢铁', '有色金属', '煤炭', '石油',
              '电力', '公用事业', '交通运输', '物流', '港口', '航运', '航空机场', '铁路公路',
              '汽车整车', '汽车零部件', '家电', '食品饮料', '酿酒', '餐饮', '旅游酒店', '商业百货', '商业零售',
              '纺织服装', '轻工', '造纸', '印刷', '包装', '家具', '装饰', '装修', '机械', '设备',
              '医药商业', '医疗服务', '医疗器械', '农业', '畜牧', '渔业', '林业', '种植', '化肥', '农药', '种子',
              '通信服务', '通信设备', '电子元件', '电子化学品', '计算机设备', '文化传媒', '教育', '体育', '娱乐', '影视',
              '船舶制造', '贵金属', '生物制品', '化学制药', '互联网服务', '能源金属', '软件开发',
              '专业服务', '装修装饰', '中药', '消费电子', '美容护理', '风电设备', '装修建材', '非金属材料',
              '仪器仪表', '玻璃玻纤', '小金属', '采掘行业', '环保行业', '房地产服务', '贸易行业', '电网设备',
              '电源设备', '化学制品', '光伏设备', '专用设备', '工程建设', '燃气', '包装材料',
              '化学原料', '综合行业', '光学光电子', '塑料制品', '珠宝首饰', '通用设备', '工程咨询服务',
              '交运设备', '化纤行业', '工程机械', '农牧饲渔', '造纸印刷', '水泥建材', '多元金融',
              '汽车服务', '钢铁行业', '石油行业', '航运港口', '电机', '铁路公路',
              '化工', '化学', '零售', '百货', '传媒', '文化', '影视', '娱乐', '体育'
            ]
            
            // 特殊的"工程"相关处理
            const engineeringConceptKeywords = ['算力', '光通信', '智能', 'AI', '芯片', '机器人', '新能源', '储能', '氢能']
            const hasEngineeringConcept = name.includes('工程') && engineeringConceptKeywords.some(ck => name.includes(ck))
            
            if (filterType === 'industry') {
              // 行业板块过滤逻辑：
              // 1. 如果包含"概念"、"题材"、"主题"，肯定不是行业
              if (name.includes('概念') || name.includes('题材') || name.includes('主题')) {
                return false
              }
              // 2. 如果包含概念关键词，不是行业
              if (conceptKeywords.some(keyword => name.includes(keyword))) {
                return false
              }
              // 3. 如果包含行业关键词，且不包含概念关键词，是行业
              const isInIndustryList = industryKeywords.some(keyword => {
                if (name.includes(keyword)) {
                  // 特殊处理：如果包含"工程"且前面有概念关键词，则不是行业
                  if (hasEngineeringConcept) {
                    return false
                  }
                  return true
                }
                return false
              })
              if (isInIndustryList) {
                return true
              }
              // 4. 如果既不在行业列表也不在概念列表，且不包含"概念"等，也认为是行业（默认）
              return true
            } else {
              // 概念板块过滤逻辑：
              // 1. 如果包含"概念"、"题材"、"主题"，肯定是概念
              if (name.includes('概念') || name.includes('题材') || name.includes('主题')) {
                return true
              }
              // 2. 如果包含概念关键词，是概念
              if (conceptKeywords.some(keyword => name.includes(keyword))) {
                return true
              }
              // 3. 如果包含行业关键词，且不包含概念关键词，不是概念
              const isInIndustryList = industryKeywords.some(keyword => {
                if (name.includes(keyword)) {
                  // 特殊处理：如果包含"工程"且前面有概念关键词，则不是行业（是概念）
                  if (hasEngineeringConcept) {
                    return false
                  }
                  return true
                }
                return false
              })
              if (isInIndustryList) {
                return false
              }
              // 4. 如果既不在行业列表也不在概念列表，且不包含"概念"等，也认为是概念（默认）
              return true
            }
          })
          
          // 调试信息：显示过滤前后的对比
          if (filterType === 'concept') {
            console.log(`🔍 概念板块过滤详情 (日期: ${date}):`)
            console.log(`  原始数据: ${plateStockData.length} 个`)
            console.log(`  过滤后: ${filteredData.length} 个`)
            if (matchMethod === 'api') {
              console.log(`  匹配方法: API类型字段`)
            } else if (matchMethod === 'apiMap') {
              console.log(`  匹配方法: 东方财富接口映射 (映射表: ${sectorTypeMap.size}个板块)`)
            } else {
              console.log(`  匹配方法: 名称关键词匹配 (fallback)`)
            }
            
            // 调试：如果使用apiMap但匹配失败，记录详细信息
            if (sectorTypeMapLoaded && sectorTypeMap.size > 0 && matchMethod !== 'apiMap' && matchMethod !== 'api') {
              // 只在第一个板块时输出，避免日志过多
              if (plateStockData.indexOf(plate) === 0) {
                console.log(`  ⚠️ 板块 "${name}" 未在映射表中找到匹配，映射表大小: ${sectorTypeMap.size}`)
                // 显示映射表中的前10个板块名称作为参考
                const sampleNames = Array.from(sectorTypeMap.keys()).slice(0, 10)
                console.log(`  映射表示例:`, sampleNames)
              }
            }
            if (plateStockData.length > 0) {
              const sampleNames = plateStockData.slice(0, 20).map((p: any) => p.secu_name || p.name)
              console.log(`  前20个原始板块:`, sampleNames)
              
              // 分析哪些被过滤掉了
              const filteredOut = plateStockData.filter((plate: any) => {
                const name = String(plate.secu_name || plate.name || '').trim()
                // 检查是否被过滤掉（不在filteredData中）
                return !filteredData.some((f: any) => (f.secu_name || f.name || '').trim() === name)
              }).slice(0, 10)
              
              if (filteredOut.length > 0) {
                console.log(`  被过滤掉的板块（前10个）:`, filteredOut.map((p: any) => p.secu_name || p.name))
              }
            }
            if (filteredData.length > 0) {
              const filteredNames = filteredData.slice(0, 20).map((p: any) => p.secu_name || p.name)
              console.log(`  前20个过滤后板块:`, filteredNames)
            } else {
              console.warn(`  ⚠️ 过滤后无数据！`)
              console.warn(`  匹配策略说明：`)
              console.warn(`    1. 检查是否包含"概念"、"题材"、"主题"`)
              console.warn(`    2. 检查是否包含概念关键词（如"智能驾驶"、"AI"等）`)
              console.warn(`    3. 排除明确的行业板块（如"银行"、"保险"等）`)
              console.warn(`    4. 其他情况都认为是概念板块`)
              console.warn(`  ⚠️ 过滤后无数据，请检查关键词列表是否完整`)
            }
          }
          
          console.log(`📊 ${filterType === 'industry' ? '行业' : '概念'}板块过滤: ${filteredData.length} 个 (总共 ${plateStockData.length} 个)`)
          
          // 数据量检查：如果过滤后数据太少，使用降级方案
          if (filteredData.length === 0) {
            console.warn(`⚠️ 过滤后无数据！类型: ${filterType}, 日期: ${date}`)
            console.warn(`原始数据量: ${plateStockData.length}`)
            if (plateStockData.length > 0) {
              console.warn(`前10个板块名称:`, plateStockData.slice(0, 10).map((p: any) => p.secu_name || p.name || '未知'))
            }
            
            // 降级方案：如果概念板块过滤后为空，使用更宽松的策略
            if (filterType === 'concept' && plateStockData.length > 0) {
              console.warn(`🔄 概念板块过滤后为空，使用降级方案：显示所有非明确行业板块`)
              // 使用更宽松的过滤：只要不是明确的行业板块，都显示
              const fallbackData = plateStockData.filter((plate: any) => {
                const name = String(plate.secu_name || plate.name || '').trim()
                // 排除明确的行业板块（只排除精确匹配的）
                const strictIndustryKeywords = [
                  '银行', '保险', '证券', '房地产开发', '建筑', '建材', '水泥', '钢铁', '有色金属', '煤炭', '石油',
                  '电力', '公用事业', '交通运输', '物流', '港口', '航运', '航空机场', '铁路公路',
                  '汽车整车', '汽车零部件', '家电', '食品饮料', '酿酒', '餐饮', '旅游酒店', '商业百货',
                  '纺织服装', '轻工', '造纸', '印刷', '包装', '家具', '装饰', '装修', '工程', '机械', '设备',
                  '医药商业', '医疗服务', '医疗器械', '农业', '畜牧', '渔业', '林业', '种植', '化肥', '农药', '种子',
                  '通信服务', '通信设备', '电子元件', '电子化学品', '计算机设备', '文化传媒', '教育', '体育', '娱乐'
                ]
                // 只排除精确匹配的行业板块
                return !strictIndustryKeywords.includes(name)
              })
              
              if (fallbackData.length > 0) {
                console.log(`✅ 降级方案获取到 ${fallbackData.length} 个板块`)
                // 使用降级数据
                const fallbackSectors = fallbackData
                  .map((plate: any) => {
                    const name = plate.secu_name || plate.name || plate.plate_name || ''
                    const code = plate.secu_code || plate.code || plate.plate_code || ''
                    const changeValue = plate.change_percent || plate.change || plate.changePercent || 0
                    const changePercent = Math.abs(changeValue) > 1 ? changeValue : changeValue * 100
                    
                    return {
                      name: String(name).trim(),
                      code: String(code).trim(),
                      changePercent: parseFloat(String(changePercent)) || 0,
                      rank: 0,
                      date: date
                    }
                  })
                  .filter((s: SectorData) => s.name && s.name.length > 0)
                  .sort((a: SectorData, b: SectorData) => b.changePercent - a.changePercent)
                  .map((sector: SectorData, index: number) => ({
                    ...sector,
                    rank: index + 1
                  }))
                  .slice(0, topN)
                
                return fallbackSectors
              }
            }
            
            // 如果原始数据有，但过滤后为空，可能是过滤逻辑太严格
            // 返回空数组，让用户知道需要调整过滤条件
          } else if (filteredData.length < plateStockData.length * 0.1) {
            // 如果过滤后数据少于总数的10%，给出警告
            console.warn(`⚠️ 过滤后数据较少！类型: ${filterType}, 日期: ${date}`)
            console.warn(`过滤后: ${filteredData.length} 个，原始: ${plateStockData.length} 个 (${(filteredData.length / plateStockData.length * 100).toFixed(1)}%)`)
          }
          
          // 解析板块数据
          const sectors: SectorData[] = filteredData
            .map((plate: any) => {
              // 财联社API可能返回的字段：secu_code, code, plate_code等
              // 打印第一个板块的完整数据用于调试，检查是否有类型字段
              if (filteredData.indexOf(plate) === 0) {
                console.log('📊 财联社板块完整数据结构:', plate)
                console.log('📊 财联社板块所有字段:', Object.keys(plate))
                // 检查是否有类型相关字段
                const typeRelatedFields = Object.keys(plate).filter(key => 
                  key.toLowerCase().includes('type') || 
                  key.toLowerCase().includes('category') || 
                  key.toLowerCase().includes('kind') ||
                  key.toLowerCase().includes('class')
                )
                if (typeRelatedFields.length > 0) {
                  console.log('✅ 发现可能的类型字段:', typeRelatedFields)
                  typeRelatedFields.forEach(field => {
                    console.log(`  ${field}:`, plate[field])
                  })
                } else {
                  console.log('ℹ️ API未返回类型字段，使用接口映射或关键词匹配')
                }
              }
              
              // 尝试多种可能的字段名
              const name = plate.secu_name || plate.name || plate.plate_name || ''
              const code = plate.secu_code || plate.code || plate.plate_code || ''
              // 涨跌幅可能是百分比（如 5.2 表示 5.2%）或小数（如 0.052 表示 5.2%）
              const changeValue = plate.change_percent || plate.change || plate.changePercent || 0
              const changePercent = Math.abs(changeValue) > 1 ? changeValue : changeValue * 100
              
              return {
                name: String(name).trim(),
                code: String(code).trim(),
                changePercent: parseFloat(String(changePercent)) || 0,
                rank: 0, // 稍后排序后设置
                date: date
              }
            })
            .filter((s: SectorData) => s.name && s.name.length > 0) // 过滤掉空名称
            .sort((a: SectorData, b: SectorData) => b.changePercent - a.changePercent)
            .map((sector: SectorData, index: number) => ({
              ...sector,
              rank: index + 1
            }))
            .slice(0, topN) // 只取前N名
          
          console.log(`✅ ${filterType === 'industry' ? '行业' : '概念'}板块数据: ${sectors.length} 个`)
          if (sectors.length > 0) {
            console.log('📊 前3个板块代码:', sectors.slice(0, 3).map(s => ({ name: s.name, code: s.code })))
          }
          
          // 返回处理后的板块数据和原始数据
          return { sectors, rawData: filteredData }
        }
      } catch (err) {
        console.warn(`代理 ${proxy} 失败:`, err)
        continue
      }
    }
    
    return { sectors: [], rawData: [] }
  }, [topN, filterType, sectorTypeMap, sectorTypeMapLoaded])

  // 获取所有日期的数据
  useEffect(() => {
    if (selectedDates.length === 0) return

    const fetchAllDates = async () => {
      console.log(`🔄 开始获取所有日期数据，类型: ${filterType}`)
      setLoading(true)
      setError(null)
      // 清空旧数据，避免显示混合数据
      setSectorDataByDate({})
      setPlateRawDataByDate({})
      
      try {
        // 直接获取数据，不依赖外部概念列表
        const dataPromises = selectedDates.map(date => fetchSectorData(date))
        const results = await Promise.allSettled(dataPromises)
        
        const dataByDate: Record<string, SectorData[]> = {}
        const rawDataByDate: Record<string, any[]> = {}
        
        results.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value && result.value.sectors && result.value.sectors.length > 0) {
            // 只保留有数据的日期
            dataByDate[selectedDates[index]] = result.value.sectors
            // 同时保存原始数据
            rawDataByDate[selectedDates[index]] = result.value.rawData || []
            console.log(`✅ ${selectedDates[index]} 获取到 ${result.value.sectors.length} 个${filterType === 'industry' ? '行业' : '概念'}板块`)
          } else {
            console.warn(`获取 ${selectedDates[index]} 的数据失败或无数据:`, result.status === 'fulfilled' ? '空数据' : result.reason)
            // 不添加到 dataByDate，这样渲染时就不会显示该列
          }
        })
        
        console.log(`📊 所有日期数据获取完成，共 ${Object.keys(dataByDate).length} 个日期有数据`)
        setSectorDataByDate(dataByDate)
        setPlateRawDataByDate(rawDataByDate)
        
      } catch (err) {
        console.error('获取数据失败:', err)
        setError('获取数据失败，请稍后重试')
      } finally {
        setLoading(false)
      }
    }

    // 等待板块类型映射加载完成后再获取数据
    if (sectorTypeMapLoaded) {
      fetchAllDates()
    }
  }, [selectedDates, fetchSectorData, filterType, sectorTypeMapLoaded])

  // 获取板块热门股票（直接使用财联社返回的stock_list）
  const fetchHotStocks = useCallback(async (sectorCode: string, sectorName: string): Promise<HotStock[]> => {
    console.log(`🔍 获取热门股票，板块代码: ${sectorCode}, 板块名称: ${sectorName}`)
    
    // 从已保存的财联社原始数据中查找对应的板块
    // 遍历所有日期的原始数据，查找匹配的板块
    for (const date in plateRawDataByDate) {
      const rawData = plateRawDataByDate[date]
      if (!rawData || !Array.isArray(rawData)) continue
      
      // 查找匹配的板块（通过代码或名称）
      const matchedPlate = rawData.find((plate: any) => {
        const plateCode = String(plate.secu_code || plate.code || plate.plate_code || '').trim()
        const plateName = String(plate.secu_name || plate.name || '').trim()
        return (sectorCode && plateCode === sectorCode) || (sectorName && plateName === sectorName)
      })
      
      if (matchedPlate && matchedPlate.stock_list && Array.isArray(matchedPlate.stock_list)) {
        console.log(`✅ 从财联社数据中找到板块，股票数量: ${matchedPlate.stock_list.length}`)
        
        // 解析财联社返回的股票数据
        // secu_code: 股票代码
        // secu_name: 股票名称
        // last_px: 最新价
        // change: 涨跌幅（小数形式，需要乘以100）
        // volume: 成交量（可能需要转换单位）
        // amount: 成交额（可能需要转换单位）
        const stocks: HotStock[] = matchedPlate.stock_list
          .map((stock: any) => {
            const code = stock.secu_code || ''
            const name = stock.secu_name || ''
            const price = parseFloat(stock.last_px || stock.price || 0)
            // change 是小数形式，如 0.0997 表示 9.97%，需要乘以100
            const changePercent = parseFloat(stock.change || 0) * 100
            // 成交量单位可能是手，需要确认
            const volume = parseFloat(stock.volume || stock.vol || 0)
            // 成交额单位可能是元，需要转换为万元
            const amount = parseFloat(stock.amount || stock.amt || 0) / 10000
            
            return {
              code,
              name,
              price,
              changePercent,
              volume,
              amount
            }
          })
          .filter((s: HotStock) => s.name && s.code)
          .sort((a: HotStock, b: HotStock) => b.changePercent - a.changePercent) // 按涨跌幅排序
          .slice(0, 20) // 只取前20只
        
        console.log(`✅ 成功解析 ${stocks.length} 只热门股票`)
        return stocks
      }
    }
    
    console.warn(`⚠️ 未在财联社数据中找到板块: ${sectorName} (代码: ${sectorCode})`)
    return []
  }, [plateRawDataByDate])

  // 处理板块点击
  const handleSectorClick = async (sector: SectorData) => {
    console.log('🖱️ 点击板块:', { name: sector.name, code: sector.code, date: sector.date })
    
    // 计算该板块在已获取的日期中排进前N名的次数
    // 注意：这里统计的是已获取的日期，不是真正的"近1个月"
    let timesInTopN = 0
    Object.values(sectorDataByDate).forEach(sectors => {
      // 检查该板块是否在该日期的前N名中
      const found = sectors.find(s => s.name === sector.name && s.code === sector.code)
      if (found && found.rank <= topN) {
        timesInTopN++
      }
    })
    
    setSelectedSector({
      name: sector.name,
      code: sector.code,
      changePercent: sector.changePercent,
      date: sector.date,
      rank: sector.rank,
      timesInTop10: timesInTopN
    })
    
    // 获取该板块的热门股票
    if (sector.code || sector.name) {
      console.log('📥 开始获取热门股票，参数:', { code: sector.code, name: sector.name })
      setLoadingHotStocks(true)
      setHotStocks([]) // 先清空，避免显示旧数据
      try {
        const stocks = await fetchHotStocks(sector.code, sector.name)
        console.log('✅ 热门股票获取完成，数量:', stocks.length)
        setHotStocks(stocks)
      } catch (err) {
        console.error('❌ 获取热门股票失败:', err)
        setHotStocks([])
      } finally {
        setLoadingHotStocks(false)
      }
    } else {
      console.warn('⚠️ 板块代码和名称都为空，无法获取热门股票')
    }
  }

  // 格式化日期显示
  const formatDateDisplay = (date: string): string => {
    const d = new Date(date)
    const month = d.getMonth() + 1
    const day = d.getDate()
    return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  // 格式化完整日期
  const formatFullDate = (date: string): string => {
    return date
  }

  return (
    <main className="container" style={{ padding: '20px 16px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* 页面标题 */}
      <div style={{
        background: 'white',
        padding: '20px',
        borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        marginBottom: '20px'
      }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', color: '#1f2937', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '2rem' }}>🔄</span>
          板块轮动
        </h1>
        <p style={{ margin: '8px 0 0', fontSize: '0.9rem', color: '#6b7280' }}>
          追踪各板块在不同日期的涨幅排名，识别市场热点轮动
        </p>
      </div>

      {/* 筛选栏 */}
      <div style={{
        background: 'white',
        padding: '16px',
        borderRadius: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.9rem', color: '#6b7280' }}>类型:</span>
          <select
            value={filterType}
            onChange={(e) => {
              const newType = e.target.value as 'industry' | 'concept'
              console.log(`🔄 切换类型: ${filterType} -> ${newType}`)
              setFilterType(newType)
              // 清空选中状态，避免显示旧数据
              setSelectedSector(null)
              setHotStocks([])
            }}
            style={{
              padding: '6px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '0.9rem',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <option value="industry">行业</option>
            <option value="concept">概念</option>
          </select>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.9rem', color: '#6b7280' }}>排序:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as 'change' | 'rank')}
            style={{
              padding: '6px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '0.9rem',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <option value="change">涨幅</option>
            <option value="rank">排名</option>
          </select>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.9rem', color: '#6b7280' }}>显示:</span>
          <select
            value={topN}
            onChange={(e) => setTopN(Number(e.target.value))}
            style={{
              padding: '6px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '0.9rem',
              cursor: 'pointer',
              outline: 'none'
            }}
          >
            <option value={10}>前10名</option>
            <option value={15}>前15名</option>
            <option value={20}>前20名</option>
          </select>
        </div>
      </div>

      {error && (
        <div style={{
          background: '#fee2e2',
          color: '#dc2626',
          padding: '12px',
          borderRadius: '8px',
          marginBottom: '20px',
          fontSize: '0.9rem'
        }}>
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          color: '#6b7280',
          fontSize: '0.9rem'
        }}>
          加载中...
        </div>
      ) : (
        <>
          {/* 板块轮动表格 */}
          {(() => {
            // 只显示有数据的日期列
            const validDates = selectedDates.filter(date => sectorDataByDate[date] && sectorDataByDate[date].length > 0)
            
            if (validDates.length === 0) {
              return (
                <div style={{
                  padding: '40px',
                  textAlign: 'center',
                  color: '#9ca3af',
                  fontSize: '0.9rem'
                }}>
                  <div style={{ marginBottom: '12px', fontSize: '1.1rem', fontWeight: '600', color: '#6b7280' }}>
                    暂无数据
                  </div>
                  <div style={{ fontSize: '0.85rem', lineHeight: '1.6', color: '#9ca3af' }}>
                    {loading ? (
                      '正在加载数据...'
                    ) : (
                      <>
                        <div>可能原因：</div>
                        <div style={{ marginTop: '8px', paddingLeft: '20px', textAlign: 'left', display: 'inline-block' }}>
                          <div>• 所选日期没有交易数据（周末或节假日）</div>
                          <div>• 网络请求失败，请刷新重试</div>
                          <div>• 过滤条件过于严格，请尝试切换"行业/概念"类型</div>
                        </div>
                        <div style={{ marginTop: '16px', fontSize: '0.8rem', color: '#d1d5db' }}>
                          提示：请打开浏览器控制台（F12）查看详细日志
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )
            }
            
            return (
              <div style={{
                background: 'white',
                padding: '20px',
                borderRadius: '12px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                marginBottom: '20px',
                overflowX: 'auto'
              }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
                  <thead>
                    <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                      <th style={{ padding: '12px', textAlign: 'left', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280', width: '60px' }}>排名</th>
                      {validDates.map(date => (
                        <th key={date} style={{ padding: '12px', textAlign: 'center', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280', minWidth: '150px' }}>
                          {formatDateDisplay(date)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from({ length: topN }, (_, rankIndex) => {
                      const rank = rankIndex + 1
                      return (
                        <tr key={rank} style={{ borderBottom: '1px solid #e5e7eb' }}>
                          <td style={{ padding: '12px', textAlign: 'center' }}>
                            {rank <= 3 ? (
                              <span style={{
                                display: 'inline-block',
                                width: '28px',
                                height: '28px',
                                lineHeight: '28px',
                                background: '#dc2626',
                                color: 'white',
                                borderRadius: '4px',
                                fontSize: '0.85rem',
                                fontWeight: '600'
                              }}>
                                {rank}
                              </span>
                            ) : (
                              <span style={{ fontSize: '0.9rem', color: '#6b7280' }}>{rank}</span>
                            )}
                          </td>
                          {validDates.map(date => {
                            const sectors = sectorDataByDate[date] || []
                            const sector = sectors[rank - 1]
                        return (
                          <td key={date} style={{ padding: '12px', textAlign: 'center' }}>
                            {sector ? (
                              <div
                                onClick={() => handleSectorClick(sector)}
                                style={{
                                  cursor: 'pointer',
                                  padding: '8px',
                                  borderRadius: '6px',
                                  transition: 'background 0.2s',
                                  background: selectedSector?.name === sector.name && selectedSector?.date === date ? '#eff6ff' : 'transparent'
                                }}
                                onMouseEnter={(e) => {
                                  if (!(selectedSector?.name === sector.name && selectedSector?.date === date)) {
                                    e.currentTarget.style.background = '#f9fafb'
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (!(selectedSector?.name === sector.name && selectedSector?.date === date)) {
                                    e.currentTarget.style.background = 'transparent'
                                  }
                                }}
                              >
                                <div style={{ fontSize: '0.85rem', fontWeight: '500', color: '#1f2937', marginBottom: '4px' }}>
                                  {sector.name}
                                </div>
                                <div style={{
                                  fontSize: '0.9rem',
                                  fontWeight: '600',
                                  color: '#dc2626'
                                }}>
                                  +{sector.changePercent.toFixed(2)}%
                                </div>
                              </div>
                            ) : (
                              <span style={{ fontSize: '0.85rem', color: '#9ca3af' }}>-</span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
            )
          })()}

          {/* 底部悬浮框：选中板块详情和热门股票 */}
          {selectedSector && (
            <>
              {/* 背景遮罩层 */}
              <div
                onClick={() => setSelectedSector(null)}
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: 'rgba(0, 0, 0, 0.5)',
                  zIndex: 998,
                  animation: 'fadeIn 0.3s ease-out'
                }}
              />
              
              {/* 悬浮框 */}
              <div style={{
                position: 'fixed',
                bottom: 0,
                left: 0,
                right: 0,
                background: 'white',
                borderTopLeftRadius: '16px',
                borderTopRightRadius: '16px',
                boxShadow: '0 -4px 20px rgba(0,0,0,0.15)',
                zIndex: 999,
                maxHeight: '80vh',
                display: 'flex',
                flexDirection: 'column',
                animation: 'slideUp 0.3s ease-out',
                overflow: 'hidden'
              }}>
                {/* 拖拽指示条 */}
                <div
                  onClick={() => setSelectedSector(null)}
                  style={{
                    width: '40px',
                    height: '4px',
                    background: '#d1d5db',
                    borderRadius: '2px',
                    margin: '12px auto 8px',
                    cursor: 'pointer'
                  }}
                />
                
                {/* 关闭按钮 */}
                <div
                  onClick={() => setSelectedSector(null)}
                  style={{
                    position: 'absolute',
                    top: '12px',
                    right: '16px',
                    width: '32px',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '50%',
                    background: '#f3f4f6',
                    cursor: 'pointer',
                    fontSize: '1.2rem',
                    color: '#6b7280',
                    transition: 'background 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = '#e5e7eb'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = '#f3f4f6'
                  }}
                >
                  ×
                </div>
                
                {/* 内容区域（可滚动） */}
                <div style={{
                  overflowY: 'auto',
                  padding: '0 20px 20px',
                  flex: 1
                }}>
                  {/* 板块信息 */}
                  <div style={{ marginBottom: '20px', paddingTop: '8px' }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: '600', color: '#1f2937', marginBottom: '8px' }}>
                      {selectedSector.name} <span style={{ color: '#dc2626' }}>+{selectedSector.changePercent.toFixed(2)}%</span>
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#6b7280', marginBottom: '4px' }}>
                      {formatFullDate(selectedSector.date)} 排名{selectedSector.rank}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#6b7280' }}>
                      已获取日期中 {selectedSector.timesInTop10} 次排进前{topN}
                    </div>
                  </div>
                  
                  {/* 热门股票列表 */}
                  <div>
                    <div style={{ fontSize: '1rem', fontWeight: '600', color: '#1f2937', marginBottom: '12px' }}>
                      🔥 热门股票
                    </div>
                {loadingHotStocks ? (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280', fontSize: '0.9rem' }}>
                    加载中...
                  </div>
                ) : hotStocks.length > 0 ? (
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                          <th style={{ padding: '10px', textAlign: 'left', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280' }}>股票名称</th>
                          <th style={{ padding: '10px', textAlign: 'right', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280' }}>最新价</th>
                          <th style={{ padding: '10px', textAlign: 'right', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280' }}>涨跌幅</th>
                          <th style={{ padding: '10px', textAlign: 'right', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280' }}>成交量</th>
                          <th style={{ padding: '10px', textAlign: 'right', fontSize: '0.85rem', fontWeight: '600', color: '#6b7280' }}>成交额(万)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {hotStocks.map((stock, index) => (
                          <tr 
                            key={stock.code}
                            style={{ 
                              borderBottom: '1px solid #e5e7eb',
                              transition: 'background 0.2s'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = '#f9fafb'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = 'white'
                            }}
                          >
                            <td style={{ padding: '10px' }}>
                              <div style={{ fontSize: '0.9rem', fontWeight: '500', color: '#1f2937' }}>
                                {stock.name}
                              </div>
                              <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                                {stock.code}
                              </div>
                            </td>
                            <td style={{ padding: '10px', textAlign: 'right', fontSize: '0.9rem', color: '#1f2937' }}>
                              {stock.price.toFixed(2)}
                            </td>
                            <td style={{ padding: '10px', textAlign: 'right' }}>
                              <span style={{
                                fontSize: '0.9rem',
                                fontWeight: '600',
                                color: stock.changePercent >= 0 ? '#dc2626' : '#16a34a'
                              }}>
                                {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                              </span>
                            </td>
                            <td style={{ padding: '10px', textAlign: 'right', fontSize: '0.85rem', color: '#6b7280' }}>
                              {(stock.volume / 10000).toFixed(2)}万手
                            </td>
                            <td style={{ padding: '10px', textAlign: 'right', fontSize: '0.85rem', color: '#6b7280' }}>
                              {stock.amount.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: '0.9rem' }}>
                    暂无热门股票数据
                  </div>
                )}
                  </div>
                </div>
              </div>
              
              {/* 添加CSS动画 */}
              <style>{`
                @keyframes slideUp {
                  from {
                    transform: translateY(100%);
                  }
                  to {
                    transform: translateY(0);
                  }
                }
                @keyframes fadeIn {
                  from {
                    opacity: 0;
                  }
                  to {
                    opacity: 1;
                  }
                }
              `}</style>
            </>
          )}
        </>
      )}

      {/* 数据来源说明 */}
      <div style={{
        marginTop: '20px',
        padding: '16px',
        background: '#f9fafb',
        borderRadius: '8px',
        fontSize: '0.8rem',
        color: '#6b7280',
        textAlign: 'center'
      }}>
        数据来源：财联社 | 更新时间：{new Date().toLocaleString('zh-CN')}
      </div>
    </main>
  )
}

