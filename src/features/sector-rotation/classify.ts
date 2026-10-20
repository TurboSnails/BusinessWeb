// 财联社板块分类与解析：从 SectorRotation 页面抽出的纯函数，便于单测。
// 财联社接口通常不返回行业/概念类型字段，此时按名称关键词判断；关键词表沿用原页面（已去重，不改变匹配结果）。

export type PlateType = 'industry' | 'concept'

export interface SectorData {
  name: string
  code: string // 板块代码
  changePercent: number
  rank: number
  date: string
}

// 财联社原始板块数据，字段因接口版本而异
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RawPlate = Record<string, any>

export interface ParsedSectors {
  sectors: SectorData[]
  rawData: RawPlate[]
  classifiedBy: 'api' | 'keyword' // 是否有板块带财联社类型字段
}

/** 行业判断时排除的明确概念词（包含即排除） */
const EXPLICIT_CONCEPT_KEYWORDS = [
  'AI应用', 'AI智能体', 'AI眼镜', 'AI制药', 'AI语料', 'AI芯片', '机器人概念', '芯片产业链', '人脑工程', '商业航天', '智能驾驶', '数字货币',
  '创新药', '算力工程', '光刻胶', '金融科技', '液冷IDC', '可控核聚变', '光通信', '存储器', 'PCB',
]

/** 行业降级方案里排除的概念词（仅完全相同才排除） */
const FALLBACK_CONCEPT_NAMES = [
  'AI应用', 'AI智能体', 'AI眼镜', 'AI制药', 'AI语料', 'AI芯片', '机器人概念', '芯片产业链', '人脑工程', '商业航天', '智能驾驶', '数字货币',
  '创新药', '算力工程', '光刻胶', '金融科技', '液冷IDC', '可控核聚变',
]

/** 名称包含任一关键词即视为概念（含单字词，匹配面很宽） */
const CONCEPT_KEYWORDS = [
  'AI', '人工智能', 'ChatGPT', 'Sora', 'Kimi', 'AIGC', '多模态', '文生视频', '文生图', '大模型', 'AI应用', 'AI智能体',
  'AI眼镜', 'AI制药', 'AI语料', 'AI芯片', '智谱AI', '存储芯片', '汽车芯片', '第三代半导体', '第四代半导体', '芯片产业链', '芯片', '半导体',
  '机器人', '人形机器人', '工业机器人', '服务机器人', '机器人概念', '机器人执行器', '智能驾驶', '自动驾驶', '无人驾驶', '车联网', '智能汽车', '智能电网',
  '智能', '光伏', '风电', '储能', '氢能', '锂电池', '钠电池', '固态电池', '钙钛矿', 'HJT', 'TOPCon', 'BC电池',
  '液冷IDC', '生物质能', '新能源', '数字货币', '数字人民币', '区块链', '元宇宙', 'Web3', 'NFT', '数字', '数据要素', '数据确权',
  '数据安全', '数据交易', '数据资产', '数据', '信创', '国产软件', '国产芯片', '国产替代', '自主可控', '卫星', '卫星互联网', '卫星导航',
  '空间站', '商业航天', '航天', '人脑工程', 'CAR-T', '细胞疗法', '重组蛋白', '基因测序', '创新药', '减肥药', 'CRO', 'CDMO',
  '辅助生殖', '医美', '医疗美容', '算力', '算力工程', '光通信', '光刻胶', '存储器', 'PCB', '光刻', '金融科技', '同步磁阻电机',
  '减速器', '3D玻璃', '噪声防治', 'UWB', '碳纤', 'PEEK', '华为', '跨境', '支付', '飞行汽车', '低空经济', 'eVTOL',
  '量子', '量子通信', '量子计算', '6G', 'MR', 'VR', 'AR', 'XR', '超导', '室温超导', '可控核聚变', 'PLC',
  '产业链', '有色金属概念', '核电', '军工', '石英', '面板', '高铁轨交', '液冷', 'IDC', '存储', '工程', '人脑',
  '商业', '驾驶', '货币', '创新', '药', '金融', '科技', '产业', '链', '概念', '高铁', '轨交',
  '光通', '信', '电网', '眼镜', '体', '液', '冷', '光', '刻', '器', '算', '力',
  '人', '脑', 'ST股', '其他', '影视', '食品饮料', '商业零售',
]

