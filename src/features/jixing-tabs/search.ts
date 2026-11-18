// 估值表 / 港股全球共用的轻量搜索：名称、代码子串；可选拼音首字母（简易映射）。

const INITIALS: Record<string, string> = {
  上: 's', 证: 'z', 指: 'z', 数: 's', 沪: 'h', 深: 's', 中: 'z', 全: 'q',
  创: 'c', 业: 'y', 板: 'b', 科: 'k', 技: 'j', 红: 'h', 利: 'l', 低: 'd',
  波: 'b', 央: 'y', 企: 'q', 国: 'g', 基: 'j', 本: 'b', 面: 'm', 现: 'x',
  金: 'j', 流: 'l', 价: 'j', 值: 'z', 成: 'c', 长: 'z', 消: 'x', 费: 'f',
  医: 'y', 疗: 'l', 银: 'y', 行: 'h', 券: 'q', 公: 'g', 司: 's',
  白: 'b', 酒: 'j', 食: 's', 品: 'p', 饮: 'y', 传: 'c', 媒: 'm', 计: 'j',
  算: 's', 机: 'j', 半: 'b', 导: 'd', 体: 't', 新: 'x', 能: 'n', 源: 'y',
  车: 'c', 光: 'g', 伏: 'f', 产: 'c', 军: 'j', 工: 'g', 有: 'y', 色: 's',
  属: 's', 煤: 'm', 炭: 't', 环: 'h', 保: 'b', 房: 'f', 地: 'd',
  建: 'j', 养: 'y', 老: 'l', 恒: 'h', 生: 's', 标: 'b', 普: 'p',
  纳: 'n', 斯: 's', 达: 'd', 克: 'k', 黄: 'h',
}

/** 名称 → 拼音首字母串（未知汉字跳过）。 */
export function nameInitials(name: string): string {
  let out = ''
  for (const ch of name) {
    if (/[a-zA-Z0-9]/.test(ch)) out += ch.toLowerCase()
    else if (INITIALS[ch]) out += INITIALS[ch]
  }
  return out
}

export type Searchable = { name: string; code?: string; key?: string; initials?: string }

/** 按查询过滤：空串返回原列表；匹配名称 / 代码 / 首字母子串（不区分大小写）。 */
export function filterByQuery<T extends Searchable>(items: T[], query: string): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter(item => {
    const name = item.name.toLowerCase()
    const code = (item.code ?? item.key ?? '').toLowerCase()
    const ini = (item.initials ?? nameInitials(item.name)).toLowerCase()
    return name.includes(q) || code.includes(q) || ini.includes(q)
  })
}
