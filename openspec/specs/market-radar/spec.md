# market-radar Specification

## Purpose
从股市自身的流动性、估值、仓位与拥挤度、交易结构、盈利五个维度描述冷热与各维度现状，并公开历史检验；不改变仓位，仓位以综合策略为准。
## Requirements
### Requirement: 计分规则保持冻结
系统 SHALL 保持 radar-v1 的九项计分指标、阈值、同维度平均、五维等权与分档刻度不变；新增指标 MUST 只展示、不计分。

#### Scenario: 新增指标不进入综合分
- **WHEN** 生成雷达数据
- **THEN** `inScore` 为真的指标恰为九项（baaChange、erp、pe、equityShare、cashShare、finraDebtYoy、breadth、volume、epsYoy），18 项新增指标的 `score` 为 null

#### Scenario: 百分位样本调整不改变按百分位计分的四项
- **WHEN** 对 erp、pe、equityShare、cashShare 用新的样本规则计算百分位
- **THEN** 结果与原规则逐点相同

### Requirement: 回测不使用未来信息
回测里的每股盈利与市盈率 MUST 只使用季末值，并在季末后第 3 个月末才可得。

#### Scenario: 季中月份不提前知道本季盈利
- **WHEN** 在 7 月 31 日取每股盈利同比
- **THEN** 用到的最新盈利观测是 3 月（一季度末），而不是 4 月的插值

### Requirement: 冷热只在有方向且读数有效时给出
指标 SHALL 带 `direction`（hot / cold / none）与 `status`（fresh / stale / discontinued / sparse）；direction 为 none 或 status 不是 fresh 时，冷热 MUST 为 na。

#### Scenario: 成交量不标冷热
- **WHEN** 20 日量比处于第 95 百分位
- **THEN** 该指标显示百分位，但冷热为「不给冷热」

#### Scenario: 过期读数
- **WHEN** 周频指标的最新观测距生成日超过 21 天
- **THEN** status 为 stale，页面在该行标出滞后天数，冷热为 na，读数与日期照常显示

#### Scenario: 停更来源
- **WHEN** 指标定义标为已停更（NAAIM）
- **THEN** status 为 discontinued，页面标「停更」，冷热为 na

#### Scenario: 零星读数
- **WHEN** 指标可用观测少于 3 个（美银调查）
- **THEN** status 为 sparse，不给百分位与变化，不画走势，仍显示读数与日期

### Requirement: 百分位按均匀样本计算
日频与周频序列 MUST 先按周取每周最后一个观测、再加上最新观测后计算百分位，并在 `percentileBasis` 写明样本口径。

#### Scenario: 疏密不均的序列
- **WHEN** 一个序列早年按日、中段按周保存
- **THEN** 每周只有一个样本参与百分位，各年代权重相同

### Requirement: 每项指标给出数值、变化与规则线
系统 SHALL 为每项指标输出 `value`、`valueText`、`unit`、`frequency`、`ageDays`、`changes`（最多两项）、`thresholds`、`group`、`core` 与全部历史。

#### Scenario: 日频指标的变化
- **WHEN** 指标为日频且 30 天前、91 天前都有观测
- **THEN** `changes` 依次为「较 1 个月前」「较 3 个月前」，`toward` 与 direction 一致

#### Scenario: 没有可比观测
- **WHEN** 更早的观测距目标日超过比较区间的一半
- **THEN** 不输出这一项变化

### Requirement: 来源失败不拖累整体
新接的外部来源首次下载失败且没有缓存时，系统 MUST 只让对应指标读数暂缺，并继续生成其余指标与回测。

#### Scenario: OFR 文件下载失败
- **WHEN** 首次运行时 fsi.csv 返回错误
- **THEN** ofrCredit 的 `valueText` 为「—」、status 为 sparse，脚本给出警告并正常结束

### Requirement: 回测给出可核对的证据
回测 SHALL 输出月度综合分、冷热分与维度分、四条净值曲线、按档位与按冷热分组的之后 12 个月表现（全样本、1973–1999、2000 年以来三段，每段含月数、段数与独立样本数）、综合分与冷热分对之后 12 个月回报的相关系数及重叠修正 t 值、月末收盘口径对照，以及夏普差的抽样区间；结论句 MUST 按抽样区间与 t 值措辞。

