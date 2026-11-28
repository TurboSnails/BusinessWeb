# 数据来源：etf-timing-confirm（L-056 朋友 ETF「择时 + 只认金叉」2005–2010 确认检验）

2026-11-28 取数，供 `docs/research/etf-timing-confirm-2005-2026-11-28/`（DATA.md、count.mjs、PREREG.md）使用。原始响应放在 `raw/`，**只留本机**（`.gitignore` 已有 `data-raw/etf-timing-confirm/raw/`）。

- 取数脚本：`docs/research/etf-timing-confirm-2005-2026-11-28/fetch.mjs`（可重复运行；已有有效文件跳过）。
- 接口：中证指数官网公开接口，无需密钥；请求头只有通用 `User-Agent: Mozilla/5.0`，**没有发送任何个人信息**。
- 限速：每次请求间隔 4.5 秒；遇 403 / 非 JSON 停 180 秒重试一次，仍失败停整批。第一批 48 个请求（11:24–11:28 UTC），停 3 分钟后第二批 20 个（11:32–11:34 UTC），另 2 个核对请求（curl，间隔 5 秒）。**全程没有遇到 403**。
- 纪律：取数后只校验了行数、日期、缺口、与另两份取数的收盘是否一致；**没有计算任何收益、回撤**（例外见 ASSESS.md「已见信息」：调试时看到过 H00300 的几个收盘点位）。

## 接口与特性

- 日线：`GET https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode={code}&startDate=YYYYMMDD&endDate=YYYYMMDD`，`data[]` 含 tradeDate、open、high、low、close、成交量、成交额等（全收益指数只有有意义的 close）。
- 基础资料：`GET https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/{code}`：全称、基日 basicDate、**发布日 publishDate**、调样频率。
- **查询起始日假行**：每个查询都在 tradeDate = startDate 处多一行，收盘复制第一个真实交易日（本次起始日选周日 2004-11-28、周六 2010-12-25，便于识别；`perf-H00300-20080101-20080131.json` 用来记录 L-004 分段布局下 2008-01-01 的假行：收盘与 2008-01-02 相同）。`count.mjs` 按「tradeDate = 查询 startDate」剔除。
- **endDate 是否含当天不稳定**：`endDate=20101231` 只返回到 2010-12-30，`endDate=20080131` 只返回到 2008-01-30，而 `endDate=20151231` 返回到 2015-12-31（两个 probe 文件）。所以本次另取 2010-12-25 至 2011-01-05 一段补上 2010-12-31，2011 年的几行在本地截掉。L-004 / L-018 的分段终点（20071231、20111231、20151231、20191231、20231231）核对后没有漏掉交易日。
- 行数为 `close > 0` 的行数（含假行）；info 文件不是日线，行数记为「—」。

## 文件清单

