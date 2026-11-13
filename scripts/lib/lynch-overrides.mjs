// 林奇强周期判定的人工纠错（单一来源）。rebuild-lynch-classification.mjs 每次运行都会把这里的取值写入
// public/data/lynch.json 对应条目的 `cyclical` 字段（显式布尔优先于生成器 w/f 文字标记与行业上下文，见 lynch-classify.isCyclical）。
// 日常行情刷新（normalize-market-refresh.py）只改 pe/peg/v 等行情字段、原地保留其他字段，不会丢掉 `cyclical`；
// 即便 lynch.json 被外部生成器整体重写，重跑 rebuild 也会从这里恢复。
//
// 每条：market:code → [cyclical, 理由]

/** A 股化学药：原生成器把「化学药」整组打成「行业属强周期」（疑为「化学」关键词误中），药企盈利由管线/集采驱动，不是商品价格周期 */
const CHEM_PHARMA = {
  'cn:600276': '恒瑞医药',
  'cn:600196': '复星医药',
  'cn:000963': '华东医药',
  'cn:000513': '丽珠集团',
  'cn:002422': '科伦药业',
  'cn:600380': '健康元',
  'cn:600521': '华海药业',
  'cn:000739': '普洛药业',
  'cn:002262': '恩华药业',
  'cn:300558': '贝达药业',
  'cn:301301': '川宁生物',
  'cn:600062': '华润双鹤',
  'cn:688166': '博瑞医药',
  'cn:688578': '艾力斯', // 生成器 f「所属行业有周期属性」，同一误判
}

/**
 * 芯片设计 / IP / EDA（Fabless，无晶圆厂与重资本开支，用户 2026-11-13 决定不按强周期处理）。
 * 存储（含存储设计：兆易创新、东芯、君正/ISSI、德明利、江波龙、MU、SK 海力士）、设备、晶圆代工与封测、
 * 模拟与 IDM（TXN、ADI、NXPI、ON、MCHP、MPWR、SWKS、圣邦、纳芯微、士兰微、华润微等）仍按周期处理，不在此列。
 */
const CHIP_DESIGN = {
  'us:NVDA': '英伟达：GPU/加速计算 Fabless',
  'us:AVGO': '博通：定制 ASIC 与网络芯片 Fabless（另有 VMware 软件）',
  'us:AMD': '超威：CPU/GPU Fabless',
  'us:QCOM': '高通：移动 SoC Fabless + 专利授权',
  'us:MRVL': 'Marvell：定制 AI 芯片、光学 DSP Fabless',
  'us:CDNS': '铿腾：EDA 与半导体 IP',
  'us:SNPS': '新思：EDA 与半导体 IP',
  'adr:ARM': 'Arm：处理器 IP 授权与版税',
  'cn:688041': '海光信息：CPU/DCU Fabless',
  'cn:688256': '寒武纪：云端 AI 芯片 Fabless',
  'cn:688008': '澜起科技：内存接口/互连芯片 Fabless（非存储颗粒）',
  'cn:688047': '龙芯中科：处理器 Fabless',
  'cn:603501': '豪威集团：CIS 图像传感器 Fabless',
  'cn:002049': '紫光国微：安全芯片/特种 FPGA Fabless',
  'cn:300458': '全志科技：SoC Fabless',
  'cn:603893': '瑞芯微：SoC Fabless',
  'cn:688018': '乐鑫科技：Wi-Fi MCU Fabless',
  'cn:688213': '思特威：CIS Fabless',
  'cn:688099': '晶晨股份：多媒体 SoC Fabless',
  'cn:603160': '汇顶科技：触控/指纹芯片 Fabless',
  'cn:301536': '星宸科技：视频 SoC Fabless',
  'cn:688608': '恒玄科技：音频 SoC Fabless',
  'cn:688385': '复旦微电：FPGA/安全芯片 Fabless',
  'hk:01385': '上海复旦（同 688385）：FPGA/安全芯片 Fabless',
  'cn:301269': '华大九天：EDA 软件',
  'cn:688521': '芯原股份：半导体 IP 与芯片定制服务',
  'cn:688220': '翱捷科技：无线通信芯片 Fabless',
  'cn:688702': '盛科通信：以太网交换芯片 Fabless',
  'cn:300474': '景嘉微：GPU Fabless',
  'cn:688709': '成都华微：特种集成电路设计',
  'cn:688582': '芯动联科：MEMS 惯性传感器设计 Fabless',
}

export const LYNCH_CYCLICAL_OVERRIDES = {
  ...Object.fromEntries(Object.entries(CHEM_PHARMA).map(([k, name]) => [k, [false, `${name}：化学药，原「行业属强周期」为生成器误判`]])),
  // 新和成名义上在中证「化学药」，但主业是维生素/蛋氨酸/香精香料，产品价格周期决定利润（TTM 利润 34 亿→73 亿→72 亿），保留强周期
  'cn:002001': [true, '新和成：维生素/蛋氨酸价格周期主导利润，保留强周期'],
  ...Object.fromEntries(Object.entries(CHIP_DESIGN).map(([k, why]) => [k, [false, `${why}；芯片设计不按强周期`]])),
}

/** 把人工纠错写入条目（只在取值不同时返回新对象） */
export function applyCyclicalOverride(key, entry) {
  const o = LYNCH_CYCLICAL_OVERRIDES[key]
  if (!o || entry?.cyclical === o[0]) return entry
  return { ...entry, cyclical: o[0] }
}
