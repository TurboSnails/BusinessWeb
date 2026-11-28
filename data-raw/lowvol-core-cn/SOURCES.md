# 数据来源：lowvol-core-cn（A 股防守核心立项调研）

2026-11-28 取数，供 `docs/research/lowvol-core-cn-2026-11-28/SCOPE.md` 使用。原始响应放在 `raw/`，**只留本机**（`raw/` 尚未写进 .gitignore，需要 manager 补一行 `data-raw/lowvol-core-cn/raw/`）。全部是公开、无需密钥的接口，没有发送任何个人信息；请求间隔：中证 1.5 秒（被 WAF 拦截后改为 4 秒并在 403 时暂停 3 分钟），东财 2–2.5 秒。

**范围说明（纪律）**：候选指数只取了基日起约一年的「首段」和 2026-11 的「末段」，用来核对覆盖起止；宽基（000300、000906、000985 及全收益版）取了全史，用于数回撤段。没有计算任何候选的收益、波动或回撤。

## 1. 中证指数官网（主来源）

- 基础资料：`GET https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/{code}`（基日、发布日、调样频率、编制说明）。
- 日线：`GET https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode={code}&startDate=YYYYMMDD&endDate=YYYYMMDD`，返回 `data[]`：tradeDate、open、high、low、close、成交量、成交额、样本数等。
- 接口特性：① 会在查询起始日补一行（tradeDate = startDate，收盘价复制第一个真实交易日），拼接时要剔除；下表「起」列包含这一行，所以显示的是查询起始日。② 000300 价格版还给出基日（2004-12-31）之前的 2004 年数据，计数时从基日起算。③ WAF：连续约 50 个请求后返回 403（HTML 页面，标题 405）。首轮失败的请求已由 `retry-csi.py` 补取，manifest 中的时间是成功那次的时间。
- 行数为 `close > 0` 的行数（含补的那一行）。info 文件不是日线，行数记为「—」。

