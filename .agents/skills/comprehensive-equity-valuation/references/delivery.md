# 单公司与批量交付契约

## 协作

协调者先固定清单，市场和证券代码作为键，不按名称或代码单独去重。纳指与标普/ADR引用同一证券研究；跨交易地/ADR不得直接混用单位。分批写独立文件，避免多人改同一公司。所有成员先读本技能和 methodology.md，使用同一估值基准日、事实来源规则、输出契约。

逐家公司记录已核事实、模型假设、方法适用性和缺项。允许脚本复算/生成，但不能把模板生成称为“逐家专家深度复核”。先交付小样并独立校验，再扩批；协调者合并后核对全部键、重复、异常值、价格日期和缺项，另做独立方法审查。未解决的公司保留，不通过删除来提高完成率。

## JSON

顶层：`{ "schemaVersion": 1, "asOf": "YYYY-MM-DD", "records": [...] }`。

每条记录的必填字段：

- `key`：`market:code`；`market`、`code`、`name`；`currency`（报价币种）；`asOf`（本轮估值日期）。
- `price`：`{value: 正数或null, date: 日期或null, currency: 币种, source: 来源id或null}`。无价时解释missing，不参与比价。
- `status`：`conditional`（条件初稿）、`reviewed`（已核实具体范围）、`insufficient`（待证据）。
- `value`：`null`或`{low, base, high, kind: "present"|"future"|"undated", date: 日期或null, primaryMethod: 主方法名称}`。有数值必须0≤low≤base≤high。present日期等于估值基准日；future日期晚于基准日；undated日期null。不能无条件把旧期限不明三价改成present。
- `methods`：数组，每项`{name, applicable: boolean, reason, formula, inputs: object, values: [low,base,high]或null, sourceIds: string[]}`。至少明确评估PE、PEG、PB（名称严格这三个大写），不适用写原因；可另加DCF、SOTP等。没有来源的目标倍数可以是明确研究假设，但原始财务分母须有来源，模型假设写assumptions。
- `quality`、`pricing`、`expectations`、`risk`：四维精简结论字符串，各指向该公司证据/缺项，避免复写同一句泛话。
- `assumptions`、`missing`：字符串数组。`insufficient`必须至少一个具体缺项且value=null；不能显示0价或伪装无上行。
- `sources`：`[{id,title,url,asOf}]`，url可为公开一手页面或有日期/明确出处的仓库证据路径，不能填不存在的文件。来源asOf是资料日期，不因本轮生成而更新。
- `review`：`{mode: "programmatic"|"company"|"independent", by: string, note: string}`。programmatic不得标reviewed；独立复核范围要写清。

数据契约不替代财务推导。`value`必须等于已选主锚的values，不自动平均。不同方法时点必须在formula/reason说明；数据不足时value=null也可完整覆盖四维分析。

## 公司详情精简版

1. “综合估值 · 条件初稿/等待证据/已复核范围”与价格日期/币种。
2. 主锚区间/基准、时点、现价与相对差额。future/undated明确称情景价，不贴“低估”。
3. PE/PEG/PB及行业方法的财务分母、选定倍数或假设、计算与不适用原因。
4. 共同输入与方法分歧、四维理由、尾部风险、来源及待补证据。

列表“估值”展示主方法和价值类型、区间或基准、对比现价百分数和日期；缺项显示等待证据。不得用DCF旧自动值悄悄冒充综合估值。保留旧研究评级及其来源，新增本轮价格判断不静默覆盖。

更新报价只重算比价，不声称重新认证财报、估值或评级。区间映射“现价低于/位于/高于条件区间”只是条件价格关系，不是买入评级。禁止从数量覆盖推出全部数值估值完成。

## 可复核算例

- 正常盈利：EPS2，PE低/基准/高15/20/25，值30/40/50。若是2年后的EPS，kind=future；若是基准日正常化盈利的市场相对估值，写present及假设，不能混用。
- PEG：EPS2、增长20%、PEG1 → 隐含PE20，价40；增长0或负数则不适用。
- PB：BVPS10、PB0.8/1/1.2 → 值8/10/12，负权益不适用。
- 有20%增长但没有再投资/现金资料：PE/PEG可作有依据的条件敏感性，不认证DCF；缺关键分母时不造价。
- 供应商 forward EPS 有数字但没有预测财年，乘旧研究 PE 后只能是 undated 敏感性；把生成日期填入 value.date 不能将其变成 present。
- 原研究三价为30/40/50，更新后 EPS 为3、倍数15/20/25：新敏感性应45/60/75，不能继续抄30/40/50却把公式改写为新 EPS × PE。若旧模型已撤回，则三价暂停发布，保留撤回原因。