/** 与名称完全相同则视为行业 */
const STRICT_INDUSTRY_NAMES = [
  '银行', '保险', '证券', '多元金融', '金融', '信托', '期货', '基金', '租赁', '担保', '房地产开发', '房地产服务',
  '房地产', '物业管理', '园区开发', '建筑', '建材', '水泥', '水泥建材', '工程建设', '工程机械', '工程咨询服务', '装修装饰', '装修建材',
  '装饰', '装修', '采掘行业', '采掘', '煤炭', '石油', '石油行业', '钢铁', '钢铁行业', '有色金属', '贵金属', '小金属',
  '能源金属', '化工', '化学', '化学原料', '化学制品', '化学制药', '化纤行业', '化纤', '塑料制品', '橡胶', '玻璃玻纤', '非金属材料',
  '包装材料', '机械', '设备', '通用设备', '专用设备', '交运设备', '电机', '电源设备', '电网设备', '风电设备', '光伏设备', '仪器仪表',
  '电子元件', '电子化学品', '消费电子', '光学光电子', '计算机设备', '汽车整车', '汽车零部件', '汽车服务', '家电', '轻工', '纺织服装', '造纸',
  '造纸印刷', '印刷', '包装', '家具', '珠宝首饰', '食品饮料', '酿酒', '医药商业', '医疗服务', '医疗器械', '生物制品', '中药',
  '电力', '公用事业', '燃气', '水务', '热力', '交通运输', '物流', '港口', '航运', '航运港口', '航空机场', '铁路公路',
  '高速公路', '机场', '航空', '铁路', '公路', '水运', '仓储', '通信服务', '通信设备', '互联网服务', '软件开发', '信息服务',
  'IT服务', '云计算', '大数据', '商业百货', '商业零售', '零售', '百货', '贸易行业', '贸易', '批发', '超市', '连锁',
  '餐饮', '旅游酒店', '酒店', '旅游', '住宿', '文化传媒', '传媒', '文化', '影视', '娱乐', '体育', '游戏',
  '出版', '广告', '演艺', '教育', '培训', '在线教育', '专业服务', '咨询服务', '技术服务', '检测服务', '认证服务', '环保行业',
  '环保', '园林', '绿化', '美容护理', '美发', '洗浴', '家政', '维修', '综合行业', '综合', '船舶制造', '船舶',
  '航空装备', '航天装备', '军工', '国防', '安防', '消防', '通信', '电信', '移动通信', '固定通信', '农业', '畜牧',
  '渔业', '林业', '种植', '化肥', '农药', '种子', '农牧饲渔', '农牧', '新能源', '清洁能源', '传统能源', '新材料',
  '复合材料', '生物医药', '医药', '医疗', '纺织', '服装', '鞋帽', '食品', '饮料', '乳制品', '建筑装饰', '装修材料',
  '金属制品', '金属加工', '电气设备', '电气', '电力设备', '网络设备', '计算机', '软件', '硬件', '半导体', '芯片制造', '显示器件',
  '面板', '电池', '储能设备', '汽车', '摩托车', '自行车', '海洋工程', '航空航天', '航天航空', '航天', '轨道交通', '高铁',
  '地铁', '物流运输', '快递', '配送', '商业地产', '住宅地产', '工业地产', '餐饮服务', '酒店服务', '旅游服务', '文化创意', '数字内容',
  '新媒体', '教育培训', '职业教育', '高等教育', '健康服务', '养老服务', '环保服务', '节能服务', '资源回收', '金融服务', '投资服务', '资产管理',
]

