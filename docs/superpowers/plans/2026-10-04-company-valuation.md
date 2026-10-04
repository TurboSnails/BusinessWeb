# 公司估值工作台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 推荐本会话直接执行；执行方式待用户选择。

**Goal:** 输入公司名称/代码，选择本机CLI与具体模型版本，自动采集资料并生成可复算的六方法估值报告。

**Architecture:** React页面调用独立本地Node服务，服务通过固定CLI适配器执行分析。财务快照、AI假设、纯函数计算及最终报告分离；复用现有公司目录和研究入口，不改历史报告数据。

**Tech Stack:** React 18、TypeScript、Vite、Node 24、Vitest、node:test；HTTP/SSE和子进程使用Node内建模块。服务实现为ESM `.mjs`，领域与计算使用TypeScript并加入独立类型检查。

**Spec:** [2026-10-04-company-valuation-design.md](../specs/2026-10-04-company-valuation-design.md)

## Global Constraints

- 首版支持Pi、Codex、Claude、OpenCode；Gemini标记未支持。
- 本地服务监听127.0.0.1，默认8788；一次只运行一个任务。
- 任务10分钟、数据请求15秒、CLI启动30秒；缺失值为null，不能以0代替。
- 实际CLI凭据留在本机；shell=false，固定命令与参数数组，不使用跳过全部权限的开关。
- 财务金额、币种、期间、来源明确；模型ID原样传入，不可用时不静默回退。
- 不部署、不创建云账号、不覆盖已有行情/热力图修改。

## Review Focus

- 同一公司在多个市场上市及ADR比例：要求选择正确证券，不能共享错误股本。任务3验证。
- CLI缓存模型列表包含无权限版本：可选择已发现模型，执行失败明确提示且不回退。任务2、5验证。
- 模型回答包含合法JSON但伪造来源：拒绝不属于冻结快照的来源ID。任务6验证。
- 浏览器刷新、SSE重连与重复取消：终态不变，事件可恢复，任务不重复启动。任务7、8验证。
- 报告升级或浏览器存储满：旧报告不崩溃，保存失败仍能导出当前报告。任务9验证。

## 文件与接口边界

- `src/features/valuation/types.ts`：共享领域类型；`validation.ts`：快照/假设/报告校验。
- `src/features/valuation/calculations/{multiples,dcf,scenarios}.ts`：估值公式；`index.ts`公共入口。
- `server/valuation/{cli,models,data,analysis,jobs,http}.mjs`：各自子目录实现与入口隔离；测试使用同目录`.test.mjs`。
- `src/services/valuationApi.ts`：HTTP/SSE客户端。
- `src/pages/Valuation.tsx`、`src/components/valuation/`：输入、模型选择、进度、结果、参数与敏感性。
- `src/features/valuation/storage.ts`：保存/导入导出。
- 修改`src/App.tsx`、`src/components/Header.tsx`、`src/pages/CompanyDetail.tsx`添加入口；修改`vite.config.js`、`package.json`和类型检查配置以启动/验证新增模块。

类型约定：`SecurityIdentity={market:'cn'|'hk'|'us',code,name,quoteCurrency,exchange,issuerId?,adrRatio?}`；`FinancialFact={value:number|null,unit,currency,periodStart,periodEnd,basis,sourceId,retrievedAt,status}`；`FinancialSnapshot={schemaVersion:1,security,asOf,facts,sources,peers,missing}`。facts使用命名字段，禁止无类型金额散落在文本中。

`ModelOption={backend,provider,modelId,displayName,version:null|string,isDefault,discoverySource,discoveredAt,availability,capabilities}`；`ValuationAssumptions={schemaVersion:1,security,valuationDate,scenarios,methodSuitability,analysis}`；`ValuationReport={schemaVersion:1,snapshot,assumptions,results,backend,requestedModelId,resolvedModelId,cliVersion,createdAt}`。各方法参数用discriminated union，三情景键固定为bear/base/bull，不以任意字符串互相引用。

### Task 1: 建立可复算的相对估值合同

**Files:** 创建`src/features/valuation/types.ts`、`validation.ts`、`calculations/multiples.ts`、`index.ts`及`calculations/multiples.test.ts`；新增`tsconfig.valuation.json`并修改`package.json`类型检查命令。

**Interfaces:** `calculateMultiple(input: MultipleInput): MethodResult`；`validateSnapshot(value: unknown): ValidationResult<FinancialSnapshot>`；结果区分calculated/notApplicable/missingData/invalidInput，错误含字段和原因。