| 文件 | URL | 取数时间（UTC） | HTTP | 行数 | 起 | 止 | SHA-256 |
|---|---|---|---|---:|---|---|---|
| `info-H30269.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/H30269 | 2026-11-28T07:53:08 | 200 | — | — | — | `29dd754660990be5ffac7f021f3e353b46b6b138f46682b1256a687087c5e0ca` |
| `info-H20269.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/H20269 | 2026-11-28T07:53:10 | 200 | — | — | — | `a37341fcaa89583c21b326aa71b021fb8c2c4a91ef0e713c9c479cbedcc18b18` |
| `info-930955.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/930955 | 2026-11-28T07:53:13 | 200 | — | — | — | `3d6ace35dcecbf4ef7ce57eb7d73042905a59438b6a0277bd97ef4268be1d2de` |
| `info-H20955.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/H20955 | 2026-11-28T07:53:15 | 200 | — | — | — | `be721a9c6336068b83dea3f95977abd6174bb199ba497065dc7f65dcf3831f54` |
| `info-930740.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/930740 | 2026-11-28T07:53:17 | 200 | — | — | — | `d89d27d04fbf3239f332c0d72d25dc15acfbc03b871fc506ea2f076a0d6e453e` |
| `info-H20740.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/H20740 | 2026-11-28T07:53:19 | 200 | — | — | — | `2e6f4aa102557a292b0f7f55f85beb7c0011896e23cb969c95a0d6af32a8bd1e` |
| `info-930782.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/930782 | 2026-11-28T07:53:21 | 200 | — | — | — | `65a0075a1fa48064916ab96b4a5670e421ac79780afd649923de8585e6e06e17` |
| `info-H20782.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/H20782 | 2026-11-28T07:53:23 | 200 | — | — | — | `3d95820bedb1a818e16c2be9394d4c482287627eca65f4b4d7e0b087629540e5` |
| `info-930846.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/930846 | 2026-11-28T07:53:25 | 200 | — | — | — | `059cac8d28bed62ae9adbf42e382f045b2ec9acdd55affb44e46df475d7e7ed9` |
| `info-H20846.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/H20846 | 2026-11-28T07:53:27 | 200 | — | — | — | `53527d3b00a69c5d47157a264aa6efd1d307cc00cc3e42a4e29807d32d956e44` |
| `info-000803.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/000803 | 2026-11-28T07:53:29 | 200 | — | — | — | `a56bb48958246bcaa98f276f68f2165a3b9e5a41a7fd15afc3e22ebe906ffc88` |
| `info-H00803.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/H00803 | 2026-11-28T07:53:31 | 200 | — | — | — | `c656f80103faa6dcccc354d5d108009b151202d8eecd834c865cb797ad499b00` |
| `info-000804.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/000804 | 2026-11-28T07:53:32 | 200 | — | — | — | `5ee6daa0eefcda6e9045552d6f9fbc9010502aa029c1a08fb840646aa558f7a3` |
| `info-H00804.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/H00804 | 2026-11-28T07:53:34 | 200 | — | — | — | `f2bd339fa01fa96b10b277e955a06a57c4fbf7d1e77f788f4a04ec3aa286688a` |
| `info-000922.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/000922 | 2026-11-28T07:53:36 | 200 | — | — | — | `437049bcdc8f4317a6566e79d6b9806939612977c5e9fbd30030cb0673fa7090` |
| `info-H00922.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/H00922 | 2026-11-28T08:11:29 | 200 | — | — | — | `9698705a87b45a1a5aa6e50cd7f3dc9517f5e302e79b59aa7755bb0303dbe25e` |
| `info-000015.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/000015 | 2026-11-28T08:11:34 | 200 | — | — | — | `d8bd2d1adcdf619a9d137ed1ef1f9af3f565563673a646b923d522d74e4f6d69` |
| `info-H00015.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/H00015 | 2026-11-28T08:11:40 | 200 | — | — | — | `de61407d40174d5748cc3cb1b5ddb6ecfb426ae483f3392dc1d10e5ff7baba5f` |
| `info-932833.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/932833 | 2026-11-28T08:11:45 | 200 | — | — | — | `6e6380b720ca5908302c075c1d0452f64079a982cbed9432e13b06fefcde7eef` |
| `info-932834.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/932834 | 2026-11-28T08:11:50 | 200 | — | — | — | `2cd07cb37f51224a665c8400776cf0e8c8d68c2bd80b84fee30a0cab45f7ca12` |
| `info-932835.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/932835 | 2026-11-28T08:11:56 | 200 | — | — | — | `079226b0c33bc5fc15b682f4fa863d0a96e38e66ccfa191a71f4a7fc2d92d932` |
| `info-931446.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/931446 | 2026-11-28T08:12:01 | 200 | — | — | — | `4ced112ab962619ed07b2cd9638496ef6d7da39cf8d990ace5cf31685d801e85` |
| `info-000300.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/000300 | 2026-11-28T08:12:08 | 200 | — | — | — | `89cbd0812e258757ccca68285181d280b22881f1e95e4fb524ddea64bd159fb6` |
| `info-H00300.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/H00300 | 2026-11-28T08:12:14 | 200 | — | — | — | `4a2c782da6c6465f7896c164e384135669c4a98c1f80ad0e8b4e11d4878099b7` |
| `info-000906.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/000906 | 2026-11-28T08:12:21 | 200 | — | — | — | `1e49eff6bdccda98fa090db0b8987178bd4e799dfbcc842e2f695289ebb9ffd5` |
| `info-H00906.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/H00906 | 2026-11-28T08:12:29 | 200 | — | — | — | `9d61703e8d54941ef27c5805bece09c5665623462d69893d8d30a5038c834b3d` |
| `info-000985.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/000985 | 2026-11-28T08:12:34 | 200 | — | — | — | `687e6211137694255502faed2c9d117ed935e0a808de01892d6bef9bf26df495` |
| `info-H00985.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/H00985 | 2026-11-28T08:12:40 | 200 | — | — | — | `b6a18ad78cc5e11c067c5220c8c6d8ac6444553825b33484cb755da678d3d6b9` |
| `perf-H30269-head-2004-2006.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H30269&startDate=20041201&endDate=20061231 | 2026-11-28T07:56:26 | 200 | 242 | 2004-12-01 | 2006-12-29 | `c1b384c7f49f5e26c07091af6d837c2e0a07c73161d4ca084485279f7dddbb68` |
| `perf-H30269-tail-2026-11.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H30269&startDate=20261101&endDate=20261128 | 2026-11-28T07:56:28 | 200 | 21 | 2026-11-01 | 2026-11-27 | `a23d0d764af255fead6df383e43d2c3046a2852bb91b1f427e1989e391f315de` |
| `perf-H20269-head-2004-2006.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H20269&startDate=20041201&endDate=20061231 | 2026-11-28T07:56:30 | 200 | 243 | 2004-12-01 | 2006-12-29 | `90ea886784876c95759ec721e2cd5f09e62c7afed69b0f24fa309d7fcf2b7155` |
| `perf-H20269-tail-2026-11.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H20269&startDate=20261101&endDate=20261128 | 2026-11-28T07:56:32 | 200 | 21 | 2026-11-01 | 2026-11-27 | `65aeae30b21fc320188da08da40d91a9d33999e6d7e546896bf87eb7e8c1afc3` |
| `perf-930955-head-2004-2006.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=930955&startDate=20041201&endDate=20061231 | 2026-11-28T07:56:34 | 200 | 242 | 2004-12-01 | 2006-12-29 | `ef83cf1ccced2957146e13452c3a3e72bf284d0936ca77179f58aaa4a5ec4905` |
| `perf-930955-tail-2026-11.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=930955&startDate=20261101&endDate=20261128 | 2026-11-28T07:56:36 | 200 | 21 | 2026-11-01 | 2026-11-27 | `cda817588cfe08ee983ce810bde177085ca7d46336d1520f6a446171b84b2ae2` |
| `perf-H20955-head-2004-2006.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H20955&startDate=20041201&endDate=20061231 | 2026-11-28T07:56:38 | 200 | 243 | 2004-12-01 | 2006-12-29 | `2278f2ae0e9bb01af63f4ff01bdc2d8ff34c54d7d241da3dd0f0415608653db0` |
| `perf-H20955-tail-2026-11.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H20955&startDate=20261101&endDate=20261128 | 2026-11-28T07:56:40 | 200 | 21 | 2026-11-01 | 2026-11-27 | `ea63a40a643a8050f364d4023ebac66f44ad41ec1f15a09a8e18ca1ebf2c78e9` |
| `perf-930740-head-2004-2006.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=930740&startDate=20041201&endDate=20061231 | 2026-11-28T07:56:43 | 200 | 485 | 2004-12-01 | 2006-12-29 | `b5aa69cce5d79ed6341b10b435b5414f6c06fc0df8f72716b20cce1bd724aa8e` |
| `perf-930740-tail-2026-11.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=930740&startDate=20261101&endDate=20261128 | 2026-11-28T07:56:45 | 200 | 21 | 2026-11-01 | 2026-11-27 | `b2739b802625446e496f797a25dcff182ed20ee77857dd10af3a6e2c79237b1a` |
| `perf-H20740-head-2004-2006.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H20740&startDate=20041201&endDate=20061231 | 2026-11-28T07:56:47 | 200 | 485 | 2004-12-01 | 2006-12-29 | `ee2cfd96647f2c8ae368cab64cec9c83190f3074b742b057a23e6e3261860706` |
| `perf-H20740-tail-2026-11.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H20740&startDate=20261101&endDate=20261128 | 2026-11-28T07:56:48 | 200 | 21 | 2026-11-01 | 2026-11-27 | `24d361c18591f0612a15ae707747d193ff7d93fdfca4c931d5872fe3474148d1` |
| `perf-930782-head-2004-2006.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=930782&startDate=20041201&endDate=20061231 | 2026-11-28T07:56:51 | 200 | 484 | 2004-12-01 | 2006-12-29 | `4997fc2175e5b5d391ed859b5b2ad97c03529a06a1fdcc292caa7333ca030450` |
| `perf-930782-tail-2026-11.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=930782&startDate=20261101&endDate=20261128 | 2026-11-28T08:12:48 | 200 | 21 | 2026-11-01 | 2026-11-27 | `fd3371ecbd7148a29635298df17c3551360b693d205264ddabba242303e789a5` |
| `perf-H20782-head-2004-2006.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H20782&startDate=20041201&endDate=20061231 | 2026-11-28T08:13:02 | 200 | 485 | 2004-12-01 | 2006-12-29 | `074e74cc9c65f932b6d241c1408c965777d6d7f2c71aa1369c85a6a76c5857ee` |
| `perf-H20782-tail-2026-11.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H20782&startDate=20261101&endDate=20261128 | 2026-11-28T08:13:09 | 200 | 21 | 2026-11-01 | 2026-11-27 | `98e4e38c0f9d3263e19463fa589e083f61492a8a5eb4dc5231b7799fb50f3edc` |
| `perf-930846-head-2004-2006.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=930846&startDate=20041201&endDate=20061231 | 2026-11-28T08:13:21 | 200 | 484 | 2004-12-01 | 2006-12-29 | `986f3cdfc2d83a469d5f5359d352df6b2c14ef1e11c1caa77c73b6e326bc95eb` |
| `perf-930846-tail-2026-11.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=930846&startDate=20261101&endDate=20261128 | 2026-11-28T08:13:29 | 200 | 21 | 2026-11-01 | 2026-11-27 | `eb513d46ec0043a2eb378795b3823fdaef714ca8a614388d73d393fd36650113` |
| `perf-H20846-head-2004-2006.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H20846&startDate=20041201&endDate=20061231 | 2026-11-28T08:13:46 | 200 | 485 | 2004-12-01 | 2006-12-29 | `5f848e947e7ca1363842a609749935581ce5e92ec64fcae2484f7db50274abb1` |
| `perf-H20846-tail-2026-11.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H20846&startDate=20261101&endDate=20261128 | 2026-11-28T08:13:52 | 200 | 21 | 2026-11-01 | 2026-11-27 | `3d405f534ff7ff03838145d281f9d8786df32681a9545ba7b10485e563aaef83` |
| `perf-000803-head-2004-2006.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=000803&startDate=20041201&endDate=20061231 | 2026-11-28T08:14:02 | 200 | 485 | 2004-12-01 | 2006-12-29 | `fa73f03b75a3e46de13109c595ba614bb7557aa09a7e82576d14804582cbdbf1` |
| `perf-000803-tail-2026-11.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=000803&startDate=20261101&endDate=20261128 | 2026-11-28T08:14:09 | 200 | 21 | 2026-11-01 | 2026-11-27 | `0a463db98bcf7386eb4b2aab0da64b8d5fbf180b217ec4eb799ec1c4bf81804b` |
| `perf-H00803-head-2004-2006.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00803&startDate=20041201&endDate=20061231 | 2026-11-28T08:14:22 | 200 | 485 | 2004-12-01 | 2006-12-29 | `abf9caf2b1a0590c4f44f28e60a709c7ec0c09b5261536599014ff917a806753` |
| `perf-H00803-tail-2026-11.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00803&startDate=20261101&endDate=20261128 | 2026-11-28T08:14:31 | 200 | 21 | 2026-11-01 | 2026-11-27 | `b3c6b2b004a6d3ec67fa3d19e6c8138dd29a1944d85f8c894348da591995d0b6` |
| `perf-000804-head-2004-2006.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=000804&startDate=20041201&endDate=20061231 | 2026-11-28T08:14:42 | 200 | 485 | 2004-12-01 | 2006-12-29 | `e0785a928fa46533319402ee243fb5e07db6f9dc9d6b9b9dba28cd203b62d372` |
| `perf-000804-tail-2026-11.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=000804&startDate=20261101&endDate=20261128 | 2026-11-28T08:14:48 | 200 | 21 | 2026-11-01 | 2026-11-27 | `55779b1fe52c4e48d82ba20d5f9cb6f28b67d698064f7d97eb5461d32805d7cb` |
| `perf-H00804-head-2004-2006.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00804&startDate=20041201&endDate=20061231 | 2026-11-28T08:14:56 | 200 | 485 | 2004-12-01 | 2006-12-29 | `1a8dc2a8abfbfb888acbedbdeada6ee401595d965fb91df9c46547949ede23d8` |
| `perf-H00804-tail-2026-11.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00804&startDate=20261101&endDate=20261128 | 2026-11-28T08:15:04 | 200 | 21 | 2026-11-01 | 2026-11-27 | `e6c76f44048fe89458c052a5fbf4ba80c9d71d26d79eaedc8229d3ea91dd1e49` |
| `perf-000922-head-2004-2006.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=000922&startDate=20041201&endDate=20061231 | 2026-11-28T08:15:18 | 200 | 485 | 2004-12-01 | 2006-12-29 | `db6b4acd622b36db91c955bbb20f41b8b87c35c37290d1e2d045eea69837f9df` |
| `perf-000922-tail-2026-11.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=000922&startDate=20261101&endDate=20261128 | 2026-11-28T08:15:24 | 200 | 21 | 2026-11-01 | 2026-11-27 | `a1803e8b406b19aa317e691d0dfc98d58c1bd52081693676cf23b1dd0a944851` |
| `perf-H00922-head-2004-2006.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00922&startDate=20041201&endDate=20061231 | 2026-11-28T08:15:38 | 200 | 485 | 2004-12-01 | 2006-12-29 | `c9a8c6aa4ababe4ab2c0046348ee4d66927320b1cfbc688920d50b4b6eb2f831` |
| `perf-H00922-tail-2026-11.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00922&startDate=20261101&endDate=20261128 | 2026-11-28T08:15:45 | 200 | 21 | 2026-11-01 | 2026-11-27 | `8e4af8e81fa134ed28d677a577837ccb610c97654bec3bf8989c11260d720a74` |
| `perf-000015-head-2004-2006.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=000015&startDate=20041201&endDate=20061231 | 2026-11-28T08:15:57 | 200 | 485 | 2004-12-01 | 2006-12-29 | `520dece8ab1a23e2cc9db89e948b26307883999186d768f2eec1fbe97e12792e` |
| `perf-000015-tail-2026-11.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=000015&startDate=20261101&endDate=20261128 | 2026-11-28T08:16:03 | 200 | 21 | 2026-11-01 | 2026-11-27 | `486560748fc1499f13562ae4230c10543ea8dc09f0c79223d7d80dbc15098ddd` |
| `perf-H00015-head-2004-2006.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00015&startDate=20041201&endDate=20061231 | 2026-11-28T08:16:17 | 200 | 485 | 2004-12-01 | 2006-12-29 | `e91ec75577f74c078056124b5f00c30d71fafe0ef04b995c8175388b3d81ca5d` |
| `perf-H00015-tail-2026-11.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00015&startDate=20261101&endDate=20261128 | 2026-11-28T08:16:24 | 200 | 21 | 2026-11-01 | 2026-11-27 | `64cc706740c2470151dabbafb03289cec8c8d12f1e5c549046cd15b9e7d1772d` |
| `perf-932833-head-2012-2013.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=932833&startDate=20121201&endDate=20131231 | 2026-11-28T08:16:31 | 200 | 240 | 2012-12-01 | 2013-12-31 | `030238b6ab8afe0861036a00e76d2603f5ba603e0e6e729ba5e808758117970f` |
| `perf-932833-tail-2026-11.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=932833&startDate=20261101&endDate=20261128 | 2026-11-28T08:16:38 | 200 | 21 | 2026-11-01 | 2026-11-27 | `ee3b351254c830380cf58b3b3b4219869eeae973890d59f5152e26f76fb439aa` |
| `perf-932834-head-2012-2013.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=932834&startDate=20121201&endDate=20131231 | 2026-11-28T08:16:46 | 200 | 240 | 2012-12-01 | 2013-12-31 | `6fa16973475164e41f9791e87a7deedaaa7134c3aaa79d004f38b054620b2cc5` |
| `perf-932834-tail-2026-11.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=932834&startDate=20261101&endDate=20261128 | 2026-11-28T08:16:54 | 200 | 21 | 2026-11-01 | 2026-11-27 | `9f6ec1046298cc567e01e863bea69c1e41ebb43d304fa9bd2d0e3efaa02941f6` |
| `perf-932835-head-2012-2013.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=932835&startDate=20121201&endDate=20131231 | 2026-11-28T08:17:02 | 200 | 240 | 2012-12-01 | 2013-12-31 | `8b618fb19574f09a19d833b654504bdcc4829d50d6c5f985c7434e03601d724d` |
| `perf-932835-tail-2026-11.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=932835&startDate=20261101&endDate=20261128 | 2026-11-28T08:17:07 | 200 | 21 | 2026-11-01 | 2026-11-27 | `382bf3311c6e9bdf5ca6a80d56272cc62991ed2b1c03324dd883aba796d259a9` |
| `perf-931446-head-2009-2010.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=931446&startDate=20091201&endDate=20101231 | 2026-11-28T08:17:13 | 200 | 242 | 2009-12-01 | 2010-12-30 | `1a305edc9f2d5701995ba3c561fc85eedc129431650906cdb47d7953a42774fb` |
| `perf-931446-tail-2026-11.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=931446&startDate=20261101&endDate=20261128 | 2026-11-28T08:17:20 | 200 | 21 | 2026-11-01 | 2026-11-27 | `f0749d37b381efa68d920f8a0eeeb243c0abeb33c9e8d7457d66c5618dbc5baa` |
| `perf-000300-full-2004.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=000300&startDate=20040101&endDate=20071231 | 2026-11-28T08:17:52 | 200 | 969 | 2004-01-01 | 2007-12-28 | `6f02832754501d2cbdb0b0f04cb66c1d6524dc7215bf03e31d5be931c9eb5c57` |
| `perf-000300-full-2008.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=000300&startDate=20080101&endDate=20111231 | 2026-11-28T08:18:10 | 200 | 977 | 2008-01-01 | 2011-12-30 | `f1cf524df77701e7ac16bbee875e216c5c45900099f2a21f9f07ae1d9ca39f4d` |
| `perf-000300-full-2012.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=000300&startDate=20120101&endDate=20151231 | 2026-11-28T08:18:28 | 200 | 971 | 2012-01-01 | 2015-12-31 | `c634c762a7838eb0e0bc03408a61b30f4dc60af072c2384b1dc3ef46a56e8c76` |
| `perf-000300-full-2016.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=000300&startDate=20160101&endDate=20191231 | 2026-11-28T08:18:54 | 200 | 976 | 2016-01-01 | 2019-12-31 | `25f31f7ef15de78fb193e61b9f6958fffc47cfef061fc6fc907ce6097dbff3a7` |
| `perf-000300-full-2020.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=000300&startDate=20200101&endDate=20231231 | 2026-11-28T08:19:06 | 200 | 971 | 2020-01-01 | 2023-12-29 | `d92c4d49acbbb708eb9a988f35dfce3b5a41ec4ff51a27ce7e415405be3fb5d8` |
| `perf-000300-full-2024.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=000300&startDate=20240101&endDate=20261231 | 2026-11-28T08:19:22 | 200 | 704 | 2024-01-01 | 2026-11-27 | `01e94b677f5237d1322fb09e006547b5a0050363fa3324d05c475065deee9d2a` |
| `perf-H00300-full-2004.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00300&startDate=20040101&endDate=20071231 | 2026-11-28T08:19:45 | 200 | 727 | 2004-01-01 | 2007-12-28 | `dfbf3a602b63c8a633715158a9afec48a7591ca2aa99bf8b065f7336dc122332` |
| `perf-H00300-full-2008.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00300&startDate=20080101&endDate=20111231 | 2026-11-28T08:20:13 | 200 | 977 | 2008-01-01 | 2011-12-30 | `9fc4f5b67de0d175513d6117e2da8ea1ca948332fdd7a51962eca0ad61aad647` |
| `perf-H00300-full-2012.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00300&startDate=20120101&endDate=20151231 | 2026-11-28T08:20:23 | 200 | 971 | 2012-01-01 | 2015-12-31 | `7e4810933d851a23899370568f8827ba38f909448fc42efbe120a527e8e16e61` |
| `perf-H00300-full-2016.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00300&startDate=20160101&endDate=20191231 | 2026-11-28T08:20:45 | 200 | 977 | 2016-01-01 | 2019-12-31 | `c8d62d4a86b4d6b1af66bb7a4af251db09b59926d02f7d79ee3e02d0fd4e5f36` |
| `perf-H00300-full-2020.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00300&startDate=20200101&endDate=20231231 | 2026-11-28T08:21:09 | 200 | 971 | 2020-01-01 | 2023-12-29 | `b74ddbe385712e0bf1d2e405fda346d39a74286546f3a4b1b6d4135089db6571` |
| `perf-H00300-full-2024.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00300&startDate=20240101&endDate=20261231 | 2026-11-28T08:51:12 | 200 | 704 | 2024-01-01 | 2026-11-27 | `6f3621aa96136a201ab32aa49c258f589cfeb5a4da5ec4bef6d0c78048a93f41` |
| `perf-000906-full-2004.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=000906&startDate=20040101&endDate=20071231 | 2026-11-28T08:22:07 | 200 | 727 | 2004-01-01 | 2007-12-28 | `8f5bb0e30fb5cb8223e070d5ac2ba9944e7f7de68e2e22d1251e621b5e85aebd` |
| `perf-000906-full-2008.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=000906&startDate=20080101&endDate=20111231 | 2026-11-28T08:22:32 | 200 | 977 | 2008-01-01 | 2011-12-30 | `047e00043ff849aa019208fcf43f9445dc0f06a7a25c1fc37ee4cac59b6d5c5c` |
| `perf-000906-full-2012.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=000906&startDate=20120101&endDate=20151231 | 2026-11-28T08:23:04 | 200 | 971 | 2012-01-01 | 2015-12-31 | `8bf4675befe15c2c198c44647994c6ad46a894e45e2accad6f08d312cd989186` |
| `perf-000906-full-2016.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=000906&startDate=20160101&endDate=20191231 | 2026-11-28T08:23:33 | 200 | 977 | 2016-01-01 | 2019-12-31 | `854f58293564f12df306759d8a5b531855cf67e4bfbadc6bb06b148ec1b40a66` |
| `perf-000906-full-2020.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=000906&startDate=20200101&endDate=20231231 | 2026-11-28T08:51:18 | 200 | 971 | 2020-01-01 | 2023-12-29 | `68a1a8f1812989bb899b53760f8c2e95c554fcee58e6ca1227328e5365b3b7b3` |
| `perf-000906-full-2024.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=000906&startDate=20240101&endDate=20261231 | 2026-11-28T08:24:23 | 200 | 704 | 2024-01-01 | 2026-11-27 | `3b3af975efb157117961f373fc96bef476d1ea56989f83c0503f4967d0b32258` |
| `perf-H00906-full-2004.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00906&startDate=20040101&endDate=20071231 | 2026-11-28T08:51:26 | 200 | 727 | 2004-01-01 | 2007-12-28 | `91b38d4f1faec8bf17ac1c679a1b7dab93a03be2707ccf545d0efc7cdfb41cfb` |
| `perf-H00906-full-2008.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00906&startDate=20080101&endDate=20111231 | 2026-11-28T08:25:29 | 200 | 977 | 2008-01-01 | 2011-12-30 | `9daef6448d62d9d495d59ba8953e3481ef64381e3aab9374ea25b0376615ce9e` |
| `perf-H00906-full-2012.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00906&startDate=20120101&endDate=20151231 | 2026-11-28T08:51:34 | 200 | 971 | 2012-01-01 | 2015-12-31 | `e03b8f66682ecae2e6a470ef7aafa66d01410e28da8c52885b24cb30ebc0b6c4` |
| `perf-H00906-full-2016.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00906&startDate=20160101&endDate=20191231 | 2026-11-28T08:51:45 | 200 | 977 | 2016-01-01 | 2019-12-31 | `7e440ad86d22dc5dcfed01c1e756dffbf0326c7b519914abf881b9b1b5ab11c7` |
| `perf-H00906-full-2020.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00906&startDate=20200101&endDate=20231231 | 2026-11-28T08:52:00 | 200 | 971 | 2020-01-01 | 2023-12-29 | `0e415f5fec6742af637551793d5972a58fdf761d40a0ff9e58eb0a42035e2b2e` |
| `perf-H00906-full-2024.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00906&startDate=20240101&endDate=20261231 | 2026-11-28T08:52:08 | 200 | 704 | 2024-01-01 | 2026-11-27 | `66853b7961ddb744d297bf92e839dc5052798522d28c35c8ef96432050f5acca` |
| `perf-000985-full-2004.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=000985&startDate=20040101&endDate=20071231 | 2026-11-28T08:52:16 | 200 | 727 | 2004-01-01 | 2007-12-28 | `3e453ebb9aecd33b6fe2ba33100641eeb67a8b00ed60b58fb7c36ac6c3d90acf` |
| `perf-000985-full-2008.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=000985&startDate=20080101&endDate=20111231 | 2026-11-28T08:52:32 | 200 | 977 | 2008-01-01 | 2011-12-30 | `4174ac47ee88058754f6510f83a09d05101b528c2215eedef02a25f87e3308a2` |
| `perf-000985-full-2012.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=000985&startDate=20120101&endDate=20151231 | 2026-11-28T08:52:49 | 200 | 971 | 2012-01-01 | 2015-12-31 | `339fc8f2517f4fd27b0fcff681a8114b6d4e20423d7ccae3a703c23aff3da992` |
| `perf-000985-full-2016.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=000985&startDate=20160101&endDate=20191231 | 2026-11-28T08:53:00 | 200 | 977 | 2016-01-01 | 2019-12-31 | `5bed2b0ab541c4e904288e19a440959a8aa2522c441fcb3017a6a0c9e72537ff` |
| `perf-000985-full-2020.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=000985&startDate=20200101&endDate=20231231 | 2026-11-28T08:53:12 | 200 | 971 | 2020-01-01 | 2023-12-29 | `f5085fb43a4fa81c92268c7eb3b555d2e74cbca27fee055ce66a84e426ee5d1d` |
| `perf-000985-full-2024.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=000985&startDate=20240101&endDate=20261231 | 2026-11-28T08:53:20 | 200 | 704 | 2024-01-01 | 2026-11-27 | `16934e835e7461371994b6b0cf92d373fd88ff15bb62681ea42ee3879645a0fa` |
| `perf-H00985-full-2004.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00985&startDate=20040101&endDate=20071231 | 2026-11-28T08:53:31 | 200 | 727 | 2004-01-01 | 2007-12-28 | `30acdda7af9382391909c1133f20cb511fa5cc333f18f04560550dbdc670c8d8` |
| `perf-H00985-full-2008.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00985&startDate=20080101&endDate=20111231 | 2026-11-28T08:53:49 | 200 | 977 | 2008-01-01 | 2011-12-30 | `1d2c4775bdc4f5bfcbd8fb99c92c2d9311e2b19adaa52435a3c7be49efee6602` |
| `perf-H00985-full-2012.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00985&startDate=20120101&endDate=20151231 | 2026-11-28T08:54:00 | 200 | 971 | 2012-01-01 | 2015-12-31 | `f2a844cacb4b08465b1097582deae0192cd5606bddd151dd1312bdd540e203b6` |
| `perf-H00985-full-2016.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00985&startDate=20160101&endDate=20191231 | 2026-11-28T08:54:23 | 200 | 977 | 2016-01-01 | 2019-12-31 | `fad36a9a62b61b979f07cf09f0ff6a0b709e817ba17cdaeb3db5a9f6d6c71aa6` |
| `perf-H00985-full-2020.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00985&startDate=20200101&endDate=20231231 | 2026-11-28T08:54:52 | 200 | 971 | 2020-01-01 | 2023-12-29 | `66ac9370f24cd3d283d35cde375c316b994e1a6d6adb646b67b5a07bd144fc7a` |
| `perf-H00985-full-2024.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00985&startDate=20240101&endDate=20261231 | 2026-11-28T08:55:03 | 200 | 704 | 2024-01-01 | 2026-11-27 | `698355c03e099a46b43de2f57863184d29be04f03a53685efd9b843bc31b8f96` |