const plateName = (plate: RawPlate): string => String(plate.secu_name || plate.name || '').trim()
const hasThemeWord = (name: string): boolean => name.includes('概念') || name.includes('题材') || name.includes('主题')

/** 财联社可能返回的类型字段 */
const apiTypeOf = (plate: RawPlate): unknown =>
  plate.plate_type || plate.type || plate.category || plate.kind || plate.class ||
  plate.plate_category || plate.plate_kind || plate.secu_type || plate.secu_category

/** 单个板块是否属于目标类型：优先用接口类型字段，否则按名称关键词 */
export function matchesPlateType(plate: RawPlate, filterType: PlateType): boolean {
  const apiType = apiTypeOf(plate)
  if (apiType) {
    const typeStr = String(apiType).toLowerCase()
    return filterType === 'industry'
      ? typeStr.includes('industry') || typeStr.includes('行业') || typeStr === '2'
      : typeStr.includes('concept') || typeStr.includes('概念') || typeStr === '3'
  }
  const name = plateName(plate)
  if (filterType === 'industry') {
    // 行业：排除明确的概念板块，其他都当作行业
    if (hasThemeWord(name)) return false
    return !EXPLICIT_CONCEPT_KEYWORDS.some(keyword => name.includes(keyword))
  }
  // 概念：含概念关键词即是；否则只排除名称完全等于行业名的板块
  if (CONCEPT_KEYWORDS.some(keyword => name.includes(keyword))) return true
  return !STRICT_INDUSTRY_NAMES.includes(name)
}

/** 正常过滤结果为空时的宽松方案 */
export function fallbackPlates(plates: RawPlate[], filterType: PlateType): RawPlate[] {
  return filterType === 'concept'
    ? plates.filter(plate => !STRICT_INDUSTRY_NAMES.includes(plateName(plate)))
    : plates.filter(plate => {
      const name = plateName(plate)
      return !hasThemeWord(name) && !FALLBACK_CONCEPT_NAMES.includes(name)
    })
}

/** 转成按涨跌幅排序的前 N 名；涨跌幅可能是百分数（5.2）或小数（0.052） */
export function toSectors(plates: RawPlate[], date: string, topN: number): SectorData[] {
  return plates
    .map(plate => {
      const name = plate.secu_name || plate.name || plate.plate_name || ''
      const code = plate.secu_code || plate.code || plate.plate_code || ''
      const changeValue = plate.change_percent || plate.change || plate.changePercent || 0
      const changePercent = Math.abs(changeValue) > 1 ? changeValue : changeValue * 100
      return { name: String(name).trim(), code: String(code).trim(), changePercent: parseFloat(String(changePercent)) || 0, rank: 0, date }
    })
    .filter(sector => sector.name.length > 0)
    .sort((a, b) => b.changePercent - a.changePercent)
    .map((sector, index) => ({ ...sector, rank: index + 1 }))
    .slice(0, topN)
}

/** 解析财联社 up_down_analysis 返回：{ code: 200, data: { plate_stock: [...] } }；格式不符返回 null */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseSectorPayload(payload: any, date: string, filterType: PlateType, topN: number): ParsedSectors | null {
  if (payload?.code !== 200 || !payload?.data?.plate_stock) return null
  const plates: RawPlate[] = payload.data.plate_stock
  const classifiedBy = plates.some(plate => apiTypeOf(plate)) ? 'api' : 'keyword'
  const filtered = plates.filter(plate => matchesPlateType(plate, filterType))
  if (!filtered.length && plates.length) {
    const fallback = fallbackPlates(plates, filterType)
    if (fallback.length) return { sectors: toSectors(fallback, date, topN), rawData: fallback, classifiedBy }
  }
  return { sectors: toSectors(filtered, date, topN), rawData: filtered, classifiedBy }
}