- [ ] 写失败测试：EPS=2、目标PE=20得到40；40倍PE/40%增长得到PEG=1；目标PEG=1、40%增长、EPS=2得到80；营收1000、PS=2、股本100得到20；BVPS=10、PB=0.8得到8。
- [ ] 运行`npm test -- --run src/features/valuation/calculations/multiples.test.ts`，确认失败来自缺少实现。
- [ ] 实现类型、校验及公式；负EPS/增长≤0/净资产≤0不适用；股本0、NaN、Infinity拒绝，缺失值不可计算。目标年份统一，远期价格与折现到今日价格分列。
- [ ] 运行同一测试及`npx tsc --noEmit -p tsconfig.valuation.json`，全部通过。
- [ ] 仅暂存本任务文件并提交`feat(valuation): add validated relative valuation calculations`。

### Task 2: 发现CLI与模型版本

**Files:** 创建`server/valuation/cli/{registry,process}.mjs`、`server/valuation/models/{index,pi,opencode,codex,claude}.mjs`及`models.test.mjs`。

**Interfaces:** `discoverBackends(): Promise<BackendInfo[]>`；`listModels(backend, {refresh,signal}): Promise<ModelOption[]>`；`spawnCli(backend,args,{cwd,input,signal}): CliProcess`，CLI入口固定为pi/codex/claude/opencode。

- [ ] 写失败测试：假PATH仅有codex时仅它标记安装；模型ID/版本/别名保留；目录已发现模型为discovered而非verified；失效缓存刷新报错；配置中的密钥绝不返回。
- [ ] 运行`node --test server/valuation/models.test.mjs`确认失败。
- [ ] 先验证每个本机CLI的help及公开模型发现接口；Pi用RPC可用列表，OpenCode用模型列举命令；Codex/Claude仅读取确实存在的公开目录或配置，缺少发现能力返回默认项+手填能力。缓存60秒，刷新强制重新发现；发现不发起推理。进程抽象注入，测试不用真实账号。
- [ ] 运行同一测试；手工运行发现接口，记录本机实际CLI版本及各后端可发现模型数量，不输出凭据。
- [ ] 提交`feat(valuation): discover local CLI backends and model versions`。

### Task 3: 证券识别与身份校验

**Files:** 创建`server/valuation/data/{identity,search}.mjs`、`identity.test.mjs`；读取现有`src/data/companies.ts`及市场目录，保留独立适配边界。

**Interfaces:** `searchCompanies(query,{signal}): Promise<SecurityIdentity[]>`；`validateSecurity(input): SecurityIdentity`。

- [ ] 写失败测试：腾讯/00700、贵州茅台/600519、Apple/AAPL解析；多交易所及ADR返回多个候选；00700保留前导零；未命中返回空数组；代码与市场不匹配拒绝。
- [ ] 运行`node --test server/valuation/identity.test.mjs`确认失败。
- [ ] 实现名称/代码规范化、本地目录精确与前缀检索、受限上游证券搜索；只提供候选，不由AI猜代码。后续财务查询只接收已验证证券身份。
- [ ] 运行同一测试并手工核对上述三个市场候选证券。
- [ ] 提交`feat(valuation): resolve company names to securities`。

### Task 4: 自动财务采集与冻结快照

**Files:** 创建`server/valuation/data/{index,aktools,yahoo,sec,normalize}.mjs`、`data.test.mjs`、脱敏真实响应fixtures及`docs/valuation-data-sources.md`。

**Interfaces:** `collectSnapshot(security,{asOf,signal}): Promise<FinancialSnapshot>`；`normalizeFinancials(raw,security): FinancialSnapshot`。读取Task1领域字段合同，不将所有上游字段透传。

- [ ] 查看AkShare/AKTools、Yahoo及SEC官方文档并探测实际响应，记录接口、字段、期间、单位、限制及来源URL；用三市场真实响应建立fixtures。A/H优先AKTools，不可用返回明确缺失；美股Yahoo配SEC核对。SEC设置有意义的User-Agent和限速。禁止任意URL代理。
- [ ] 写失败测试：累计季度用年报+本期−同期形成TTM；重复季度不相加；亿元换基础单位；少数权益排除；外币缺汇率不估每股价格；ADR股本换算；上游超时返回缺失，其他成功字段保留；同行无数据不造中位数。
- [ ] 运行`node --test server/valuation/data.test.mjs`确认失败。
- [ ] 实现15秒超时、有限重试、短期缓存与规范化；完成现价、收入、归母利润、股东权益、债务、现金、稀释股本、EBIT、税率、D&A、capex、营运资本变化等具备来源的字段。缺字段和缺同行资料明确标注。支持用户补充，来源为userProvided。
- [ ] 运行同一测试；三市场各采一份真实快照，对照公告抽查金额、期间、币种、股本，记录实际缺失，不能把fixture结果当实时验证。
- [ ] 提交`feat(valuation): collect traceable financial snapshots`。

