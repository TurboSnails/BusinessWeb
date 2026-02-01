# AkShare 接入说明

## 能否接入

可以。AkShare 是 Python 库，前端不能直接调用。官方方案是 **AKTools**：把 AkShare 暴露成 HTTP API，React 用 `fetch` 调用即可。

## 快速启动 AKTools

```bash
pip install aktools   # 需 >= 0.0.81
python -m aktools      # 默认 http://127.0.0.1:8080
```

指定端口：`python -m aktools --host 0.0.0.0 --port 8888`

接口格式：`http://127.0.0.1:8080/api/public/{接口名}`，参数用 query，如：

- 无参数：`http://127.0.0.1:8080/api/public/stock_comment_em`
- 带参数：`http://127.0.0.1:8080/api/public/stock_zh_a_hist?symbol=600000&period=daily`

## 本项目中的使用

- `src/services/api.ts` 已封装：
  - `fetchAkShare(interfaceName, params)`：通用调用
  - `fetchAkShareStockZhAHist(symbol, options)`：A 股日线示例
- 生产环境可配置环境变量 `VITE_AKTOOLS_BASE_URL` 指向你的 AKTools 服务地址（否则默认 `http://127.0.0.1:8080`）。
- 若 AKTools 与前端不同域，需在 AKTools 侧或通过 Nginx 等配置 CORS，或再用一层后端代理。

## 已接入 AkShare 的开源项目参考

| 项目 | 说明 |
|------|------|
| **AKTools** | 官方：一行命令把 AkShare 转成 HTTP API，任何语言可调。[GitHub](https://github.com/akfamily/aktools) \| [文档](https://aktools.akfamily.xyz/aktools/) |
| **AKShare One** | 基于 AkShare 的标准化接口层，有在线 demo。[GitHub](https://github.com/zwldarren/akshare-one) \| [Demo](https://zwldarren.github.io/akshare-one/) |
| **FQuant-Web-Lite** | Vue + Quasar + ECharts 量化前端，支持盘前/盘中/盘后统计，后端可接 AkShare 等。[GitHub](https://github.com/FartherQuant/FQuant-Web-Lite) |

## AkShare 接口参考

- 数据字典（接口名与参数）：<https://akshare.akfamily.xyz/data/>
- 与本项目相关的常用接口示例：A 股行情 `stock_zh_a_hist`、板块/概念等可在数据字典中按“板块”“概念”搜索后，用 `fetchAkShare('接口名', { 参数 })` 调用。

## Docker 方式运行 AKTools

```bash
docker pull registry.cn-shanghai.aliyuncs.com/akfamily/aktools:1.8.95
docker run -d -p 8080:8080 registry.cn-shanghai.aliyuncs.com/akfamily/aktools:1.8.95
```

然后访问 `http://127.0.0.1:8080/api/public/stock_zh_a_hist` 测试。