| 文件 | URL | 取数时间（UTC） | HTTP | 行数 | 起 | 止 | SHA-256 |
|---|---|---|---|---:|---|---|---|
| `perf-000300-20041128-20101231.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=000300&startDate=20041128&endDate=20101231 | 2026-11-28T11:24:32 | 200 | 1482 | 20041128 | 20101230 | `07d5aee238ea9bd5f97de1969776cbf2b6c7446f6321864257372ac21fe6b6dd` |
| `perf-000922-20041128-20101231.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=000922&startDate=20041128&endDate=20101231 | 2026-11-28T11:24:40 | 200 | 1458 | 20041128 | 20101230 | `42c8f66734317c8a5ea3037850391e3e805965dd6c491906d9841da785d281fa` |
| `perf-H00300-20041128-20101231.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00300&startDate=20041128&endDate=20101231 | 2026-11-28T11:24:46 | 200 | 1458 | 20041128 | 20101230 | `cb89a21360912a800f413d8016f0a02d29c3225689551628089bade74a70460c` |
| `perf-H00905-20041128-20101231.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00905&startDate=20041128&endDate=20101231 | 2026-11-28T11:24:52 | 200 | 1458 | 20041128 | 20101230 | `2ca0b4658748cf0999324cd51e263bd84c1b8987c4b7f0cbdff6b5bb5c22023a` |
| `perf-H00852-20041128-20101231.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00852&startDate=20041128&endDate=20101231 | 2026-11-28T11:24:58 | 200 | 1458 | 20041128 | 20101230 | `6c7e79cdc5585386b99ae2af637da9eec739896ae7f74c1cac6a5ccf0e99bb38` |
| `perf-H00016-20041128-20101231.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00016&startDate=20041128&endDate=20101231 | 2026-11-28T11:25:05 | 200 | 1482 | 20041128 | 20101230 | `754e30ed5cef4cc2d94f1449eb380e3ac2b4207e689aa4a39b22cb70da019fac` |
| `perf-H00922-20041128-20101231.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00922&startDate=20041128&endDate=20101231 | 2026-11-28T11:25:11 | 200 | 1458 | 20041128 | 20101230 | `2ceee19252d1c02f0c40ae95059b37f38e0a876f70b71841da2bcf778b277aef` |
| `perf-H00986-20041128-20101231.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00986&startDate=20041128&endDate=20101231 | 2026-11-28T11:25:17 | 200 | 1458 | 20041128 | 20101230 | `bf4024eea6727b57db4f65ddf9c8807c163c158597b34fc0b8b2b1f00f1359fc` |
| `perf-H00987-20041128-20101231.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00987&startDate=20041128&endDate=20101231 | 2026-11-28T11:25:23 | 200 | 1458 | 20041128 | 20101230 | `5330ee4d5c6921976ff36328151e8e38645b0aef62aae164068f8859415bbf7c` |
| `perf-H00988-20041128-20101231.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00988&startDate=20041128&endDate=20101231 | 2026-11-28T11:25:29 | 200 | 1458 | 20041128 | 20101230 | `3c4a7ff7d2e1b603abf075913cdca370889b5ffea454058a11cd1b795bad5b38` |
| `perf-H00989-20041128-20101231.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00989&startDate=20041128&endDate=20101231 | 2026-11-28T11:25:36 | 200 | 1458 | 20041128 | 20101230 | `abda8e46893c1614b8f87cdc2ee49704793bd629c0f4d8988754aaeb481200d4` |
| `perf-H00990-20041128-20101231.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00990&startDate=20041128&endDate=20101231 | 2026-11-28T11:25:41 | 200 | 1458 | 20041128 | 20101230 | `d0f9ce389b62a4775c164ee9cd2cf1e6f6cdeaa71009586371c3768438aea3b2` |
| `perf-H00991-20041128-20101231.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00991&startDate=20041128&endDate=20101231 | 2026-11-28T11:25:47 | 200 | 1458 | 20041128 | 20101230 | `177077d77d4777cf4c3ab6625c343fd3c123da6096c0c44a4952713c4ce8f83c` |
| `perf-H00992-20041128-20101231.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00992&startDate=20041128&endDate=20101231 | 2026-11-28T11:25:53 | 200 | 1458 | 20041128 | 20101230 | `0e0346d788b2b3b1f893c1a2e2c9fbcc87cf9ea3c7912be9523f6ee60f7af140` |
| `perf-H00993-20041128-20101231.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00993&startDate=20041128&endDate=20101231 | 2026-11-28T11:25:59 | 200 | 1458 | 20041128 | 20101230 | `623d2700ed0dfbb0d48028f5ec0d3ae8d9b6b030dbc355fef80521c63cae6ab3` |
| `perf-H00994-20041128-20101231.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00994&startDate=20041128&endDate=20101231 | 2026-11-28T11:26:05 | 200 | 1458 | 20041128 | 20101230 | `bb4934844ad1cc74f5776a322c794742834e625fbbc1cf9a473fcf31f368ac55` |
| `perf-H00995-20041128-20101231.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00995&startDate=20041128&endDate=20101231 | 2026-11-28T11:26:12 | 200 | 1458 | 20041128 | 20101230 | `8f3a80f93ef616d984fd2efca94f0f38295340a8689494b2b8f0971dd82b5b29` |
| `perf-H00300-20080101-20080131.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00300&startDate=20080101&endDate=20080131 | 2026-11-28T11:26:18 | 200 | 22 | 20080101 | 20080130 | `6d08c25c0c1e545df7dc4c24887943000982c987d11890fa4157b2c07b14616c` |
| `info-H00300.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/H00300 | 2026-11-28T11:26:24 | 200 | — | — | — | `4a2c782da6c6465f7896c164e384135669c4a98c1f80ad0e8b4e11d4878099b7` |
| `info-H00905.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/H00905 | 2026-11-28T11:26:29 | 200 | — | — | — | `b1ac3733e668f0bb3c88f70f79ba66f0862703ce0fcad0438451220295a27395` |
| `info-H00852.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/H00852 | 2026-11-28T11:26:34 | 200 | — | — | — | `eb49812a83798407fcf1306bf4641edc7f0b12fab07ef0e916114f9b3e8c64b7` |
| `info-H00016.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/H00016 | 2026-11-28T11:26:39 | 200 | — | — | — | `e2052cd2fab60c0f5362b47b273aea0bed566bcb6dde5c8b6f298f2d73572914` |
| `info-H00922.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/H00922 | 2026-11-28T11:26:45 | 200 | — | — | — | `9698705a87b45a1a5aa6e50cd7f3dc9517f5e302e79b59aa7755bb0303dbe25e` |
| `info-H00986.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/H00986 | 2026-11-28T11:26:51 | 200 | — | — | — | `453f5e00e4ed0e9afb94219418e38a447ad9b299836ebc402d657bb7acefca77` |
| `info-H00987.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/H00987 | 2026-11-28T11:26:57 | 200 | — | — | — | `3b643494f5db0fb587459ac4f4b73a3825feee3655b9343f6fbb1561cf0c3c86` |
| `info-H00988.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/H00988 | 2026-11-28T11:27:03 | 200 | — | — | — | `17215ba31ed62b8d211557492af015b6534e99e16d77961b5d316c76fe5f9b10` |
| `info-H00989.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/H00989 | 2026-11-28T11:27:08 | 200 | — | — | — | `2ee75d1a42cd03814f10dec46e8f7d42796802329f744d3a6c7710f08b135b3e` |
| `info-H00990.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/H00990 | 2026-11-28T11:27:15 | 200 | — | — | — | `c2d342c9abc3ebfe07b42275c0af7cd91bd156c4aad0acf48839477d072858c4` |
| `info-H00991.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/H00991 | 2026-11-28T11:27:21 | 200 | — | — | — | `4dd060cbb476e2b8eccd03373e6f0f255f1ce994ff357a831779169130a17d50` |
| `info-H00992.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/H00992 | 2026-11-28T11:27:26 | 200 | — | — | — | `c0160a1304f075bdca0e04258e0acac6c729ec6a5fb6a16a23178b2f2734a298` |
| `info-H00993.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/H00993 | 2026-11-28T11:27:31 | 200 | — | — | — | `c8a1e1ace8e174867541860515d77dea03925a0a0a1770fcd08a45e525a9a5a0` |
| `info-H00994.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/H00994 | 2026-11-28T11:27:37 | 200 | — | — | — | `034eec23c98f3a76803332e46c9717273cfb31a9319b8218e87f01ee3ebe6131` |
| `info-H00995.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/H00995 | 2026-11-28T11:27:42 | 200 | — | — | — | `d0b8e30bcdfb5f7f23d979a2c7c47fb9528c991a65ac90d794a573a4e9919550` |
| `info-000300.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/000300 | 2026-11-28T11:27:48 | 200 | — | — | — | `89cbd0812e258757ccca68285181d280b22881f1e95e4fb524ddea64bd159fb6` |
| `info-000905.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/000905 | 2026-11-28T11:27:53 | 200 | — | — | — | `29bbc5ab7081e7c50efbac91062224810b908ead05448316b96e6441c77a2efb` |
| `info-000852.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/000852 | 2026-11-28T11:27:59 | 200 | — | — | — | `18e1fc5248b260f09d8b06e4ac838bbefdc17ef55907f37413ccd07366eef6a6` |
| `info-000016.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/000016 | 2026-11-28T11:28:04 | 200 | — | — | — | `44bd88a3dc069ab09206ceca301a362db8ab2dab3529d2cd498369081e22b88b` |
| `info-000922.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/000922 | 2026-11-28T11:28:10 | 200 | — | — | — | `437049bcdc8f4317a6566e79d6b9806939612977c5e9fbd30030cb0673fa7090` |
| `info-000986.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/000986 | 2026-11-28T11:28:15 | 200 | — | — | — | `c629bbf4eaf19e7c514493fdbc2ed59b86a20d76c32d608cb8ad9a8b24d6522d` |
| `info-000987.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/000987 | 2026-11-28T11:28:21 | 200 | — | — | — | `f2e75486c857f2b9a6873dbd2145e22418f1ac14e5449452a89da3cf7c04a30f` |
| `info-000988.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/000988 | 2026-11-28T11:28:27 | 200 | — | — | — | `7a04d9924400ced9267d2b99a14a28f37fd084c2e44e173d42a67165f78d0aad` |
| `info-000989.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/000989 | 2026-11-28T11:28:32 | 200 | — | — | — | `de35db82d81f55e95ea9e67176dd0fd296d5e594a1dd747ddbdb8bf14af60ad6` |
| `info-000990.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/000990 | 2026-11-28T11:28:38 | 200 | — | — | — | `0782d25d81e26bde8aea23b8ad8ea14e20826065df29635c57ea993082b8f90c` |
| `info-000991.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/000991 | 2026-11-28T11:28:44 | 200 | — | — | — | `3dae0c6cff9e51fb02d1b11b1ac073747157e22e71fad094c9c9b35dfd64dc77` |
| `info-000992.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/000992 | 2026-11-28T11:28:50 | 200 | — | — | — | `0dfb45ca1f7a12deafabee3bc2283795ab9f45def4175903f5f9153f61d82dbe` |
| `info-000993.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/000993 | 2026-11-28T11:28:56 | 200 | — | — | — | `ee2a8e28e1e9e71cbd56ce4b8e0369a0c2264c827530420fb84a24598b21ccfc` |
| `info-000994.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/000994 | 2026-11-28T11:29:02 | 200 | — | — | — | `912e01e408e0f6268c2ebee2a214519f421320ad86bd7d19195060f93083c7e2` |
| `info-000995.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/000995 | 2026-11-28T11:29:07 | 200 | — | — | — | `a5b1323a3d11fa9f7a1b458562488cfdfe4d29b0c1ad525c889ae1b21529aa85` |
| `perf-000300-20101225-20110105.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=000300&startDate=20101225&endDate=20110105 | 2026-11-28T11:32:16 | 200 | 7 | 20101225 | 20110104 | `7efbe43c4f33090b0f89d2ea955331e134b51df5ce2c76b41f28e57f70a0eaf4` |
| `perf-000922-20101225-20110105.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=000922&startDate=20101225&endDate=20110105 | 2026-11-28T11:32:22 | 200 | 7 | 20101225 | 20110104 | `c46c220223e639020d4dd0e3e26cea9fbd08edca415f7cf5bc6d63eb0421f5cd` |
| `perf-H00300-20101225-20110105.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00300&startDate=20101225&endDate=20110105 | 2026-11-28T11:32:28 | 200 | 7 | 20101225 | 20110104 | `3b357cbc5faacc5fac9211bed03fc2197acfdd3bafa8b0ca258e5b55b01cbfd3` |
| `perf-H00905-20101225-20110105.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00905&startDate=20101225&endDate=20110105 | 2026-11-28T11:32:33 | 200 | 7 | 20101225 | 20110104 | `643e3caf8b5bd46b8403c39b630c791f186b9028e6d8c5b7c4bba34db287ef29` |
| `perf-H00852-20101225-20110105.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00852&startDate=20101225&endDate=20110105 | 2026-11-28T11:32:39 | 200 | 7 | 20101225 | 20110104 | `69c1af9082ea7d22b29c68b50a6ccb549deb244f7015ca2bd22d112dd53ead91` |
| `perf-H00016-20101225-20110105.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00016&startDate=20101225&endDate=20110105 | 2026-11-28T11:32:45 | 200 | 7 | 20101225 | 20110104 | `d088c88fe9e3afc9e7117ce3d3619a3c2f0746c622b57cc4d15b845abca95ff4` |
| `perf-H00922-20101225-20110105.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00922&startDate=20101225&endDate=20110105 | 2026-11-28T11:32:52 | 200 | 7 | 20101225 | 20110104 | `629ab2d1ca50c5cf35627a28fb4eb79f698af0335e12a3cafa100c2ba3e456fb` |
| `perf-H00986-20101225-20110105.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00986&startDate=20101225&endDate=20110105 | 2026-11-28T11:32:58 | 200 | 7 | 20101225 | 20110104 | `bd39306fdaadc0ec083e3456623502635b389d7f97d6573dac058acccbdc8c77` |
| `perf-H00987-20101225-20110105.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00987&startDate=20101225&endDate=20110105 | 2026-11-28T11:33:04 | 200 | 7 | 20101225 | 20110104 | `79a443b026ba3f467cff4c7d11454b7b450345f9e50ab16ba9e2eff935397bd5` |
| `perf-H00988-20101225-20110105.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00988&startDate=20101225&endDate=20110105 | 2026-11-28T11:33:10 | 200 | 7 | 20101225 | 20110104 | `d637f23dd037c22b53b2056c06e63803776103ce886d72e4f2b885cf02ca6782` |
| `perf-H00989-20101225-20110105.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00989&startDate=20101225&endDate=20110105 | 2026-11-28T11:33:16 | 200 | 7 | 20101225 | 20110104 | `47d59d3c247dbad95cb1e462e0ac444fe871af7c255c37954dcffcea5c7bc4ae` |
| `perf-H00990-20101225-20110105.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00990&startDate=20101225&endDate=20110105 | 2026-11-28T11:33:21 | 200 | 7 | 20101225 | 20110104 | `f17a3f0965e3096e69d382cb072c9077456580349ffa0fa5553167a72c7211d8` |
| `perf-H00991-20101225-20110105.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00991&startDate=20101225&endDate=20110105 | 2026-11-28T11:33:27 | 200 | 7 | 20101225 | 20110104 | `e704723f76b809488d837e823f4da20f6e3c5bb95797786a757c76a85431e567` |
| `perf-H00992-20101225-20110105.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00992&startDate=20101225&endDate=20110105 | 2026-11-28T11:33:33 | 200 | 7 | 20101225 | 20110104 | `c556452ccda6ff12a82eef59c186d54226ad55fe0d599c0bf95f5d010b8a18da` |
| `perf-H00993-20101225-20110105.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00993&startDate=20101225&endDate=20110105 | 2026-11-28T11:33:39 | 200 | 7 | 20101225 | 20110104 | `00cddc0c14963886254e98bac42ee12f6f2664887affe352e9ae794d5af02d3f` |
| `perf-H00994-20101225-20110105.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00994&startDate=20101225&endDate=20110105 | 2026-11-28T11:33:45 | 200 | 7 | 20101225 | 20110104 | `70907015c225a944fbb10f8f2949457401d944f5e87d0b58ed062f2ab0136d33` |
| `perf-H00995-20101225-20110105.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00995&startDate=20101225&endDate=20110105 | 2026-11-28T11:33:51 | 200 | 7 | 20101225 | 20110104 | `fb27ee3df6c763423206f6a64b327ebdb2219fca12287e6ecb582a1133478ffb` |
| `perf-000015-20041128-20101231.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=000015&startDate=20041128&endDate=20101231 | 2026-11-28T11:33:57 | 200 | 1458 | 20041128 | 20101230 | `20354e48b750ad5ff33e6c14e8110a7673c5d98c2e2a2621b8d853c36a36aacf` |
| `perf-000015-20101225-20110105.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=000015&startDate=20101225&endDate=20110105 | 2026-11-28T11:34:03 | 200 | 7 | 20101225 | 20110104 | `b7dfa11e9aebf8d19f4825c558f5d5115da6c31872f4be73ec9692208d844fb7` |
| `info-000015.json` | https://www.csindex.com.cn/csindex-home/indexInfo/index-basic-info/000015 | 2026-11-28T11:34:09 | 200 | — | — | — | `d8bd2d1adcdf619a9d137ed1ef1f9af3f565563673a646b923d522d74e4f6d69` |
| `probe-H00300-20151201-20151231.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00300&startDate=20151201&endDate=20151231 | 2026-11-28T11:36:34 | 200 | 23 | 20151201 | 20151231 | `3ae6d58fb8c4f5e4b4dafdd0b4db9a5eb5c4ece9d5dd08caa74cadfc796e980f` |
| `probe-H00300-20101201-20101231.json` | https://www.csindex.com.cn/csindex-home/perf/index-perf?indexCode=H00300&startDate=20101201&endDate=20101231 | 2026-11-28T11:36:34 | 200 | 22 | 20101201 | 20101230 | `a87997e1933f5706cd022af2376d2c6e5bfb11eaf57af00d7b9f81db0ec34763` |