### Task 5: 本地CLI执行适配器

**Files:** 创建`server/valuation/cli/{pi,codex,claude,opencode}.mjs`、`cli.test.mjs`。

**Interfaces:** `runAnalysis({backend,modelId,prompt,schema,cwd,signal,onEvent}): Promise<CliResult>`；`CliResult={output,requestedModelId,resolvedModelId,cliVersion}`。

- [ ] 写失败测试：显式模型ID原样传参；CLI不可用/登录失败不回退；中文跨UTF-8 chunk和JSONL跨chunk正常；stderr不当正文；Pi接受prompt不代表完成；非零退出、取消、启动30秒超时终结并释放子进程。
- [ ] 运行`node --test server/valuation/cli.test.mjs`确认失败。
- [ ] 按本机版本实现Pi RPC、Codex exec JSON/schema、Claude print JSON、OpenCode run JSON；确认可用的工具禁用/只读模式，独立任务目录，绝不加跳过权限开关。Pi事件终态按安装版本协商；输入走stdin，输出限额5MB，取消终止子进程树。
- [ ] 运行同一测试；用已登录后端做最小真实结构化响应，记录实际模型ID。缺登录的后端标记未验证。
- [ ] 提交`feat(valuation): execute analysis with local model CLIs`。

### Task 6: AI假设校验与DCF报告计算

**Files:** 创建`server/valuation/analysis/{prompt,schema,validate,index}.mjs`、`analysis.test.mjs`；创建`src/features/valuation/calculations/{dcf,scenarios}.ts`、`dcf.test.ts`；扩展`validation.ts`。

**Interfaces:** `analyzeSnapshot(snapshot,{backend,modelId,signal,onEvent}): Promise<ValuationAssumptions>`；`calculateReport(snapshot,assumptions,execution): ValuationReport`；`calculateDcf(input: DcfInput): MethodResult`；`calculateSensitivity(input: DcfInput): SensitivityCell[]`。计算引擎通过Node24可运行的TS入口加载，在实际环境验证兼容；不兼容则为服务单独构建计算模块。

- [ ] 写失败测试：来源ID不存在拒绝；事实/假设分离；畸形结构只修复一次；证券/币种/年份错配拒绝。DCF例：首年FCFF110、r=10%、g=0，现值100+终值1000=企业价值1100，加现金50减债务150、股本100得每股10；FCFE不再扣债。
- [ ] 分别运行`node --test server/valuation/analysis.test.mjs`和`npm test -- --run src/features/valuation/calculations/dcf.test.ts`确认失败。
- [ ] 实现六方法与三情景；FCFF/FCFE匹配折现率；r≤g、缺桥接、非法股本不可计算。多阶段5–15年显式收入/利润率/再投资/稀释路径，负利润不自动税收抵扣；敏感性表非法格为空；显示终值占比。分析覆盖质量、增长、现金流、杠杆、周期、壁垒、capex、稀释及证伪条件。
- [ ] 运行同一测试与类型检查；手工复核样本。改参数只改假设，不改快照；各方法单列，不输出简单平均目标价。
- [ ] 提交`feat(valuation): validate AI assumptions and calculate DCF scenarios`。

### Task 7: 本地任务服务与SSE生命周期

**Files:** 创建`server/valuation/{jobs,http,index}.mjs`、`http.test.mjs`；修改`package.json`新增`valuation:server`和`test:valuation-server`，修改`vite.config.js`代理。

**Interfaces:** 实现spec中health/backends/models/companies/jobs/events/cancel接口；`createJob(input): JobSummary`、`getJob(id)`、`cancelJob(id)`、`subscribeJob(id,lastEventId)`。服务事件为`{id,jobId,type,stage,payload,at}`。

- [ ] 写失败测试：第二任务返回409；重复取消幂等；取消后迟到回调不覆盖状态；SSE按Last-Event-ID重放且返回终态；任务总10分钟超时；无token/非允许origin拒绝；错误参数/超大正文拒绝。
- [ ] 运行`node --test server/valuation/http.test.mjs`确认失败。
- [ ] 实现状态机、SSE序号及有界缓冲、最多20个终态任务、服务关闭清理。127.0.0.1绑定，允许localhost/127.0.0.1开发origin；token启动时生成，经同源代理获取并存页面会话，直连未知origin不能获取。HTTP正文上限2MB；任务失败保留安全错误详情不泄露原始配置。
- [ ] 运行同一测试；启动服务验证health、模型列表、任务进度和取消，不触发额外推理。
- [ ] 提交`feat(valuation): add local valuation job service`。

### Task 8: 网页完整估值流程