## 2. 中证成分与权重文件（oss-ch.csindex.com.cn）

| 文件 | URL | 取数时间（无 Z 的为本机时间 UTC+4） | 字节 | SHA-256 |
|---|---|---|---:|---|
| `closeweight-000300.xls` | https://oss-ch.csindex.com.cn/static/html/csindex/public/uploads/file/autofile/closeweight/000300closeweight.xls | 2026-11-28T12:14:09 | 72192 | `e5d80f178df11853c751029b3069790d4dcd0ae5cf6e15110a0ce87e1e1aaf38` |
| `closeweight-000922.xls` | https://oss-ch.csindex.com.cn/static/html/csindex/public/uploads/file/autofile/closeweight/000922closeweight.xls | 2026-11-28T12:13:56 | 26624 | `265003feccf1c9e080bbce33033f54da2eca6d6c35f2d03b2cf3e28313f2609e` |
| `closeweight-930740.xls` | https://oss-ch.csindex.com.cn/static/html/csindex/public/uploads/file/autofile/closeweight/930740closeweight.xls | 2026-11-28T12:13:48 | 15360 | `5909d27a67435500363cfc65e1d20ec0ae6a5a2357aab299b9880d4c44e78b5d` |
| `closeweight-930955.xls` | https://oss-ch.csindex.com.cn/static/html/csindex/public/uploads/file/autofile/closeweight/930955closeweight.xls | 2026-11-28T12:13:42 | 26624 | `00a310fee7e5ac6c65ca5a02bfd62f0c9877ca2f27cffd652863285616aa7c78` |
| `closeweight-H30269.xls` | https://oss-ch.csindex.com.cn/static/html/csindex/public/uploads/file/autofile/closeweight/H30269closeweight.xls | 2026-11-28T12:13:31 | 15360 | `7e04b2355e13af1f7cd0885b963ec37160778313f07983e1fc4f2189b9254ef7` |
| `cons-H30269.xls` | https://oss-ch.csindex.com.cn/static/html/csindex/public/uploads/file/autofile/cons/H30269cons.xls | 2026-11-28T12:14:35 | 14336 | `43e0baa02f300ff5c1f8c230b1f8091cdb0386ce5dafe4a3752548ce6965e357` |
| `info-N00300.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/N00300 | 2026-11-28T08:56:55Z | 792 | `4704404d5298fe0c7020cf6acbcc5ab395d11daae4e9eea25c586a7042ea1ca5` |
| `csi-stock-industry-20261030.json` | https://www.csindex.com.cn/csindex-home/dataServer/queryCsiPeSecurity?tradeDate=20261030&classType=2 | 2026-11-28T08:57:48Z | 1855147 | `b75a867f25fcb56076ebc098c84afd71c09e3efc9d752779ee60c5d3c080717e` |

权重文件日期 2026-10-30（月末），成分文件日期 2026-11-27；均无行业字段。行业用 `csi-stock-industry-20261030.json`（中证行业分类 CICS，2026-10-30，5,577 只）匹配。`info-N00300.json` 是沪深 300 净收益指数的基础资料（基日 2004-12-31，发布 2013-02-08）；红利低波净收益版按 N30269、N20269 查询返回空。

## 3. 东方财富指数 K 线（价格版，只用于核对发布后覆盖）

参数：`klt=101`（日线）、`fqt=0`、`fields2=f51,f53`（日期、收盘）、`beg=19900101`、`end=20500101`。secid 前缀：1 = 上交所代码，2 = 中证专属代码。

| 文件 | URL | 取数时间（UTC） | HTTP | 名称 | 行数 | 起 | 止 | SHA-256 |
|---|---|---|---|---|---:|---|---|---|
| `em-2.H30269.json` | https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=2.H30269&fields1=f1,f2,f3&fields2=f51,f53&klt=101&fqt=0&beg=19900101&end=20500101 | 2026-11-28T08:01:51 | 200 | 红利低波 | 3146 | 2013-12-19 | 2026-11-27 | `60aba46b7b242fe8426059390e301508c7846ca949172c2d360d4c8b80cdb39f` |
| `em-2.930955.json` | https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=2.930955&fields1=f1,f2,f3&fields2=f51,f53&klt=101&fqt=0&beg=19900101&end=20500101 | 2026-11-28T08:01:54 | 200 | 红利低波100 | 1652 | 2020-02-10 | 2026-11-27 | `f181487c09d1966950b32437272d15b81a65888802738e04b8e1fa39148287b6` |
| `em-2.930740.json` | https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=2.930740&fields1=f1,f2,f3&fields2=f51,f53&klt=101&fqt=0&beg=19900101&end=20500101 | 2026-11-28T08:01:59 | 200 | 300红利低波 | 1936 | 2018-12-04 | 2026-11-27 | `e87cc14710d958e00173b115479cb5c9d5822f45691ca8c6d6e98991da737ba2` |
| `em-2.930782.json` | https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=2.930782&fields1=f1,f2,f3&fields2=f51,f53&klt=101&fqt=0&beg=19900101&end=20500101 | 2026-11-28T08:02:02 | 200 | 500SNLV | 5319 | 2005-01-04 | 2026-11-27 | `63ab525d995c0d98504e7e6cc5325c67fb1ad6b352ee6cf06416caf2879a7879` |
| `em-2.930846.json` | https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=2.930846&fields1=f1,f2,f3&fields2=f51,f53&klt=101&fqt=0&beg=19900101&end=20500101 | 2026-11-28T08:02:05 | 200 | （无数据） | 0 | — | — | `147ac5a0b209904ed002dbacf724fc917f90e0dd40f727e234ef40fdf105098a` |
| `em-1.000803.json` | https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=1.000803&fields1=f1,f2,f3&fields2=f51,f53&klt=101&fqt=0&beg=19900101&end=20500101 | 2026-11-28T08:02:08 | 200 | （无数据） | 0 | — | — | `a63b390af5d020687dfe824545d4f556cff972b520c21e359f3ac572a38f36ad` |
| `em-1.000804.json` | https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=1.000804&fields1=f1,f2,f3&fields2=f51,f53&klt=101&fqt=0&beg=19900101&end=20500101 | 2026-11-28T08:02:11 | 200 | （无数据） | 0 | — | — | `a63b390af5d020687dfe824545d4f556cff972b520c21e359f3ac572a38f36ad` |
| `em-1.000922.json` | https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=1.000922&fields1=f1,f2,f3&fields2=f51,f53&klt=101&fqt=0&beg=19900101&end=20500101 | 2026-11-28T08:02:15 | 200 | 中证红利 | 4450 | 2008-08-04 | 2026-11-27 | `d5d80e36ec52ecf442bec17b727c7dd784799c52006c1b83784865f58a14bcc0` |
| `em-1.000015.json` | https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=1.000015&fields1=f1,f2,f3&fields2=f51,f53&klt=101&fqt=0&beg=19900101&end=20500101 | 2026-11-28T08:02:20 | 200 | 红利指数 | 5319 | 2005-01-04 | 2026-11-27 | `491e6956bdc02c36647c60f90a3c3520b5418300c50cb22e0a64f4d930eba93b` |
| `em-1.000300.json` | https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=1.000300&fields1=f1,f2,f3&fields2=f51,f53&klt=101&fqt=0&beg=19900101&end=20500101 | 2026-11-28T08:02:23 | 200 | 沪深300 | 5319 | 2005-01-04 | 2026-11-27 | `4a4b12c984616361adf6dea6d9f76a7974ca7509286a035104b48c9d91d6324b` |
| `em-1.000906.json` | https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=1.000906&fields1=f1,f2,f3&fields2=f51,f53&klt=101&fqt=0&beg=19900101&end=20500101 | 2026-11-28T08:02:27 | 200 | 中证800 | 4825 | 2007-01-15 | 2026-11-27 | `c29326daf7a0e54810b702e4f686ac7a61faf3a05220cc28dafb08a74d2911dc` |
| `em-1.000985.json` | https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=1.000985&fields1=f1,f2,f3&fields2=f51,f53&klt=101&fqt=0&beg=19900101&end=20500101 | 2026-11-28T08:02:30 | 200 | 中证全指 | 3721 | 2011-08-02 | 2026-11-27 | `bfd0889de81b67ed32b69441263e69510620c51b468460bef4a930c3d2363dad` |
| `em-2.932834.json` | https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=2.932834&fields1=f1,f2,f3&fields2=f51,f53&klt=101&fqt=0&beg=19900101&end=20500101 | 2026-11-28T08:02:33 | 200 | （无数据） | 0 | — | — | `c39ecb63306eb20e9092fd7e8c551692563bf552cf7b961b79c689a95ab9b2c6` |

## 4. ETF 基本资料与费率（东财）

- 资料：`GET https://fundmobapi.eastmoney.com/FundMNewApi/FundMNNBasicInformation?FCODE={code}&deviceid=Wap&plat=Wap&product=EFund&version=6.5.5`，只保留成立日、跟踪指数、规模、基金公司；**接口返回的夏普、波动、最大回撤字段已丢弃，不存**（`raw/etf-meta.json`）。
- 费率：`GET https://fundf10.eastmoney.com/jjfl_{code}.html`，解析「管理费率」「托管费率」。
- 这两个请求用 curl 发出（node fetch 连不上 fundmobapi 主机）。

