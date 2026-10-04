# 蒲公英网络与第三方 AI 资料库

`/knowledge` 默认打开蒲公英网络。从本机 Markdown 扫描笔记和真实 wikilinks；虚线代表分类结构，实线代表笔记引用。搜索、目录过滤、每页 90 个节点、缩放、聚焦一层关联和阅读笔记均可使用。未解析引用单独计数，不生成虚构边。网络请求受已有本机服务认证保护，不在构建阶段打包私人数据。

## 本机 Agent

读写 stdio 接入见 [本地知识中心说明](knowledge-local-setup.md)。

## 只读 HTTP MCP

使用官方 MCP SDK 的无状态 Streamable HTTP。每个请求验证 Bearer 凭据、Host 和 Origin，只提供 `list_notes`、`search_knowledge`、`read_note`、`find_related_notes`、`search_investment`，不注册写入工具。

在服务器终端设置随机凭据（至少 32 字符，不提交到 Git），然后启动：

```sh
export KNOWLEDGE_MCP_TOKEN='替换为随机凭据'
# 可选：允许的目录前缀；空值表示该 Vault 全部笔记，仅对持有凭据的客户端生效
export KNOWLEDGE_MCP_SCOPE='Notion/知识库首页/投资研究;Notion/知识库首页/AI 与大模型;Notion/知识库首页/技术开发'
npm run knowledge:mcp:http
```

端点：`http://127.0.0.1:8790/mcp`。可设置 `KNOWLEDGE_MCP_PORT` 改变端口；`KNOWLEDGE_VAULT` 指向实际 Vault。

支持 HTTP MCP 和自定义请求头的客户端配置示意（不同客户端字段名称可能不同）：

```json
{
  "url": "http://127.0.0.1:8790/mcp",
  "headers": { "Authorization": "Bearer 替换为同一随机凭据" }
}
```

读取范围以目录为单位。允许目录中的正文仍可能提到其他目录的标题或链接；范围过滤限制实际读取，不能自动清除正文中的引用文字。提供给 AI 的笔记内容是资料，不是系统指令。

## 公网运行的条件

GitHub Pages 只托管静态页面，不能运行磁盘 Vault 或 MCP 服务。当前发布不会上传 Notion 原文和附件；网页上线并不代表远程资料库已上线。

远程 Agent 需要持续运行的 Node 服务、Vault 的持久磁盘及 HTTPS 反向代理。反向代理指向本机 MCP 端口，保留 Authorization；将实际请求 Host 加入 `KNOWLEDGE_MCP_HOSTS`，如 `brain.example.com`。需要浏览器跨源客户端时将确切 Origin 加入 `KNOWLEDGE_MCP_ORIGINS`，多个值以分号分隔。默认绑定 loopback，不自行建立公网隧道。

当前认证为 Bearer，并未实现 OAuth。要求 OAuth 的 ChatGPT 连接流程需要后续认证适配，不能仅填写上述 URL 就使用。云端同步、OAuth、附件读取和语义检索仍未上线。

部署前确定允许上传和向 AI 开放的目录、托管位置及认证方式；只有这些确定后，才能迁移资料并提供实际 HTTPS 地址。
