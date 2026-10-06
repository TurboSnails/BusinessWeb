# AI实验室 栏目重设计 · 设计文档

日期：2026-10-06　状态：待用户审阅

## 1. 目标与成功标准

把 `/ai`（AI实验室）从一页三步路线，改成「作品橱窗 + 方向地图 + 实验档案」的栏目：上半部分展示已经做出来、能直接用的作品；下半部分列出全部副业/创作方向，按推荐与不推荐分组、按匹配度排序并打标记；每个方向有一页实验档案，按 build in public 的方式记录。

定位：一个程序员、《正念投资》作者，为“到 400 万、离开全职工作之后”准备的第二曲线。业余每周几小时，内容必须好维护，只放真实内容。

成功标准：

1. 打开 `/ai`，第一屏能看到定位、三个统计数字和作品橱窗。
2. 列出全部 11 个方向，分「推荐」「不推荐」两组；推荐组按匹配度从高到低排序；每个方向都带标记（强烈推荐 / 推荐 / 可以试 / 实验 / 不推荐）与 1–5 星匹配度。
3. 「不推荐」组默认折叠，展开后每项写明原因。
4. 每个方向点进 `/ai/:slug` 可看实验档案；未知 slug 显示 404 页。
5. 没有日志的方向显示“还没开始”，不出现编造的数据、进度或收入。
6. 手机（360 / 390px）与桌面（1280px）可正常使用：无横向页面滚动，点击目标 ≥ 44px；作品橱窗手机端横向滑动，桌面 4 列；方向卡手机 1 列、桌面 2 列。
7. 访问 `/ai/*` 时顶部导航「AI实验室」高亮。
8. `npm test`、`npm run typecheck`、`npm run build` 通过。

不在范围内：自由空间重设计（之后单独做）、评论/订阅等后端功能、Newsletter 实际发送、任何新产品本身的开发。

## 2. 数据模型（`src/data/aiLab.ts`）

所有内容集中在一个数据文件，加方向、写日志只改这里。

```ts
export type LabVerdict = 'strong' | 'recommend' | 'try' | 'experiment' | 'avoid'
export type LabStatus = '进行中' | '计划中' | '未开始' | '已暂停' | '已停止' | '不做'

export interface LabShowcaseItem {
  title: string
  desc: string
  path: string          // 站内路由
}

export interface LabLogEntry {
  date: string          // YYYY-MM-DD
  did: string
  result: string
}

export interface LabDirection {
  slug: string
  title: string
  verdict: LabVerdict
  fit: 1 | 2 | 3 | 4 | 5
  status: LabStatus
  reason: string        // 卡片上的一句理由
  why: string           // 详情页：为什么做 / 为什么不做
  hoursPerWeek?: number
  startCost?: string    // 如 '¥0'
  limits?: { budget?: string; deadline?: string; stopWhen?: string }
  firstStep?: string
  logs: LabLogEntry[]
}

export const VERDICT_LABEL: Record<LabVerdict, string>
// strong: 强烈推荐  recommend: 推荐  try: 可以试  experiment: 实验  avoid: 不推荐

export const LAB_SHOWCASE: LabShowcaseItem[]
export const LAB_DIRECTIONS: LabDirection[]

export function recommendedDirections(): LabDirection[]  // verdict !== 'avoid'，按 fit 降序，同分保持原顺序
export function avoidedDirections(): LabDirection[]      // verdict === 'avoid'
export function findDirection(slug: string): LabDirection | undefined
export function labStats(): { works: number; running: number; stopped: number }
// works = LAB_SHOWCASE.length；running = status '进行中' 的数量；stopped = status '已停止' 的数量
```

## 3. 内容

### 作品橱窗（只放已存在的）

| 作品 | 路径 | 一句话 |
|---|---|---|
| 投资分析 Skill 包 | `/invest/ai-tools` | 三套投资分析 Skill 专家，可完整下载 |
| 公司估值 | `/valuation` | 六方法三情景估值与报告导出 |
| 网格交易 | `/grid-trading` | ETF / 个股网格模拟、回测与记录 |
| 这个网站 | `/about` | 用 React 自己搭的个人站，本身就是第一个作品 |

### 方向（11 个）

| slug | 方向 | 标记 | 匹配度 | 状态 | 一句理由 |
|---|---|---|---|---|---|
| `ai-skills` | AI 工具 / Skill / Agent | 强烈推荐 | 5 | 进行中 | 已有三套投资 Skill，新领域有先发优势 |
| `indie-dev` | 独立产品开发 | 强烈推荐 | 5 | 进行中 | 程序员本行，第一个产品从书里长出来 |
| `free-tools` | 免费在线工具 | 推荐 | 4 | 未开始 | 做一次长期获客，和书互相引流 |
| `digital-goods` | 数字商品 | 推荐 | 4 | 未开始 | 无库存、几乎不用客服 |
| `blog` | 博客 | 推荐 | 4 | 未开始 | 沉淀自己的读者，也整理思路 |
| `newsletter` | Newsletter | 推荐 | 3 | 计划中 | 读者归自己，等有读者再开 |
| `video` | 视频 | 可以试 | 3 | 未开始 | 曝光大但很耗时，先做录屏 + 字幕 |
| `dropshipping` | 无货源电商 | 实验 | 2 | 未开始 | 和优势关系不大，限 3 个月 / ¥5000 |
| `outsourcing` | AI 外包接单 | 不推荐 | 1 | 不做 | 仍是拿时间换钱，和时间自主相反 |
| `content-farm` | 代写 / 内容农场 | 不推荐 | 1 | 不做 | 损害个人品牌，平台规则风险高 |
| `paid-signals` | 付费投资群 / 荐股 | 不推荐 | 1 | 不做 | 违背书里“不荐股”，且有合规风险 |

