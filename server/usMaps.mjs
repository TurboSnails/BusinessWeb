// 估值热力图的另外两张图（对应 Finviz 的「全球」与「ETF」地图）：没有官方成分表，用手工整理的名单，按 Yahoo 批量报价取市值 / 规模与 PE。
// 全球：在美国上市（含 ADR）的大型外国公司，按公司所在国家 / 地区分组。名单是精选，不是全部在美上市外国公司。
// ETF：常见的美股宽基、行业、海外、债券、商品与加密 ETF，按资产类别分组；Yahoo 不给 ETF 的 Forward PE，用持仓的滚动 PE。

/** 代码 → 国家 / 地区（中文） */
export const ADR_COUNTRY = {
  // 中国
  BABA: '中国', PDD: '中国', JD: '中国', BIDU: '中国', NTES: '中国', TCOM: '中国', BEKE: '中国', LI: '中国', NIO: '中国', XPEV: '中国',
  YUMC: '中国', TME: '中国', ZTO: '中国', BILI: '中国', VIPS: '中国', HTHT: '中国', FUTU: '中国', TAL: '中国', EDU: '中国', QFIN: '中国',
  // 中国台湾
  TSM: '中国台湾', UMC: '中国台湾', ASX: '中国台湾', CHT: '中国台湾',
  // 日本
  TM: '日本', SONY: '日本', MUFG: '日本', SMFG: '日本', HMC: '日本', MFG: '日本', NMR: '日本', IX: '日本',
  // 韩国
  KB: '韩国', SHG: '韩国', PKX: '韩国', KEP: '韩国',
  // 印度
  INFY: '印度', HDB: '印度', IBN: '印度', WIT: '印度', RDY: '印度',
  // 新加坡 / 以色列 / 澳大利亚 / 南非
  SE: '新加坡', GRAB: '新加坡', TEVA: '以色列', CHKP: '以色列', BHP: '澳大利亚', GFI: '南非',
  // 英国
  AZN: '英国', SHEL: '英国', HSBC: '英国', UL: '英国', BP: '英国', RIO: '英国', GSK: '英国', BTI: '英国', LYG: '英国', NWG: '英国',
  RELX: '英国', DEO: '英国', ARM: '英国', BCS: '英国', VOD: '英国',
  // 欧洲大陆
  ASML: '荷兰', ING: '荷兰', STLA: '荷兰', PHG: '荷兰', SAP: '德国', DB: '德国', TTE: '法国', SNY: '法国',
  NVS: '瑞士', UBS: '瑞士', ALC: '瑞士', LOGI: '瑞士', NVO: '丹麦', SAN: '西班牙', BBVA: '西班牙', E: '意大利', RACE: '意大利',
  ERIC: '瑞典', SPOT: '瑞典', EQNR: '挪威', NOK: '芬兰',
  // 加拿大
  SHOP: '加拿大', RY: '加拿大', TD: '加拿大', ENB: '加拿大', CNQ: '加拿大', CP: '加拿大', CNI: '加拿大', BMO: '加拿大', BNS: '加拿大',
  TRI: '加拿大', SU: '加拿大', BN: '加拿大', MFC: '加拿大', CM: '加拿大', TRP: '加拿大', NTR: '加拿大', CVE: '加拿大',
  // 拉美
  VALE: '巴西', PBR: '巴西', ITUB: '巴西', NU: '巴西', BBD: '巴西', ABEV: '巴西', AMX: '墨西哥', FMX: '墨西哥',
}

/** 代码 → 资产类别（中文） */
export const ETF_CLASS = {
  SPY: '美股宽基', IVV: '美股宽基', VOO: '美股宽基', VTI: '美股宽基', QQQ: '美股宽基', DIA: '美股宽基', IWM: '美股宽基', RSP: '美股宽基',
  VTV: '美股风格', VUG: '美股风格', IWF: '美股风格', IWD: '美股风格', SCHD: '美股风格', VIG: '美股风格', MDY: '美股宽基', IJH: '美股宽基', IJR: '美股宽基',
  XLK: '美股行业', XLF: '美股行业', XLV: '美股行业', XLE: '美股行业', XLI: '美股行业', XLY: '美股行业', XLP: '美股行业', XLU: '美股行业',
  XLB: '美股行业', XLRE: '美股行业', XLC: '美股行业', SMH: '美股行业', SOXX: '美股行业', IBB: '美股行业', XBI: '美股行业', KRE: '美股行业',
  ITB: '美股行业', XOP: '美股行业', ARKK: '美股行业',
  VEA: '海外发达', IEFA: '海外发达', EFA: '海外发达', VGK: '海外发达', EWJ: '海外发达',
  VWO: '新兴市场', IEMG: '新兴市场', EEM: '新兴市场', FXI: '新兴市场', MCHI: '新兴市场', KWEB: '新兴市场', EWZ: '新兴市场', INDA: '新兴市场', EWT: '新兴市场', EWY: '新兴市场',
  AGG: '债券', BND: '债券', TLT: '债券', IEF: '债券', SHY: '债券', LQD: '债券', HYG: '债券', TIP: '债券', BIL: '债券', SGOV: '债券', MUB: '债券', EMB: '债券',
  GLD: '商品', IAU: '商品', SLV: '商品', USO: '商品', DBC: '商品', GDX: '商品',
  IBIT: '加密', FBTC: '加密', ETHA: '加密',
}