#### Scenario: 差异在抽样误差内
- **WHEN** 雷达与恒定七成的夏普差的 95% 区间包含 0
- **THEN** 结论句写「差异在抽样误差内」，不写「高于」或「低于」

#### Scenario: 结果可复现
- **WHEN** 用相同输入连续运行两次
- **THEN** `sharpeGaps` 与 `predictive` 完全相同

#### Scenario: 没有样本的分组
- **WHEN** 某个档位在 2000 年以来从未出现
- **THEN** 该行 `months`、`episodes`、`independent` 为 0，其余为 null，页面显示「—」

#### Scenario: 重叠窗口不夸大样本
- **WHEN** 某组有 74 个月、分属 21 段
- **THEN** `independent` 为 6（月数 ÷ 12 四舍五入，不超过段数，至少 1）

### Requirement: 一屏看清冷热分布
页面 SHALL 在指标表之前提供总览：冷热计数与按维度分行的色块格，点击色块定位并展开对应指标。

#### Scenario: 从总览跳到指标
- **WHEN** 用户点击总览里的「VIX 水平」
- **THEN** 指标区滚动到该行并展开，网址带上 `ind=vix`

### Requirement: 指标可筛选、排序并保持在网址里
指标区 SHALL 支持按维度筛选、核心 / 全部切换、只看计分、四种排序，状态写入网址参数并在刷新后恢复。

#### Scenario: 刷新后保持视图
- **WHEN** 用户选了「估值」「全部」「最热在前」后刷新页面
- **THEN** 页面仍是同一视图

#### Scenario: 空筛选
- **WHEN** 筛选后没有任何指标
- **THEN** 显示「没有符合条件的指标」和「清除筛选」

#### Scenario: 无效网址参数
- **WHEN** 网址带 `dim=foo` 或 `ind=不存在`
- **THEN** 忽略该参数并按默认视图显示

### Requirement: 历史位置条不暗示冷热方向
历史位置条 MUST 用中性轨道表示原始百分位，冷热只由标签与圆点颜色表达；数值越高越冷的指标 MUST 有文字说明。

#### Scenario: 反向指标
- **WHEN** 家庭现金占比处于第 2 百分位
- **THEN** 圆点在轨道左端，标签为「偏热」，并显示「数值越高越冷」

### Requirement: 窄屏可用
页面在 390 宽下 MUST 无横向溢出；指标每项不超过两行摘要，徽标不拉伸成整行。

#### Scenario: 窄屏
- **WHEN** 视口宽 390
- **THEN** `document.documentElement.scrollWidth` 不超过 390，默认视图的页面总高度不超过 9,000 像素

### Requirement: 数据结构校验
页面读到缺少新字段的数据文件时 MUST 显示明确的错误提示而不是白屏。

#### Scenario: 旧版数据
- **WHEN** 数据文件缺 `current.counts`
- **THEN** 页面显示「数据版本过旧，请稍后刷新」

### Requirement: 综合分不作为主读数
页面主视图 MUST NOT 显示五维综合分、五档色带或按档位的回报表；这些内容 SHALL 只出现在默认收起的「把五个维度平均成一个分数行不行」折叠区内，折叠标题下的摘要由数据生成。

#### Scenario: 打开页面
- **WHEN** 用户打开市场雷达页
- **THEN** 结论区显示冷热、五维分数与冷热分走势，不出现「进攻」「防守」等档位字样；折叠区默认收起

#### Scenario: 综合策略页的月度对照
- **WHEN** 用户在综合策略页「研究记录」里查看宏观档位的月度对照
- **THEN** 下带默认画冷热（偏热 / 居中 / 偏冷）；雷达综合分档位只在「下带：雷达综合分档位」子 tab 里出现，并注明只作对照

#### Scenario: 综合分没有预测力
- **WHEN** `predictive.score.all` 的 |t| < 2
- **THEN** 折叠摘要以「没有证据显示可行」开头

### Requirement: 冷热的历史表现分两段陈述
按冷热分组的之后 12 个月表现 MUST 分 1973–1999 与 2000 年以来两段列出并标独立样本数；两段「偏热 − 居中」方向相反时，结论句 MUST 写明两段方向相反、不能当择时信号。

#### Scenario: 两段方向相反
- **WHEN** 1973–1999 偏热之后平均高于居中，2000 年以来低于居中
- **THEN** 结论句包含「两段方向相反」