`indie-dev` 的 `firstStep` 与日志吸收原有路线：建站（进行中）→ 正念投资 AI V0.1 → 公开验证 20 个真实用户。`ai-skills` 的日志记一条已发生的事实：已发布三套投资分析 Skill 下载包（日期取该功能上线的提交日期）。其余方向 `logs: []`。

各方向的 `why`、`hoursPerWeek`、`startCost`、`limits`、`firstStep` 在实现时按上表理由展开为 2–4 句真实可执行的文字；只写计划与规则，不写收入或用户数等未发生的结果。`dropshipping` 必须写明预算 ¥5000、期限 3 个月、停止条件（到期未盈利即停）。

## 4. 页面

### `/ai` · AiStudio（重写）

1. 页头：`h1` AI实验室；定位一句话；统计行「作品 N · 进行中 N · 已停止 N」（来自 `labStats()`）。
2. 作品橱窗：`section`「作品」，卡片链接到站内路径。
3. 方向地图·推荐：`section`「推荐方向」，`recommendedDirections()` 渲染方向卡。
4. 不推荐：`details`（默认收起）`summary`「不推荐（N）」，内部同样是方向卡。
5. 实验规则：一段文字——每个实验先定时间和预算上限，到期看数据，继续或停止，日志公开。

方向卡（整卡为 `Link` 到 `/ai/:slug`），信息顺序固定：

```
[标记徽章]  [★★★★☆ 匹配度 4/5]        [状态]
方向名称
一句理由
每周 3h · 启动 ¥0          （字段缺失则不显示该段）
```

- 星级用字符 ★/☆，外加 `aria-label="匹配度 4/5"`；标记徽章是文字，不只靠颜色区分。
- 标记配色：强烈推荐/推荐用 `--accent`，可以试/实验用 `--accent-warm`，不推荐用 `--text-secondary`。

### `/ai/:slug` · AiLabDirection（新增）

- 顶部返回链接「← AI实验室」。
- `h1` 方向名；徽章、星级、状态一行。
- 段落：「为什么做」（不推荐方向标题为「为什么不做」）。
- 「实验边界」：每周时间、启动成本、预算、期限、停止条件，用定义列表 `dl`；全空则整块不显示。
- 「第一步」：有则显示。
- 「实验日志」：按日期倒序列表；为空显示“还没开始。开始后会在这里公开记录。”；不推荐方向不显示日志块。
- slug 找不到 → 渲染现有 `NotFound` 组件。

### 路由与导航

- `App.tsx` 新增 `<Route path="/ai/:slug" element={<AiLabDirection />} />`（lazy 加载，与其他页一致）。
- `isNavActive('/ai', '/ai/blog')` 已通过 `matchesPath` 返回 true，补测试确认即可，无需改代码。

## 5. 样式

沿用「纸书茶室」变量，不引入新风格。新增类集中在 `src/styles/shell.css` 末尾的一个 `/* AI 实验室 */` 区块：

- `.lab-stats`：统计行，次要文字色。
- `.lab-showcase`：手机端 `display:flex; overflow-x:auto; scroll-snap-type:x mandatory`，卡片宽 78%；≥ 768px 改为 4 列 grid、不滚动。
- `.lab-grid`：手机 1 列，≥ 768px 2 列，间距 16px。
- `.lab-card`：复用 `.hub-card` 的边框、圆角与过渡；内边距保证整卡高度 ≥ 44px。
- `.lab-badge--strong/recommend/try/experiment/avoid`：文字徽章。
- 页面整体不允许横向滚动（橱窗容器内部滚动除外）。

## 6. 测试

- `aiLab.test.ts`：共 11 个方向、slug 唯一；每个方向 verdict 在标记表内；`recommendedDirections()` 按 fit 降序且不含 avoid；`avoidedDirections()` 全为 avoid；`findDirection` 命中/未命中；`labStats()` 与数据一致；`dropshipping` 带预算、期限、停止条件；无日志的方向 `logs` 为空数组。
- `AiStudio.test.tsx`：渲染 h1；作品橱窗 4 个链接；推荐组卡片顺序与 `recommendedDirections()` 一致；不推荐组在 `details` 内且默认收起；星级 `aria-label` 存在。
- `AiLabDirection.test.tsx`：已知 slug 渲染标题与「为什么做」；不推荐方向显示「为什么不做」且无日志块；无日志方向显示“还没开始”；未知 slug 渲染 404。
- `Sections.test.tsx` 中现有 AI实验室 断言按新结构更新；`siteMap.test.ts` 补 `/ai/blog` 高亮用例。

## 7. 改动文件

| 文件 | 动作 |
|---|---|
| `src/data/aiLab.ts` | 新增 |
| `src/data/aiLab.test.ts` | 新增 |
| `src/pages/AiStudio.tsx` | 重写 |
| `src/pages/AiStudio.test.tsx` | 新增 |
| `src/pages/AiLabDirection.tsx` | 新增 |
| `src/pages/AiLabDirection.test.tsx` | 新增 |
| `src/App.tsx` | 加路由 |
| `src/styles/shell.css` | 加 AI 实验室样式区块 |
| `src/pages/Sections.test.tsx`、`src/data/siteMap.test.ts` | 更新断言 |