`manifest.json`（同目录）记录了每个文件的 URL、时间、字节数、行数与 SHA-256，与上表一致。

## 本地复用的其他来源（未新取）

| 文件 | 来源 | 用途 |
|---|---|---|
| `docs/research/etf-volume-2026-11-25/inputs.json`（SHA-256 `3f1836349d6a1566e58c85f9d5c987514db71c9ea2f83d7b909bbbf83294e8e5`，提交 b5e05180） | 中证官网，2026-11-25 L-018 取数（含 2004 年起全史，与 L-004 同一分段布局） | ① 逐日核对 15 个全收益指数与 000300、000922 的 2005–2010 收盘：1457 个共同交易日，**0 天不一致**；② L-004 布局敏感性（PREREG v2 第 1 条，含 2004-01-01 / 2008-01-01 假行与 H00016、000300 的 2004 年数据）；③ 功效分析只用其中 2011-01-01 以后的部分（`power.mjs` 断言） |
| `data-raw/lowvol-core-cn/raw/em-1.000300.json`、`em-1.000922.json` | 东方财富价格版日线，2026-11-28 lowvol-core-cn 取数 | 独立第二来源核对交易日历与收盘：000300 2005-01-04 起 1457 天全部对上（最大相对差 1.2e-5）；000922 东财 2008-08-04 才有，588 天全部对上 |

