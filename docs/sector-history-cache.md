# 板块历史缓存

板块轮动通过 `/api/cls-plate` 读取历史数据。接口首先读取现有 Supabase 项目的 `businessweb_sector_history`，仅在日期/涨停模式缺失或盘中快照过期时请求财联社，并写入验证后的原始 JSON（含 stock_list）。股票时间与请求日期不符时返回错误，不伪造历史数据。

已收盘快照（北京时间 15:15 后抓取的非空数据）长期复用；盘中及空数据缓存 30 秒。客户端保存本次会话的原始数据和视图，切回页面直接恢复，不立即请求；当前页面可见时每 30 秒只刷新最近有效日期，离开即取消计时与未完成请求。刷新失败保留原数据和原更新时间。

## 数据库启用

1. 在已有 BusinessWeb Supabase 项目的 SQL Editor 执行 `supabase/migrations/202610020004_sector_history.sql`。重复执行不会清空数据。
2. Vercel 服务端沿用已有 `SUPABASE_URL` 和 `SUPABASE_SECRET_KEY`。不使用任何 VITE_ 密钥。缓存表启用 RLS，anon/authenticated 无访问权限，仅服务端 service_role 读写。
3. 部署 main 后请求 `/api/cls-plate?date=20260930&up_limit=0`。首次 `X-Sector-Cache: stored`，重复请求应为 `database`，`X-Sector-Fetched-At` 保持原抓取时间。
4. 未配置或数据库不可用时仍可显示上游数据与本地缓存；接口明确返回 `unconfigured` / `unavailable`，页面提示未确认入库。

首次历史补齐仍需等待上游。数据库无法重建上游已经不提供的旧历史，日期校验失败的数据不会入库。未来交易日的历史将随首次成功请求逐步积累。

权限设计依据：[Supabase Data API security](https://supabase.com/docs/guides/api/securing-your-api)。
