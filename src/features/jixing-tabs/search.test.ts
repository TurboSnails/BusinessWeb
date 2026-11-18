import { describe, expect, it } from 'vitest'
import { filterByQuery } from './search'

describe('指数名称搜索', () => {
  const items = [{ name: '中证主要消费' }, { name: '中证食品饮料' }]

  it.each([
    ['zzzyxf', items[0]],
    ['zzspyl', items[1]],
  ])('按拼音首字母 %s 匹配指数', (query, item) => {
    expect(filterByQuery(items, query)).toEqual([item])
  })
})