## v2 补充（2026-11-28，按 REVIEW-1）

### L-004 / L-018 分段终点逐个核对（建议 21）

L-004 `bt-index.mjs` 与 L-018 `fetch.mjs` 都按 `startDate=YYYY0101&endDate=(YYYY+3)1231` 分段。方法：拿 L-018 `inputs.json` 的 000300 日期，与东方财富 000300 价格版日线（`data-raw/lowvol-core-cn/raw/em-1.000300.json`）在每个分段终点附近逐日比对。

| 分段终点 | 东财该年最后两个交易日 | inputs.json 是否有 | 结论 |
|---|---|---|---|
| 2007-12-31 | 2007-12-27、12-28 | 12-29 / 30 / 31 都没有，东财也没有（交易所元旦休市） | 不漏 |
| 2011-12-31（周六） | 2011-12-29、12-30 | 两天都有 | 不漏 |
| 2015-12-31 | 2015-12-30、12-31 | 两天都有 | 不漏（该次 endDate 含当天） |
| 2019-12-31 | 2019-12-30、12-31 | 两天都有 | 不漏 |
| 2023-12-31（周日） | 2023-12-28、12-29 | 都有 | 不漏 |

另：inputs.json 的 15 个全收益序列与 000922 在 **2018-06-18（端午节休市）多一行**，000300 价格版没有这一行。按 L-004 代码由 `ratioTiming` 跳过、沿用前一日择时状态。只影响 2011 年以后（功效分析照此处理），不影响 2005–2010。

