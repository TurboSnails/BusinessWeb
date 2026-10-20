import React, { useState, useEffect, useCallback, useRef } from 'react'
import { PageTitle } from '../components/ui/PageTabs'
import { loadSectorPayload, readSectorView, saveSectorView, sectorStorageStatus, sectorUpdatedAt } from '../services/sectorCache'
import { useSectorRefresh } from '../services/useSectorRefresh'
import { shanghaiDate, isClosedDate, previousTradingDate } from '../services/limitUp'
import { Callout, Card, Dialog, EmptyState, Page, TableWrap } from '../components/ui'
import '../styles/a-share.css'
import { formatPercent } from '../utils/format'
import { parseSectorPayload, type ParsedSectors, type RawPlate, type SectorData } from '../features/sector-rotation/classify'
import {
  AlertTriangle,
  BarChart2,
  Flame,
  Tag,
  Loader2
} from 'lucide-react'

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
  const [initialView] = useState(() => readSectorView())
  const restoredView = useRef(initialView)
  const [updatedAt, setUpdatedAt] = useState<string | null>(initialView?.updatedAt || null)
  const [selectedDates, setSelectedDates] = useState<string[]>(initialView?.selectedDates || [])
  const [sectorDataByDate, setSectorDataByDate] = useState<Record<string, SectorData[]>>(initialView?.sectorDataByDate || {})
  // 保存财联社返回的原始板块数据（包含stock_list），用于获取热门股票
  const [plateRawDataByDate, setPlateRawDataByDate] = useState<Record<string, any[]>>(initialView?.plateRawDataByDate || {})
  const [loading, setLoading] = useState(!initialView)
  const [loadingProgress, setLoadingProgress] = useState<{ loaded: number; total: number }>({ loaded: 0, total: 0 })
  const [error, setError] = useState<string | null>(null)
  const [selectedSector, setSelectedSector] = useState<SectorDetail | null>(null)
  const [hotStocks, setHotStocks] = useState<HotStock[]>([])
  const [loadingHotStocks, setLoadingHotStocks] = useState(false)
  const [filterType, setFilterType] = useState<'industry' | 'concept'>(initialView?.filterType || 'concept')
  const [sortBy, setSortBy] = useState<'change' | 'rank'>(initialView?.sortBy || 'change')
  const [topN, setTopN] = useState<number>(initialView?.topN || 10)

  const [classifiedBy, setClassifiedBy] = useState<ParsedSectors['classifiedBy']>('keyword') // 板块分类来源

  // 初始化日期列表（最近7个交易日，跳过周末和节假日）
  useEffect(() => {
    if (initialView) return
    const dates: string[] = []
    let date = shanghaiDate()
    for (let count = 0; dates.length < 14 && count < 40; count++) {
      if (!isClosedDate(date)) dates.push(date)
      const previous = new Date(`${date}T00:00:00Z`)
      previous.setUTCDate(previous.getUTCDate() - 1)
      date = previous.toISOString().slice(0, 10)
    }

    setSelectedDates(dates)
  }, [])

  // 获取单个日期的板块数据（财联社接口，支持历史日期）；分类与解析见 features/sector-rotation/classify
  const fetchSectorData = useCallback(async (date: string, refresh = false, signal?: AbortSignal): Promise<{ sectors: SectorData[], rawData: RawPlate[] }> => {
    // 暂时禁用行业板块，只显示概念板块
    if (filterType === 'industry') return { sectors: [], rawData: [] }
    const parsed = parseSectorPayload(await loadSectorPayload(date, refresh, signal), date, filterType, topN)
    if (!parsed) return { sectors: [], rawData: [] }
    setClassifiedBy(parsed.classifiedBy)
    return parsed
  }, [topN, filterType])

  // 获取所有日期的数据
  useEffect(() => {
    if (selectedDates.length === 0) return
    if (restoredView.current && restoredView.current.filterType === filterType && restoredView.current.topN === topN) return
    restoredView.current = null
    let active = true
    const controller = new AbortController()

    const fetchAllDates = async () => {
      setLoading(true)
      setError(null)
      // 加载期间保留已显示的快照。

      try {
        // 直接获取数据，不依赖外部概念列表
        let settled = 0
        setLoadingProgress({ loaded: 0, total: selectedDates.length })
        const dataPromises = selectedDates.map(date =>
          fetchSectorData(date, false, controller.signal).finally(() => {
            settled += 1
            if (active) setLoadingProgress({ loaded: settled, total: selectedDates.length })
          })
        )
        const results = await Promise.allSettled(dataPromises)
        if (!active) return

        const dataByDate: Record<string, SectorData[]> = { ...sectorDataByDate }
        const rawDataByDate: Record<string, any[]> = { ...plateRawDataByDate }

        results.forEach((result, index) => {
          if (result.status === 'fulfilled' && result.value && result.value.sectors && result.value.sectors.length > 0) {
            // 只保留有数据的日期
            dataByDate[selectedDates[index]] = result.value.sectors
            // 同时保存原始数据
            rawDataByDate[selectedDates[index]] = result.value.rawData || []
          } else {
            console.warn(`获取 ${selectedDates[index]} 的数据失败或无数据:`, result.status === 'fulfilled' ? '空数据' : result.reason)
            // 不添加到 dataByDate，这样渲染时就不会显示该列
          }
        })

        // 只保留最近 7 个有数据的日期（selectedDates 按从新到旧排列）
        Object.keys(dataByDate).sort((a, b) => b.localeCompare(a)).slice(7).forEach(d => { delete dataByDate[d]; delete rawDataByDate[d] })

        const failed = results.filter(result => result.status === 'rejected').length
        if (failed) setError(`有 ${failed} 个历史日期请求失败${Object.keys(dataByDate).length ? '，已保留可用数据' : '，请稍后重试'}；请求失败不代表休市。`)
        const ordered = Object.keys(dataByDate).sort()
        const newest = ordered[ordered.length - 1]
        if (newest) setUpdatedAt(sectorUpdatedAt(newest))
        setSectorDataByDate(dataByDate)
        setPlateRawDataByDate(rawDataByDate)

      } catch (err) {
        console.error('获取数据失败:', err)
        setError('获取数据失败，请稍后重试')
      } finally {
        if (active) setLoading(false)
      }
    }

    // 类型字段可从同一份原始数据判断；不等待单独映射网络请求。
    fetchAllDates()
    return () => { active = false; controller.abort() }
  }, [selectedDates, fetchSectorData, filterType])

  useEffect(() => {
    if (loading || !Object.keys(sectorDataByDate).length) return
    saveSectorView({ day: shanghaiDate(), selectedDates, sectorDataByDate, plateRawDataByDate, filterType, sortBy, topN, updatedAt })
  }, [loading, selectedDates, sectorDataByDate, plateRawDataByDate, filterType, sortBy, topN, updatedAt])

  useSectorRefresh(loading ? [] : Object.keys(sectorDataByDate), async (latest, signal) => {
    const currentTradingDate = previousTradingDate(shanghaiDate())
    const date = currentTradingDate > latest ? currentTradingDate : latest
    try {
      const result = await fetchSectorData(date, true, signal)
      if (signal.aborted) return
      if (!result.sectors.length) throw new Error('最近交易日暂未返回有效数据')
      setSectorDataByDate(previous => Object.fromEntries(Object.entries({ ...previous, [date]: result.sectors }).sort(([a], [b]) => b.localeCompare(a)).slice(0, 7)))
      setPlateRawDataByDate(previous => Object.fromEntries(Object.entries({ ...previous, [date]: result.rawData }).sort(([a], [b]) => b.localeCompare(a)).slice(0, 7)))
      setUpdatedAt(sectorUpdatedAt(date))
      setError(null)
    } catch (err) {
      if (!signal.aborted) setError(`刷新失败，继续显示之前的数据：${err instanceof Error ? err.message : '数据源暂时不可用'}`)
    }
  })

  // 获取板块热门股票（直接使用财联社返回的stock_list）
  const fetchHotStocks = useCallback(async (sectorCode: string, sectorName: string): Promise<HotStock[]> => {

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

        // 解析财联社返回的股票数据
        // secu_code: 股票代码
        // secu_name: 股票名称
        // last_px: 最新价
        // change: 涨跌幅（小数形式，需要乘以100）
        // volume: 成交量（可能需要转换单位）
        // amount: 成交额（可能需要转换单位）
        const stocks: HotStock[] = matchedPlate.stock_list
          .map((stock: any) => {
            // 股票代码可能是6位数字，需要确保格式正确
            let code = String(stock.secu_code || stock.code || '').trim()
            // 如果代码包含非数字字符，只保留数字部分
            const codeDigits = code.replace(/[^0-9]/g, '')
            // 如果提取到6位数字，使用提取的数字；否则使用原始代码
            code = codeDigits.length === 6 ? codeDigits : code
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

        return stocks
      }
    }

    console.warn(`⚠️ 未在财联社数据中找到板块: ${sectorName} (代码: ${sectorCode})`)
    return []
  }, [plateRawDataByDate])

  // 处理板块点击
  const handleSectorClick = async (sector: SectorData) => {

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
      setLoadingHotStocks(true)
      setHotStocks([]) // 先清空，避免显示旧数据
      try {
        const stocks = await fetchHotStocks(sector.code, sector.name)
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

  // 根据股票代码生成K线图URL（使用同花顺）
  const getStockKLineUrl = (code: string, name?: string): string => {
    if (!code) {
      console.warn(`⚠️ 股票代码为空`)
      return ''
    }


    // 清理代码，移除所有非数字字符，只保留数字
    let cleanCode = code.replace(/[^0-9]/g, '')

    // 如果代码长度不足6位，尝试补齐前导0
    if (cleanCode.length > 0 && cleanCode.length < 6) {
      cleanCode = cleanCode.padStart(6, '0')
    }

    if (!cleanCode || cleanCode.length !== 6) {
      console.warn(`⚠️ 股票代码格式不正确: ${code} -> ${cleanCode}`)
      // 如果代码格式不对，尝试使用股票名称搜索（雪球）
      if (name) {
        return `https://xueqiu.com/S/${encodeURIComponent(name)}`
      }
      return ''
    }

    // 判断交易所并生成URL（优先使用新浪，备用雪球）
    // 上交所：60开头（主板）或688开头（科创板）
    // 深交所：00开头（主板）或30开头（创业板）
    // 北交所：920开头（如920207）
    let url = ''

    // 检查是否是北交所（920开头）
    if (cleanCode.startsWith('920')) {
      // 北交所 - 确保代码有效（至少6位）
      if (cleanCode.length >= 6) {
        // 新浪格式：bj{code}（小写bj前缀）
        url = `https://quotes.sina.cn/hs/company/quotes/view/bj${cleanCode}`
      } else {
        // 备用雪球格式：BJ{code}（大写BJ前缀）
        url = `https://xueqiu.com/S/BJ${cleanCode}`
      }
    } else if (cleanCode.startsWith('60') || cleanCode.startsWith('688')) {
      // 上交所 - 新浪格式：sh{code}
      url = `https://quotes.sina.cn/hs/company/quotes/view/sh${cleanCode}`
    } else if (cleanCode.startsWith('00') || cleanCode.startsWith('30')) {
      // 深交所 - 新浪格式：sz{code}
      url = `https://quotes.sina.cn/hs/company/quotes/view/sz${cleanCode}`
    } else {
      // 其他情况，使用雪球搜索
      console.warn(`⚠️ 无法识别股票代码格式: ${code} -> ${cleanCode}`)
      if (cleanCode.length === 6) {
        // 尝试使用雪球格式
        url = `https://xueqiu.com/S/SH${cleanCode}`
      } else {
        url = `https://xueqiu.com/S/${cleanCode}`
      }
    }

    return url
  }

  // 处理股票点击
  const handleStockClick = (stock: HotStock) => {
    const url = getStockKLineUrl(stock.code, stock.name)
    if (url) {
      window.open(url, '_blank')
    } else {
      console.warn(`⚠️ 无法生成股票K线图URL: ${stock.name} (${stock.code})`)
    }
  }

  // 计算板块在已有数据中涨幅超过1%的次数（从右往左，最多统计7个有数据的日期）
  const getOver1PercentCount = useCallback((sectorName: string, sectorCode: string): number => {
    let count = 0
    let foundCount = 0 // 已找到的有数据的日期数量（最多7个）

    // 获取所有有数据的日期，按日期从新到旧排序
    const allDates = Object.keys(plateRawDataByDate)
      .filter(date => plateRawDataByDate[date] && plateRawDataByDate[date].length > 0)
      .sort((a, b) => b.localeCompare(a)) // 从新到旧排序（从右往左）

    // 从右往左遍历，找到该板块出现且涨幅超过1%的日期
    for (const date of allDates) {
      if (foundCount >= 7) break // 最多统计7个有数据的日期

      // 先从筛选后的数据中查找（前N名）
      const sectors = sectorDataByDate[date] || []
      let sector = sectors.find(s => s.name === sectorName && s.code === sectorCode)

      // 如果在前N名中没找到，从原始数据中查找
      if (!sector) {
        const rawData = plateRawDataByDate[date] || []
        const matchedPlate = rawData.find((plate: any) => {
          const plateCode = String(plate.secu_code || plate.code || plate.plate_code || '').trim()
          const plateName = String(plate.secu_name || plate.name || '').trim()
          return (sectorCode && plateCode === sectorCode) || (sectorName && plateName === sectorName)
        })

        if (matchedPlate) {
          // 计算涨幅
          const changeValue = matchedPlate.change_percent || matchedPlate.change || matchedPlate.changePercent || 0
          const changePercent = Math.abs(changeValue) > 1 ? changeValue : changeValue * 100

          sector = {
            name: sectorName,
            code: sectorCode,
            changePercent: parseFloat(String(changePercent)) || 0,
            rank: 0,
            date: date
          }
        }
      }

      if (sector) {
        foundCount++ // 找到了该板块的数据
        if (sector.changePercent > 1) {
          count++ // 涨幅超过1%，计数+1
        }
      }
    }

    return count
  }, [sectorDataByDate, plateRawDataByDate])

  // 获取涨幅超过1%次数的颜色（次数越多颜色越深）
  const getCountColor = (count: number): string => {
    if (count === 0) return 'var(--text-tertiary)' // 灰色
    if (count === 1) return '#ffffff' // 白色
    if (count === 2) return 'var(--accent-warm)' // 浅黄色
    if (count === 3) return 'var(--accent-warm)' // 橙色
    if (count === 4) return 'var(--accent-warm)' // 橙红色
    if (count === 5) return 'var(--up)' // 红色
    if (count === 6) return 'var(--up)' // 深红色
    if (count >= 7) return 'var(--up-ink)' // 最深红色
    return 'var(--text-tertiary)'
  }

  // 获取最近7天的日期列表（用于显示涨停板数量）
  const getLast7Days = useCallback((): string[] => {
    const dates: string[] = []
    const today = new Date()

    // 获取最近7天的日期
    for (let i = 0; i < 7; i++) {
      const date = new Date(today)
      date.setDate(today.getDate() - i)
      const dateStr = date.toISOString().split('T')[0]
      dates.push(dateStr)
    }

    return dates.reverse() // 从最早到最新
  }, [])

  // 获取某个板块在某个日期的涨停板数量
  const getSectorLimitUpCount = useCallback((sectorName: string, sectorCode: string, date: string): number => {
    const rawData = plateRawDataByDate[date] || []
    // 查找匹配的板块
    const matchedPlate = rawData.find((plate: any) => {
      const plateCode = String(plate.secu_code || plate.code || plate.plate_code || '').trim()
      const plateName = String(plate.secu_name || plate.name || '').trim()
      return (sectorCode && plateCode === sectorCode) || (sectorName && plateName === sectorName)
    })

    if (matchedPlate) {
      return parseInt(matchedPlate.plate_stock_up_num || '0', 10)
    }

    return 0
  }, [plateRawDataByDate])

  // 以某个交易日为中心取 7 个有数据的交易日（前后各 3 天，不足时向另一侧补齐）
  const centeredDates = (date: string): string[] => {
    let displayDates: string[] = []
    // 获取所有有数据的日期，按日期从新到旧排序
    const allDates = Object.keys(sectorDataByDate)
      .filter(d => sectorDataByDate[d] && sectorDataByDate[d].length > 0)
      .sort((a, b) => b.localeCompare(a)) // 从新到旧

    // 找到当前日期在排序后的位置
    const currentDateIndex = allDates.indexOf(date)


    if (currentDateIndex >= 0) {
      // 以当前日期为中心，当前日期在中间（第4个位置，索引3）
      // allDates 是从新到旧排序的（索引0是最新，索引越大越旧）
      // 位置0,1,2: 后面（更新的日期，索引更小）最多3天
      // 位置3: 当前日期
      // 位置4,5,6: 前面（更旧的日期，索引更大）至少3天

      // 先确定前面3天的范围（更旧的日期，索引更大）
      let endIndex = Math.min(allDates.length - 1, currentDateIndex + 3) // 前面3天的结束索引

      // 检查前面是否有3天
      const beforeCount = endIndex - currentDateIndex

      // 确定后面3天的范围（更新的日期，索引更小）
      let startIndex = currentDateIndex - 3 // 后面3天的起始索引

      if (beforeCount < 3) {
        // 前面不足3天，用后面补齐
        const needMore = 3 - beforeCount
        startIndex = Math.max(0, startIndex - needMore)
      } else {
        // 前面有3天，后面最多3天
        startIndex = Math.max(0, currentDateIndex - 3)
      }

      displayDates = allDates.slice(startIndex, endIndex + 1)

      // 确保当前日期在中间位置（第4个，索引3）
      const currentInSlice = displayDates.indexOf(date)
      if (currentInSlice >= 0) {
        if (currentInSlice !== 3) {
          // 需要调整，让当前日期在位置3（中间）
          const needMove = 3 - currentInSlice

          if (needMove > 0) {
            // 当前日期太靠前，需要往前取更多数据（索引更大）
            const canAdd = Math.min(needMove, allDates.length - 1 - endIndex)
            if (canAdd > 0) {
              endIndex = endIndex + canAdd
              displayDates = allDates.slice(startIndex, endIndex + 1)
            }
          } else if (needMove < 0) {
            // 当前日期太靠后，需要往后取更多数据（索引更小）
            const canAdd = Math.min(-needMove, startIndex)
            if (canAdd > 0) {
              startIndex = startIndex - canAdd
              displayDates = allDates.slice(startIndex, endIndex + 1)
            }
          }
        }

        // 确保正好7天
        if (displayDates.length > 7) {
          // 以当前日期为中心，取前后各3天
          const currentInSlice2 = displayDates.indexOf(date)
          if (currentInSlice2 >= 0) {
            startIndex = startIndex + (currentInSlice2 - 3)
            endIndex = startIndex + 6
            displayDates = allDates.slice(startIndex, endIndex + 1)
          }
        } else if (displayDates.length < 7) {
          // 如果不足7天，尽量保持当前日期在中间
          const currentInSlice3 = displayDates.indexOf(date)
          if (currentInSlice3 >= 0) {
            const needBefore = 3 - currentInSlice3
            if (needBefore > 0 && endIndex < allDates.length - 1) {
              // 需要往前取更多
              const canAdd = Math.min(needBefore, allDates.length - 1 - endIndex)
              endIndex = endIndex + canAdd
              displayDates = allDates.slice(startIndex, endIndex + 1)
            } else if (needBefore < 0 && startIndex > 0) {
              // 需要往后取更多
              const canAdd = Math.min(-needBefore, startIndex)
              startIndex = startIndex - canAdd
              displayDates = allDates.slice(startIndex, endIndex + 1)
            }
          }
        }
      }
    } else {
      // 如果当前日期不在数据中，取最近7天
      displayDates = allDates.slice(0, 7)
    }

    return displayDates
  }

  // 板块详情里的最近 7 天：今天有数据从今天往前，否则以最近有数据的日期为中心
  const recentDates = (): { dates: string[]; today: string } => {
    const last7Days = getLast7Days()
    const today = new Date().toISOString().split('T')[0]
    const todayIndex = last7Days.indexOf(today)

    // 如果今天有数据，从今天开始显示；如果没有，找到最近有数据的日期
    let displayDates: string[] = []
    if (todayIndex >= 0 && sectorDataByDate[today]) {
      // 今天有数据，从今天往前显示7天
      displayDates = last7Days.slice(Math.max(0, todayIndex - 6), todayIndex + 1).reverse()
    } else {
      // 今天没有数据，找到最近有数据的日期
      let latestDateIndex = -1
      for (let i = last7Days.length - 1; i >= 0; i--) {
        if (sectorDataByDate[last7Days[i]]) {
          latestDateIndex = i
          break
        }
      }

      if (latestDateIndex >= 0) {
        // 找到最近有数据的日期，前后各显示3天
        const start = Math.max(0, latestDateIndex - 3)
        const end = Math.min(last7Days.length - 1, latestDateIndex + 3)
        displayDates = last7Days.slice(start, end + 1).reverse()
      } else {
        // 没有数据，显示最近7天
        displayDates = last7Days.reverse()
      }
    }

    return { dates: displayDates, today }
  }

  const isSelected = (name: string, date: string) => selectedSector?.name === name && selectedSector?.date === date

  return (
    <Page className="sector-page">
      <PageTitle>板块轮动</PageTitle>
      <Callout tone="muted" className="sector-gap">
        这里只反映最近的价格强弱，不说明主题值不值得持有。涨得快的板块往往已经反映了预期，追涨容易买在高位。要研究一个主题，先看书第31章的三个问题，仓位只放主动额度（第9章）。不构成投资建议。
      </Callout>

      {/* 筛选栏 */}
      <div className="ui-cluster sector-filters">
        <label className="sector-filter">
          类型
          <select className="ui-input" value={filterType} onChange={(e) => {
            const newType = e.target.value as 'industry' | 'concept'
            setFilterType(newType)
            // 清空选中状态，避免显示旧数据
            setSelectedSector(null)
            setHotStocks([])
          }}>
            <option value="industry">行业</option>
            <option value="concept">概念</option>
          </select>
        </label>
        <label className="sector-filter">
          排序
          <select className="ui-input" value={sortBy} onChange={(e) => setSortBy(e.target.value as 'change' | 'rank')}>
            <option value="change">涨幅</option>
            <option value="rank">排名</option>
          </select>
        </label>
        <label className="sector-filter">
          显示
          <select className="ui-input" value={topN} onChange={(e) => setTopN(Number(e.target.value))}>
            <option value={10}>前10名</option>
            <option value={15}>前15名</option>
            <option value={20}>前20名</option>
          </select>
        </label>
      </div>

      {['unconfigured', 'unavailable'].includes(sectorStorageStatus() || '') && (
        <p role="status" className="sector-storage">数据库缓存暂未就绪，当前使用本地缓存；历史数据尚未确认入库。</p>
      )}
      {error && (
        <div role="alert" className="ui-callout ui-callout--danger sector-gap">
          <AlertTriangle size={16} aria-hidden="true" className="ui-callout__icon" />
          <div className="ui-callout__body">{error}</div>
        </div>
      )}

      {loading ? (
        <EmptyState icon={<Loader2 size={32} className="animate-spin" />} title="正在加载板块数据…">
          {loadingProgress.total > 0
            ? `已加载 ${loadingProgress.loaded}/${loadingProgress.total} 个交易日，数据源响应较慢，请稍候`
            : '正在连接数据源...'}
        </EmptyState>
      ) : (
        <>
          {/* 板块轮动表格 */}
          {(() => {
            // 只显示有数据的日期列
            const validDates = Object.keys(sectorDataByDate).filter(date => sectorDataByDate[date]?.length > 0).sort((a, b) => b.localeCompare(a))

            if (validDates.length === 0) {
              return (
                <EmptyState title="暂无数据">
                  <div>可能原因：</div>
                  <ul className="sector-reasons">
                    <li>所选日期没有交易数据（周末或节假日）</li>
                    <li>网络请求失败，请刷新重试</li>
                    <li>过滤条件过于严格，请尝试切换「行业/概念」类型</li>
                  </ul>
                </EmptyState>
              )
            }

            return (
              <Card flush className="sector-gap">
                <TableWrap label="板块轮动排名" stickyFirst>
                  <table className="ui-table sector-table">
                    <thead>
                      <tr>
                        <th scope="col" className="sector-rank-col">排名</th>
                        {validDates.map(date => <th key={date} scope="col" className="sector-date-col">{formatDateDisplay(date)}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: topN }, (_, rankIndex) => {
                        const rank = rankIndex + 1
                        return (
                          <tr key={rank}>
                            <td className="sector-rank-col">
                              <span className={rank <= 3 ? 'sector-rank is-top' : 'sector-rank'}>{rank}</span>
                            </td>
                            {validDates.map(date => {
                              const sector = (sectorDataByDate[date] || [])[rank - 1]
                              if (!sector) return <td key={date} className="sector-cell sector-empty">-</td>
                              const count = getOver1PercentCount(sector.name, sector.code)
                              return (
                                <td key={date} className="sector-cell">
                                  <button type="button" onClick={() => handleSectorClick(sector)} aria-pressed={isSelected(sector.name, date)}
                                    className={isSelected(sector.name, date) ? 'sector-pick is-selected' : 'sector-pick'}>
                                    <span className="sector-pick__name">
                                      {sector.name}
                                      {count > 0 && (
                                        <span className={count === 1 ? 'sector-count is-one' : 'sector-count'} style={{ background: getCountColor(count) }} title={`近期 ${count} 次涨幅超过 1%`}>{count}</span>
                                      )}
                                    </span>
                                    <span className={sector.changePercent >= 0 ? 'sector-pick__pct' : 'sector-pick__pct is-down'}>{formatPercent(sector.changePercent)}</span>
                                  </button>
                                  {/* 以该日为中心的 7 天涨停家数 */}
                                  <div className="sector-days">
                                    {centeredDates(date).map((d) => {
                                      const limitUpCount = getSectorLimitUpCount(sector.name, sector.code, d)
                                      const hasData = !!sectorDataByDate[d]
                                      return (
                                        <span key={d} className={d === date ? 'sector-day is-current' : 'sector-day'} title={`${formatDateDisplay(d)}: ${limitUpCount}家`}>
                                          <span className={hasData && limitUpCount > 0 ? 'sector-day__n is-hot' : 'sector-day__n'}>{hasData ? limitUpCount : '-'}</span>
                                        </span>
                                      )
                                    })}
                                  </div>
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </TableWrap>
              </Card>
            )
          })()}

          {/* 选中板块详情和热门股票 */}
          <Dialog open={!!selectedSector} onClose={() => setSelectedSector(null)} size="lg"
            title={selectedSector ? <>{selectedSector.name} <span className={selectedSector.changePercent >= 0 ? 'sector-up' : 'sector-up is-down'}>{formatPercent(selectedSector.changePercent)}</span></> : ''}
            actions={<button type="button" className="tool-btn" onClick={() => setSelectedSector(null)}>关闭</button>}>
            {selectedSector && (
              <div className="ui-stack">
                <p className="sector-meta">
                  {formatFullDate(selectedSector.date)} 排名{selectedSector.rank} · 已获取日期中 {selectedSector.timesInTop10} 次排进前{topN}
                </p>

                <section aria-label="最近7天涨停板数量">
                  <h3 className="sector-subhead"><BarChart2 size={18} aria-hidden="true" /> 最近7天涨停板数量</h3>
                  {(() => {
                    const { dates, today } = recentDates()
                    return (
                      <div className="ui-cluster">
                        {dates.map((date) => {
                          const count = getSectorLimitUpCount(selectedSector.name, selectedSector.code, date)
                          const isToday = date === today
                          const hasData = !!sectorDataByDate[date]
                          return (
                            <div key={date} className={isToday ? 'sector-daybox is-today' : 'sector-daybox'}>
                              <div className="sector-daybox__date">{formatDateDisplay(date)}{isToday && <span className="sector-daybox__today">今天</span>}</div>
                              <div className={hasData && count > 0 ? 'sector-daybox__n is-hot' : 'sector-daybox__n'}>{hasData ? count : '-'}</div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}
                </section>

                <section aria-label="热门股票">
                  <h3 className="sector-subhead"><Flame size={18} aria-hidden="true" /> 热门股票</h3>
                  {loadingHotStocks ? (
                    <EmptyState title="加载中…" />
                  ) : hotStocks.length > 0 ? (
                    <TableWrap label="热门股票" stickyFirst>
                      <table className="ui-table">
                        <thead>
                          <tr>
                            <th scope="col">股票名称</th>
                            <th scope="col" className="num">最新价</th>
                            <th scope="col" className="num">涨跌幅</th>
                            <th scope="col" className="num">成交量</th>
                            <th scope="col" className="num">成交额(万)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {hotStocks.map((stock) => (
                            <tr key={stock.code}>
                              <td>
                                <button type="button" className="sector-stock" onClick={() => handleStockClick(stock)}>
                                  <span className="sector-stock__name">{stock.name}</span>
                                  <span className="sector-stock__code">{stock.code}</span>
                                </button>
                              </td>
                              <td className="num">{stock.price.toFixed(2)}</td>
                              <td className="num sector-strong" style={{ color: stock.changePercent >= 0 ? 'var(--up)' : 'var(--down)' }}>
                                {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                              </td>
                              <td className="num sector-muted">{(stock.volume / 10000).toFixed(2)}万手</td>
                              <td className="num sector-muted">{stock.amount.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </TableWrap>
                  ) : (
                    <EmptyState title="暂无热门股票数据" />
                  )}
                </section>
              </div>
            )}
          </Dialog>
        </>
      )}

      {/* 数据来源说明 */}
      <div className="sector-source">
        <div className="sector-source__title">数据来源：财联社</div>
        <div className="sector-source__line"><BarChart2 size={14} aria-hidden="true" /> 板块数据（排名、涨跌幅、历史数据）：财联社</div>
        <div className="sector-source__line"><Tag size={14} aria-hidden="true" /> 板块分类（行业/概念区分）：{classifiedBy === 'api' ? '财联社接口' : '关键词匹配'}</div>
        <div className="sector-source__line"><Flame size={14} aria-hidden="true" /> 热门股票：财联社</div>
        <div className="sector-source__time">数据更新时间：{updatedAt ? new Date(updatedAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '—'}（北京时间）；当前页面每 30 秒更新最近有效交易日</div>
      </div>
    </Page>
  )
}
