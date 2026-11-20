# Bloomberg 行业前瞻 P/E 手动导入

把 Bloomberg 终端导出的 CSV 放在这里，`npm run sector-pe:update`（以及每日工作流）会自动并入
`public/data/us-sector-forward-pe.json`。

- 文件名：`<行业切片id>.csv`，如 `sector-xlp.csv`（必需消费）、`sector-xlv.csv`（医疗保健）。
  可用 id：sector-xlk / xlf / xly / xlp / xlv / xli / xle / xlb / xlu / xlre / xlc。
- 导出方式：图表（`S5CONS Index`，字段 `BEst P/E Ratio`，周期 `1BF`）→ `Actions → Export`，存成 CSV。
- 格式：第一列日期、第二列数值；表头和说明行会被自动跳过。日期支持 `11/19/2026` 与 `2026-11-19`。
- 同一日期以 CSV 为准；只有 CSV 的行业需要至少 100 个点（约 2 年周频或半年日频）。
- 只放真实导出的数据，不要手填估算值。Bloomberg 数据受授权限制，注意不要把原始导出再公开分发。