### 现金计息敏感性用的存款利率（必改 12）

`docs/research/etf-timing-confirm-2005-2026-11-28/cash-rates.json`（SHA-256 `3f012682a9a131d0b702d3c32d80aa8e080f409a2ee7ee059d70d7318dcfb79b`）：人民银行一年期定期存款基准利率，2004-10-29 起共 14 档（2.25 → 4.14 → 2.25 → 2.75%）。每一档都和国家统计局《中国统计年鉴》的「金融机构法定存款利率」表逐个核对过，原页存于 `raw/`（2026-11-28 用 curl 取，`User-Agent: Mozilla/5.0`，间隔 5 秒，没有发送任何个人信息）：

| 文件 | URL | 内容 | SHA-256 |
|---|---|---|---|
| `stats-ndsj2006-T2010C.htm` | https://www.stats.gov.cn/sj/ndsj/2006/html/T2010C.HTM | 2004.10.29 一年期 2.25 | `e37f876e6f28a6396ad9654d2b2c41e3d181d27c2a80d3d48990d8229b893e99` |
| `stats-ndsj2008-T1908C.htm` | https://www.stats.gov.cn/sj/ndsj/2008/html/T1908C.HTM | 2006.08.19 至 2007.12.21 共 7 档 | `6e6ea6e4ced06905dee4d9d67c3a345dc943b80668c349d8b87e912f1a38abc3` |
| `stats-ndsj2012-T1905C.htm` | https://www.stats.gov.cn/sj/ndsj/2012/html/T1905C.HTM | 2008.10.09 至 2011.07.07 共 9 档 | `288515acf4616fe6e7207e3c04e181c5fb53af468f3465e9069959390e570621` |

（另取过 2008 年鉴 T1909C / T1910C、2009 年鉴 T1905C / T1909C / T1910C 等几页，用来找表号，内容是贷款利率、外汇储备等，没有用上，也没有留存。）

### 冻结的清洗后输入（必改 10）

`docs/research/etf-timing-confirm-2005-2026-11-28/inputs-clean.json`：由 `count.mjs` 从 `raw/` 确定性生成，18 个序列（15 个全收益 + 000300 + 000922 + 000015），按代码排序，每行 `[date, close]`，2004-12-31 至 2010-12-31，各 1,458 行，不含时间戳。SHA-256 `353b80a5b6f2b8c0091608b89149b2abfa5a53a70eb94054a8ed06a8fbd34cb0`。同样的数据早已在仓库的 L-018 inputs.json 里，提交它不会带来新的泄露。
