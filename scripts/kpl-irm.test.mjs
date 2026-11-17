// 互动问答页签计算：互动易 / e 互动解析、相对时间、分类规则、关键词热度、按回复日归档、行情日期校验、函件解析
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  A_MAX, classify, cleanText, dayFile, keywordHeat, letterGroup, mergeItems, mergeLetters, nextTradingDay, parseQuotes, parseSseFeed, parseSseLetters,
  parseSzPage, parseSzItem, parseSzseDiscipline, parseSzseInquiry, parseSzseMeasures, refreshDays, resolveSseTime, slotOf, stripGreeting, summarize,
} from './kpl-irm-lib.mjs'

// 2026-11-17 15:13 北京 = 07:13 UTC
const ms = (bj) => String(Date.parse(`${bj.replace(' ', 'T')}:00+08:00`))
const sz = (o = {}) => ({
  indexId: '2406504854765043712', stockCode: '300760', companyShortName: '迈瑞医疗', authorName: 'cninfo1368787',
  mainContent: '董秘好，手术机器人<em>进展</em>如何？', attachedContent: '您好，谢谢关注。我们的手术机器人产品今年将进入注册阶段，正在按计划推进。',
  pubDate: ms('2026-11-17 12:33'), attachedPubDate: ms('2026-11-17 15:13'), updateDate: ms('2026-11-17 20:46'), ...o,
})

test('互动易：回复时间按北京时间；不保存提问人；缺回复 / 缺代码跳过；超长截断并标记', () => {
  const x = parseSzItem(sz())
  assert.equal(x.at, '2026-11-17 15:13')
  assert.equal(x.qt, '2026-11-17 12:33')
  assert.equal(x.q, '董秘好，手术机器人进展如何？')
  assert.equal(x.cat, 'progress')
  assert.equal(x.url, 'https://irm.cninfo.com.cn/ircs/question/questionDetail?questionId=2406504854765043712')
  assert.ok(!JSON.stringify(x).includes('cninfo1368787'))
  assert.equal(x.cut, undefined)
  assert.equal(parseSzItem(sz({ attachedContent: '' })), null)
  assert.equal(parseSzItem(sz({ stockCode: 'abc' })), null)
  assert.equal(parseSzItem(sz({ attachedPubDate: null })), null)
  const long = parseSzItem(sz({ attachedContent: '好'.repeat(A_MAX + 50) }))
  assert.equal([...long.a].length, A_MAX + 1)
  assert.equal(long.cut, 1)
  assert.throws(() => parseSzPage({ results: null }))
  assert.equal(parseSzPage({ totalRecord: 2, totalPage: 1, results: [sz(), sz({ stockCode: '' })] }).items.length, 1)
})

test('e 互动相对时间：以响应时间（北京）为基准', () => {
  const now = '2026-11-18 03:42'
  assert.equal(resolveSseTime('昨天 18:17', now), '2026-11-17 18:17')
  assert.equal(resolveSseTime('今天 9:05', now), '2026-11-18 09:05')
  assert.equal(resolveSseTime('2026年11月11日 12:39', now), '2026-11-11 12:39')
  assert.equal(resolveSseTime('11月16日 08:47', now), '2026-11-16 08:47')
  assert.equal(resolveSseTime('12月30日 08:47', now), '2025-12-30 08:47') // 比今天晚的月日属于去年
  assert.equal(resolveSseTime('5分钟前', now), '2026-11-18 03:37')
  assert.equal(resolveSseTime('2小时前', '2026-11-18 01:00'), '2026-11-17 23:00')
  assert.equal(resolveSseTime('很久以前', now), null)
})

const feedItem = (id, qTime, aTime, answer = '尊敬的投资者您好！阿里项目已于2025年下半年实现批量交付。') => `
<div class="m_feed_item" id="item-${id}">
  <div class="m_feed_detail m_qa_detail">
    <div class="m_feed_face"><a rel="face" uid="339507" href="user.do?uid=339507" title="投资者_1784523431103"></a><p>投资者_1784523431103</p></div>
    <div class="m_feed_cnt "><div class="m_feed_txt" id="m_feed_txt-${id}">
      <a href='user.do?uid=273765' >:华丰科技(688629)</a>请问公司连接器和阿里&nbsp;是否形成稳定合作？
    </div>
    <div class="m_feed_func"><div class="m_feed_from"><span>${qTime}</span><em>来自</em></div></div></div>
  </div>
  <div class="m_feed_detail m_qa">
    <div class="m_feed_cnt"><div class="m_feed_txt" id="m_feed_txt-${id}">
      ${answer}
    </div></div>
    <div class="m_feed_func top10"><div class="m_feed_from" style="padding-left: 35px;"><span>${aTime}</span><em>来自</em></div></div>
  </div>
</div>`

