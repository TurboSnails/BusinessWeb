# 《正念投资：不盯盘、不预测的普通人投资方法》书稿目录

- `全书大纲.md`：全书结构与写作规范（计划文件）。
- `第N章-*.md`、`开篇-*.md`、`附录X-*.md`：各章正文初稿。文件名里的章号与大纲一致。
- `附件-数据/`：真实数据与脚本（腾讯行情接口取数；价格指数，不含分红）。说明见其中的 `README.md`。
- `附件-模拟脚本/`：第11章网格示意模拟的脚本（合成价格路径）。

## 发布到网页

网页在 `../BusinessWeb`：章节清单在 `src/pages/FirstBook.tsx` 的 `PARTS`，正文放在 `public/first-book/`。新增或改名章节时：

1. 复制 `.md` 到 `BusinessWeb/public/first-book/`；
2. 在 `PARTS` 中把对应条目的 `file` 与 `status` 改好；
3. `npm run build` 通过后，只提交 `src/pages/FirstBook.tsx` 与 `public/first-book/`，推送 main。

## 写作约定

- 每个“方法”配历史案例并标注“历史案例，非投资建议”；无法核实的数字不写成事实，标 `[待补]` 或 `[待核]`。
- Markdown 渲染器不支持嵌套列表；含 `*` 的文字要避免与粗体冲突。
- 道德经引语尽量不重复。