**Files:** 创建`src/services/valuationApi.ts`、`src/pages/Valuation.tsx`、`src/pages/Valuation.test.tsx`、`src/components/valuation/{CompanySearch,ModelPicker,JobProgress,Results,AssumptionEditor,SensitivityTable}.tsx`及样式；修改`App.tsx`、`Header.tsx`、`CompanyDetail.tsx`。

**Interfaces:** `searchCompanies(query)`、`fetchBackends()`、`fetchModels(backend,refresh)`、`startValuation(input)`、`subscribeValuation(jobId,handlers)`、`cancelValuation(jobId)`；前端仅从Task1公共入口导入计算/类型。

- [ ] 写失败测试：名称/代码搜索与歧义选择；切换CLI更新版本列表；默认别名/手填模型标注；提交选中modelId；服务未运行显示启动命令；取消/SSE断线重连/恢复终态；六方法缺数据状态；改参数复算而原始事实不变。
- [ ] 运行`npm test -- --run src/pages/Valuation.test.tsx`确认失败。
- [ ] 实现一屏输入和结果区域；仅收到真实事件更新阶段，无虚构进度；显示数据日期/币种/来源及远期价格口径；补录数据有userProvided标记。生产部署说明需要本地运行，禁止自动连接不安全本机端口。
- [ ] 运行同一测试和类型检查；浏览器检查桌面/窄屏布局、键盘操作、Pages basename与详情预填。
- [ ] 提交`feat(valuation): add company valuation workbench UI`。

### Task 9: 报告保存、比较与导出

**Files:** 创建`src/features/valuation/storage.ts`、`storage.test.ts`；扩展结果组件与页面；创建`docs/valuation-local-setup.md`并更新`README.md`。

**Interfaces:** `saveReport(report): SaveResult`、`loadReports(): ValuationReport[]`、`exportReport(report,format:'json'|'markdown'): string`；存储key为`businessweb.valuation.v1`。

- [ ] 写失败测试：schema版本未知不崩溃；存储满返回明确失败但可导出；JSON导入校验；导出含来源/模型/假设而无token；重跑复用原快照、并列报告保持不同模型ID。
- [ ] 运行`npm test -- --run src/features/valuation/storage.test.ts`确认失败。
- [ ] 实现保存/导出、两份报告比较及默认模型选择记忆；文档写出本地服务、CLI登录、AKTools配置、模型列表来源、失败恢复、部署页面限制，不能声明未验证后端可用。
- [ ] 运行同一测试并手工导出/重新导入一份真实报告。
- [ ] 提交`feat(valuation): persist and export comparable valuation reports`。

### Task 10: 完整验收与交付

**Files:** 新增`docs/valuation-verification.md`，必要修复只限本功能；各项结果记录命令、时间、后端与模型版本。

- [ ] 运行`npm run test:valuation-server`、`npm test -- --run`、`npm run test:functions`、`npm run test:scripts`、`npm run typecheck`、`npm run build`、`npm run build:pages`；构建生成的无关changelog变化不混入提交。
- [ ] 本地页面用至少一个已登录CLI跑通稳定盈利、亏损成长、金融三个案例；三市场财务快照单独核对。明确区分公式测试、真实数据验证、真实模型验证。
- [ ] 实测取消、不可用模型版本、数据源失败、修改参数复算、保存导出。确认不存在凭据进入静态产物或报告。
- [ ] 若任何必须的真实验证受登录/数据服务阻碍，保留准确未验证清单与恢复步骤；不能用fixture宣布端到端通过。
- [ ] 审阅完整diff、检查已有工作未受覆盖，仅提交本功能及验收记录；不推送/部署。

## 自审结果与执行交接

任务1/6覆盖六种方法与财务口径，2/5覆盖本地CLI及模型版本，3/4覆盖证券和数据，7覆盖生命周期，8/9覆盖交互及报告，10覆盖实际验收。发现能力不足时允许默认/手填，不伪造列表；数据不足允许部分报告，不宣布完整估值。接口名称与合同在上述任务间保持一致。

推荐本会话直接执行，各任务依次推进；数据快照和模型输出合同存在较多依赖，直接执行便于连续验证。用户可选择逐任务子代理执行与独立审查；该方式成本更高。计划审阅和执行方式选择完成后进入实现，不在计划阶段安装依赖或写产品代码。

## 2026-10-04 实施结果

已按顺序实现任务1–9的主流程，并完成任务10自动检查和Codex真实验收。实现偏差与未覆盖的验收项以 `docs/valuation-verification.md` 为准：直接使用AKShare对应的东方财富接口；未自动采集同业；部分财报桥接字段留缺失；其他CLI真实推理及亏损成长实测未全部完成。上方细粒度检查项保留原计划，不能视为每项均已验证。