test('e 互动「最新答复」HTML 解析：公司、提问、回复、时间；不保存提问人昵称', () => {
  const html = feedItem(1806846, '2026年11月11日 12:39', '昨天 18:17') + feedItem(1806847, '2026年11月10日 10:00', '2026年11月16日 09:00', '')
  const items = parseSseFeed(html, '2026-11-18 03:42')
  assert.equal(items.length, 1) // 第二条回复为空，跳过
  const x = items[0]
  assert.deepEqual([x.id, x.p, x.code, x.name, x.at, x.qt], ['sh1806846', 'sh', '688629', '华丰科技', '2026-11-17 18:17', '2026-11-11 12:39'])
  assert.equal(x.q, '请问公司连接器和阿里 是否形成稳定合作？')
  assert.equal(x.cat, 'capacity') // 「批量」命中产能产品
  assert.equal(x.url, 'https://sns.sseinfo.com/company.do?uid=273765')
  assert.ok(!JSON.stringify(x).includes('投资者_1784523431103'))
})

test('分类：按优先级取第一条命中；澄清否认只看去掉客套话后的前 80 字', () => {
  assert.equal(stripGreeting('尊敬的投资者，您好！感谢您的关注。公司不涉及'), '公司不涉及')
  assert.equal(classify('您好，公司目前不涉及该业务，感谢关注。'), 'clarify')
  assert.equal(classify(`您好，${'公司经营正常'.repeat(20)}，相关信息不存在。`), 'other') // 否认词在 80 字之后
  assert.equal(classify('您好，公司未涉及，相关订单存在不确定性。'), 'clarify') // 澄清优先于风险
  assert.equal(classify('公司已签订框架协议，后续存在不确定性。'), 'risk')
  assert.equal(classify('公司将实施回购并签订合同。'), 'dividend')
  assert.equal(classify('公司已获得定点。'), 'order')
  assert.equal(classify('新产线已投产。'), 'capacity')
  assert.equal(classify('项目正在推进中。'), 'progress')
  assert.equal(classify('感谢您的关注和建议。'), 'other')
  assert.equal(cleanText('a&amp;b&#20013;<br/>c  d'), 'a&b中 c d')
})

test('关键词热度只数提问；汇总热门公司带当日 / 次日涨跌', () => {
  const items = [
    { p: 'sz', code: '000001', name: '甲', q: '公司有人形机器人业务吗', cat: 'clarify' },
    { p: 'sz', code: '000001', name: '甲', q: '算力布局？', cat: 'progress' },
    { p: 'sh', code: '600000', name: '乙', q: '机器人进展', cat: 'other', a: '算力' },
  ]
  const kw = keywordHeat(items)
  assert.deepEqual(kw.find((k) => k.kw === '机器人'), { kw: '机器人', n: 2, companies: 2 })
  assert.equal(kw.find((k) => k.kw === '算力').n, 1)
  const s = summarize('2026-11-17', items, { day: '2026-11-17', next: null, d: { '000001': [1.5, '银行'] }, n: null })
  assert.deepEqual([s.total, s.sz, s.sh, s.companies], [3, 2, 1, 2])
  assert.equal(s.cats.clarify, 1)
  assert.deepEqual(s.hot[0], { code: '000001', name: '甲', p: 'sz', n: 2, cats: { clarify: 1, progress: 1 }, chg: 1.5, next: null, ind: '银行' })
  assert.equal(s.hot[1].chg, null) // 缺行情是 null，不是 0
})