| 代码 | 名称 | 跟踪指数 | 成立日 | 管理费 | 托管费 | 规模日期 | 资料接口 SHA-256 | 费率页 SHA-256 | 取数时间（本机 UTC+4） |
|---|---|---|---|---|---|---|---|---|---|
| 512890 | 红利低波ETF华泰柏瑞 | H30269 | 2018-12-19 | 0.50%（每年） | 0.10%（每年） | 2026-09-30 | `5f214231a6acffe2…` | `7ed19bd950edf5c7…` | 2026-11-28T12:09:00 |
| 563020 | 红利低波ETF易方达 | H30269 | 2023-12-06 | 0.15%（每年） | 0.05%（每年） | 2026-09-30 | `c4069af6f87d8211…` | `1ea09606230d2366…` | 2026-11-28T12:09:07 |
| 515100 | 红利低波100ETF景顺 | 930955 | 2020-05-22 | 0.50%（每年） | 0.10%（每年） | 2026-09-30 | `598c4ce5e9100e54…` | `f9d275fc30a342d9…` | 2026-11-28T12:09:17 |
| 515480 | 红利低波100ETF南方 | 930955 | 2026-06-26 | 0.15%（每年） | 0.05%（每年） | 2026-09-30 | `7c2eeaf102c84016…` | `f6170827b1225550…` | 2026-11-28T12:09:27 |
| 515300 | 300红利低波ETF嘉实 | 930740 | 2019-08-08 | 0.50%（每年） | 0.10%（每年） | 2026-09-30 | `5adb104aa6ff9541…` | `c91c418981d80225…` | 2026-11-28T12:09:35 |
| 512260 | 中证500低波动ETF华安 | 930782 | 2018-11-30 | 0.50%（每年） | 0.10%（每年） | 2026-09-30 | `42e073303f667e22…` | `f7f9eb160385ccda…` | 2026-11-28T12:09:42 |
| 515080 | 中证红利ETF招商 | 000922 | 2019-11-28 | 0.20%（每年） | 0.10%（每年） | 2026-09-30 | `cdb9c2f1220b4d24…` | `21b3b9414e017d79…` | 2026-11-28T12:09:52 |
| 515180 | 红利ETF易方达 | 000922 | 2019-11-26 | 0.15%（每年） | 0.05%（每年） | 2026-09-30 | `9ee2cc6166acb992…` | `03a504e246c59be7…` | 2026-11-28T12:10:06 |
| 510880 | 红利ETF华泰柏瑞 | 000015 | 2006-11-17 | 0.50%（每年） | 0.10%（每年） | 2026-09-30 | `ec3fe85568ccc0c1…` | `1325d24bb3f05cf7…` | 2026-11-28T12:10:13 |
| 090010 | 大成中证红利指数A | 000922 | 2010-02-02 | 0.75%（每年） | 0.15%（每年） | 2026-09-30 | `ea7c71cd984bccc6…` | `36887925c4652a0f…` | 2026-11-28T12:10:23 |
| 510300 | 沪深300ETF华泰柏瑞 | 000300 | 2012-05-04 | 0.15%（每年） | 0.05%（每年） | 2026-09-30 | `c6791fb1e61e1ac5…` | `6caff77759c1c041…` | 2026-11-28T12:10:32 |
| 159919 | 沪深300ETF嘉实 | 000300 | 2012-05-07 | 0.15%（每年） | 0.05%（每年） | 2026-09-30 | `f2e76cde43e202a4…` | `f189fa39e0030512…` | 2026-11-28T12:10:42 |
| 515800 | 中证800ETF汇添富 | 000906 | 2019-10-08 | 0.15%（每年） | 0.05%（每年） | 2026-09-30 | `66dfbc9b04536a07…` | `e7e332f57ad72b1c…` | 2026-11-28T12:10:50 |
| 159800 | 中证800ETF鹏华 | 000906 | 2024-06-27 | 0.50%（每年） | 0.10%（每年） | 2026-09-30 | `a51cc26235b77164…` | `3aba439975733684…` | 2026-11-28T12:10:58 |

