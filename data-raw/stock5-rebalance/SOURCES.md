# stock5-rebalance 原始数据来源（预注册 v2 · Nasdaq）

- 下载时间 (UTC): 2026-11-21T15:13:06Z
- 下载方: manager（见 .manager-download.txt）
- fromdate: 2021-07-01；todate: 2026-11-21；limit: 9999
- 价格: api.nasdaq.com/.../historical（已拆股调整、未分红调整）
- 分红: api.nasdaq.com/.../dividends（仅用 type=Cash）
- 回测不读 crosscheck/；交叉核对结论照抄 manager

## 交叉核对（照抄 .manager-download.txt）

- 腾讯不复权: https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=us<SYMBOL>.OQ,day,2021-07-01,2026-11-21,2000, ；下载 2026-11-21T15:20Z
- 结果: 7 symbols × 1355 dates identical date sets；all closes within 0.2%（AVGO before 2024-07-15 compared as Tencent/10）；0 exceptions
- QQEW dividends: Nasdaq returned "Error while calling vendor" twice (15:13Z, 15:20Z)
- RKLB 在 2021-09-09、2025-01-21、2026-05-08 单日涨幅 >30%，两源一致；区间无 ±50% 单日变动

## AVGO 拆股

- 2024-07-15 一拆十；价格序列已按拆股调整；除息日早于该日的 Cash 分红金额在回测中 ÷10

## AVGO
- historical URL: https://api.nasdaq.com/api/quote/AVGO/historical?assetclass=stocks&fromdate=2021-07-01&todate=2026-11-21&limit=9999
- historical sha256: 0470980b4d807803de41d2b68d18df8549ff6da3f9c7b6c34c2e328f369b5a94
- historical 首末日期: 2021-07-01 → 2026-11-20
- historical 行数: 1355
- dividends URL: https://api.nasdaq.com/api/quote/AVGO/dividends?assetclass=stocks
- dividends sha256: 7ef22f85b53322e8fff75352090ef439a6aea43a6a76455f437bffaeefcf3a05
- dividends Cash 条数: 54

## MSFT
- historical URL: https://api.nasdaq.com/api/quote/MSFT/historical?assetclass=stocks&fromdate=2021-07-01&todate=2026-11-21&limit=9999
- historical sha256: 1c1e5b8248c945598baae6d7693c0a42611bf1a1e39a025a3860c0951fafdb88
- historical 首末日期: 2021-07-01 → 2026-11-20
- historical 行数: 1355
- dividends URL: https://api.nasdaq.com/api/quote/MSFT/dividends?assetclass=stocks
- dividends sha256: 68261c740e12461eb342b2e81d7c8e7ce2b1752b520f64c8e12811664dbf43a1
- dividends Cash 条数: 55

## META
- historical URL: https://api.nasdaq.com/api/quote/META/historical?assetclass=stocks&fromdate=2021-07-01&todate=2026-11-21&limit=9999
- historical sha256: 0ab068b5393da7ecb45fa84d8e4b585b84fe28e773d64c3d09bcfe6baa38de1a
- historical 首末日期: 2021-07-01 → 2026-11-20
- historical 行数: 1355
- dividends URL: https://api.nasdaq.com/api/quote/META/dividends?assetclass=stocks
- dividends sha256: 3f9403612f7e26ffddf1c95191f2b454c0b8257cbffd102d593518f60d26497d
- dividends Cash 条数: 11

## SOFI
- historical URL: https://api.nasdaq.com/api/quote/SOFI/historical?assetclass=stocks&fromdate=2021-07-01&todate=2026-11-21&limit=9999
- historical sha256: e85780058d4e65dc038403d62b2fb83fdd4d5d1a8c17ed5be099a913fc6bd975
- historical 首末日期: 2021-07-01 → 2026-11-20
- historical 行数: 1355
- dividends URL: https://api.nasdaq.com/api/quote/SOFI/dividends?assetclass=stocks
- dividends sha256: 2d0b7335d6da7bc87266849e6d466501ce824419b2d9cbfcd23fae2f36c06ea3
- dividends Cash 条数: 0

## RKLB
- historical URL: https://api.nasdaq.com/api/quote/RKLB/historical?assetclass=stocks&fromdate=2021-07-01&todate=2026-11-21&limit=9999
- historical sha256: 846a762357468df817ae7fd32814afeac039204e104df8b6003c9107bddd4040
- historical 首末日期: 2021-07-01 → 2026-11-20
- historical 行数: 1355
- dividends URL: https://api.nasdaq.com/api/quote/RKLB/dividends?assetclass=stocks
- dividends sha256: 2d0b7335d6da7bc87266849e6d466501ce824419b2d9cbfcd23fae2f36c06ea3
- dividends Cash 条数: 0

## QQQ
- historical URL: https://api.nasdaq.com/api/quote/QQQ/historical?assetclass=etf&fromdate=2021-07-01&todate=2026-11-21&limit=9999
- historical sha256: 8daacd4cbdb306a3ea5947eb4231d822850a489475e614924d46193e8ec13b6d
- historical 首末日期: 2021-07-01 → 2026-11-20
- historical 行数: 1355
- dividends URL: https://api.nasdaq.com/api/quote/QQQ/dividends?assetclass=etf
- dividends sha256: 6ed68a3e308ada901b0fe41e99cea5835cf68e23895b0fc4b527b0b3d190b68c
- dividends Cash 条数: 58

## QQEW
- historical URL: https://api.nasdaq.com/api/quote/QQEW/historical?assetclass=etf&fromdate=2021-07-01&todate=2026-11-21&limit=9999
- historical sha256: 185c50f83bafb5d2cfcec7146f35cad5f641118f480b02c096259f8362257b9e
- historical 首末日期: 2021-07-01 → 2026-11-20
- historical 行数: 1355
- dividends URL: https://api.nasdaq.com/api/quote/QQEW/dividends?assetclass=etf
- dividends sha256: a6d7e1533a5ecf640a7a8eac9789e7d43db61b7a9c6f1d07d133459e8cede41f
- dividends: data=null（Error while calling vendor）；回测仅用价格收益