test('归档：刷新上一交易日的前一交易日到今天；星期轮换文件名；合并去重按时间倒序', () => {
  assert.deepEqual(refreshDays('2026-11-18'), ['2026-11-17', '2026-11-18'])
  assert.deepEqual(refreshDays('2026-11-16'), ['2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16']) // 周一：含周末
  assert.deepEqual(refreshDays('2026-11-15'), ['2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']) // 周日
  assert.equal(slotOf('2026-11-17'), 'tue')
  assert.equal(dayFile('2026-11-22'), 'kpl-irm-sun.json')
  assert.equal(nextTradingDay('2026-11-13'), '2026-11-16')
  const m = mergeItems([{ id: 'a', at: '2026-11-17 10:00', v: 1 }, { id: 'b', at: '2026-11-17 09:00' }], [{ id: 'a', at: '2026-11-17 10:00', v: 2 }, { id: 'c', at: '2026-11-17 11:00' }])
  assert.deepEqual(m.map((x) => x.id), ['c', 'a', 'b'])
  assert.equal(m[1].v, 2)
})

test('行情：日期不符报错；缺失涨跌幅为 null', () => {
  const rows = [{ SECURITY_CODE: '300760', TRADE_DATE: '2026-11-17 00:00:00', CHANGE_RATE: 2.11320754717, BOARD_NAME: '医疗器械' }, { SECURITY_CODE: '000001', TRADE_DATE: '2026-11-17 00:00:00', CHANGE_RATE: null, BOARD_NAME: '' }]
  const q = parseQuotes(rows, '2026-11-17')
  assert.deepEqual(q.get('300760'), { chg: 2.11, ind: '医疗器械' })
  assert.deepEqual(q.get('000001'), { chg: null, ind: null })
  assert.throws(() => parseQuotes(rows, '2026-11-18'), /日期不符/)
})

test('函件：深交所问询 / 监管措施 / 处分，上交所监管措施；分组与链接', () => {
  const inq = parseSzseInquiry([{ gsdm: '300364', gsjc: '中文在线', fhrq: '2026-10-02', hjlb: '问询函', ck: "<a href='javascript:void(0)' encode-open='/UpFiles/zqjghj/a.pdf'>详细内容</a>", hfck: "<a encode-open='/UpFiles/zqjghj/b.pdf'>回复公告</a>" }])
  assert.deepEqual(inq[0], { ex: 'sz', code: '300364', name: '中文在线', date: '2026-10-02', type: '问询函', group: 'inquiry', title: '中文在线 问询函', url: 'https://reportdocs.static.szse.cn/UpFiles/zqjghj/a.pdf', reply: 'https://reportdocs.static.szse.cn/UpFiles/zqjghj/b.pdf', replyTitle: '回复公告' })
  const mea = parseSzseMeasures([{ gkxx_gsdm: '', gkxx_gsjc: '', gkxx_gdrq: '2026-08-28', gkxx_jgcs: '监管函', hjnr: "<a encode-open='/x.pdf'>详细内容</a>", gkxx_sjdx: '董监高<br/>控股股东' }])
  assert.equal(mea[0].code, null)
  assert.equal(mea[0].title, '（未列公司） 监管函（涉及：董监高、控股股东）')
  assert.equal(mea[0].group, 'supervision')
  const dis = parseSzseDiscipline([{ gsdm: '000821', jc_gsjc: 'ST京机', fhrq: '2026-11-11', cflb: '公开谴责', hjbt: '关于对某某给予公开谴责处分的决定', ck: "<a encode-open='/y.pdf'>查看</a>" }, { fhrq: '' }])
  assert.equal(dis.length, 1)
  assert.equal(dis[0].group, 'discipline')
  const sh = parseSseLetters([
    { createTime: '2026-11-12 18:14:53', stockcode: '603366', extGSJC: '日出东方', extTYPE: '监管工作函', channelId: '10010', docTitle: '关于日出东方股价波动事项的监管工作函', docURL: 'www.sse.com.cn/a.doc' },
    { createTime: '2026-11-06 16:47:07', stockcode: '688022', extGSJC: 'ST瀚川', extTYPE: '通报批评', channelId: '10008', docTitle: '通报批评的决定', docURL: 'www.sse.com.cn/b.pdf' },
  ])
  assert.equal(sh[0].url, 'https://www.sse.com.cn/a.doc')
  assert.deepEqual(sh.map((x) => x.group), ['supervision', 'discipline'])
  assert.equal(letterGroup('年报问询函'), 'inquiry')
  assert.equal(letterGroup('关注函'), 'attention')
  const merged = mergeLetters([...sh, sh[0], ...dis])
  assert.equal(merged.length, 3)
  assert.deepEqual(merged.map((x) => x.date), ['2026-11-12', '2026-11-11', '2026-11-06'])
})
