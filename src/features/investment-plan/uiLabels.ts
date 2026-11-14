// 用户可见文案：禁止把 raw enum / 开发者键名直接渲染到 UI。

export const BAND_LABEL: Record<string, string> = {
  within: '在事先区间内',
  breached: '超出事先区间，待核对',
  unknown: '还不能判断',
}

export const DATA_LABEL: Record<string, string> = {
  missing: '有类别缺金额',
  undated: '缺估值日期或来自旧页',
  stale: '检查日之后还没重新核对金额',
  unknown: '目标比例未填齐或合计不是 100%',
  ok: '记录齐备',
  invalid: '金额无法识别',
}

export const OUTCOME_LABEL: Record<string, string> = {
  'no-action': '本次未调整',
  cashflow: '记录新增资金安排',
  adjusted: '已自行调整',
  deferred: '暂缓',
}

export const LEGACY_STATUS_LABEL: Record<string, string> = {
  missing: '没有找到旧页记录',
  unfilled: '旧页只有示例默认值，没有可导入的填写',
  unconfirmed: '找到你在旧页填写的记录，核对后可导入',
  invalid: '旧页记录有无法识别的部分',
}

export const START_STATUS_LABEL: Record<string, string> = {
  missing: '没有自测记录',
  ok: '有自测记录',
  corrupt: '自测记录无法识别',
  unavailable: '浏览器暂不允许读取本机记录',
}

export const WRITE_REASON_LABEL: Record<string, string> = {
  'revision-conflict': '另一个窗口更新了计划，请刷新后比较两份再保存。',
  protected: '有未处理的冲突或无法识别的记录，暂不能保存；请先在下方处理。',
  invalid: '有一项填写不符合要求，未保存。',
  storage: '本机存储写入失败，计划仍在内存中，请备份后重试。',
  stale: '源记录已变化，请重新预览核对。',
  'create-failed': '未能创建计划，旧页记录没有被改动。',
  'invalid-wrapper': '这个文件不是本页导出的备份，原计划未改动。',
  'replace-failed': '恢复没有完成，原计划未改动。',
}

export function writeReasonLabel(reason: string): string {
  return WRITE_REASON_LABEL[reason] ?? `未能完成（请稍后重试）。`
}

export function bandLabel(v: string): string {
  return BAND_LABEL[v] ?? '还不能判断'
}

export function dataLabel(v: string): string {
  return DATA_LABEL[v] ?? '还不能判断'
}

export function outcomeLabel(v: string): string {
  return OUTCOME_LABEL[v] ?? v
}

export const FX_HINT =
  '外币资产请按估值日汇率折成人民币后填写，并填同一估值日期；本页不自动换汇。'

export const PRIVACY_LOCAL =
  '计划保存在这台设备的浏览器里，服务器不会收到本机计划；换浏览器或清理本站数据可能丢失，请定期备份。公共电脑用完请清除本机计划。'

export const PRIVACY_OWNER_SYNCED =
  '你已选择把计划副本同步到站长专用云端；本机与云端可分别保留。'