`raw/etf-meta.json` SHA-256：`450ee64a109cdf61ce460140a04ad7fabb792ef11f5123be70dcdf5be4ecefa4`；`raw/manifest.json` SHA-256：`fde2feda4104ed9c697acbbe8351359e7da0eb694f5894eed0f8a3c56ae7192c`；`raw/manifest-em.json` SHA-256：`56226988636e2acf95233d8a6eb78c98c2eeca1d53bc3dd070cc05c6b5f24738`。

## 5. 仓库内已有、本研究会引用的数据（未重新下载）

| 数据 | 文件 | 说明 |
|---|---|---|
| 中国 10 年期国债收益率 | `public/data/cn-market-data.json` → `series.cnTenYear` | 中债 historyQuery，2002 年起；由 `scripts/cn-market-data.mjs` 维护 |
| ETF 跟踪指数缓存 | `data-raw/kpl-plates/etf-index.json` | 东财基金资料，用于列出跟踪 H30269 / 930955 / 000922 的全部 ETF |

## 6. 复现

脚本在 `docs/research/lowvol-core-cn-2026-11-28/`：`fetch-csi.mjs`、`retry-csi.py`、`fetch-em.mjs`、`fetch-etf.sh`（调用 `parse-etf.py`），计数用 `count.py`。