import { HSI_INFO } from './heatmapCnHk.mjs'

/** 港股代码 → 雅虎代码：00700 → 0700.HK */
export const hkYahoo = code => `${String(Number(code)).padStart(4, '0')}.HK`

export const MAPS_SOURCE = {
  hsi: '恒生指数成分（本站 DCF 预填名单，东方财富 F10 行业组归并成大类），市值与 Forward PE 取自雅虎财经，单位港元',
  adr: '在美上市的大型外国公司精选名单（本站手工整理，按公司所在国家 / 地区分组），市值与 Forward PE 取自雅虎财经',
  etf: '常见 ETF 精选名单（本站手工整理，按资产类别分组），规模（基金净资产）与持仓滚动 PE 取自雅虎财经；Yahoo 不提供 ETF 的 Forward PE',
}

/** 债券、加密与实物商品 ETF 没有盈利，Yahoo 偶尔给出的 PE 无意义，一律视为无 PE（金矿股 GDX 除外） */
const NO_PE_CLASSES = new Set(['债券', '加密'])
const NO_PE_CODES = new Set(['GLD', 'IAU', 'SLV', 'USO', 'DBC'])
const ok = v => (Number.isFinite(v) && v > 0 && v < 1000 ? v : null)
const r1 = x => Math.round(x * 10) / 10

/**
 * 把报价整理成热力图成员：mcap 为十亿美元（ETF 为基金规模），sector 存分组名（国家 / 资产类别）。
 * quotes: Map<code, { name, mcap, fwd, ttm, netAssets }>
 */
export function buildMaps(quotes, date) {
  const pick = (table, size, withFwd) => Object.entries(table)
    .map(([code, group]) => {
      const q = quotes.get(code)
      const s = q ? size(q) : 0
      if (!q || !(s > 0)) return null
      const fwd = withFwd ? ok(q.fwd) : null
      const ttm = NO_PE_CLASSES.has(group) || NO_PE_CODES.has(code) ? null : ok(q.ttm)
      return { code, name: q.name, mcap: r1(s / 1e9), fwd: fwd && r1(fwd), ttm: ttm && r1(ttm), sector: group }
    })
    .filter(Boolean)
    .sort((a, b) => b.mcap - a.mcap)
  const adr = pick(ADR_COUNTRY, q => q.mcap, true)
  const etf = pick(ETF_CLASS, q => q.netAssets ?? 0, false)
  const hsi = Object.entries(HSI_INFO)
    .map(([code, [name, group]]) => {
      const q = quotes.get(hkYahoo(code))
      if (!q || !(q.mcap > 0)) return null
      const fwd = ok(q.fwd), ttm = ok(q.ttm)
      return { code, name, mcap: r1(q.mcap / 1e9), fwd: fwd && r1(fwd), ttm: ttm && r1(ttm), sector: group }
    })
    .filter(Boolean)
    .sort((a, b) => b.mcap - a.mcap)
  return {
    hsi: { date, source: MAPS_SOURCE.hsi, total: Object.keys(HSI_INFO).length, currency: 'HKD', members: hsi },
    adr: { date, source: MAPS_SOURCE.adr, total: Object.keys(ADR_COUNTRY).length, members: adr },
    etf: { date, source: MAPS_SOURCE.etf, total: Object.keys(ETF_CLASS).length, members: etf },
  }
}

export const MAP_SYMBOLS = [...Object.keys(ADR_COUNTRY), ...Object.keys(ETF_CLASS), ...Object.keys(HSI_INFO).map(hkYahoo)]
