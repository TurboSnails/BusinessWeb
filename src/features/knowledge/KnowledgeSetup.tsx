import React from 'react'
import { Files, GitBranch, Database, Cloud, Network } from 'lucide-react'
export default function KnowledgeSetup(): JSX.Element {
  return <section className="kb-setup">
    <div className="kb-setup-intro"><span className="kb-eyebrow">YOUR FILES, YOUR KNOWLEDGE</span><h2>数据握在自己手里。</h2><p>Obsidian 和这个工作台读取同一份 Markdown。AI 可以更换，知识一直留下。</p></div>
    <div className="kb-layer-grid">
      {[{ icon: Files, title: 'Markdown + Obsidian', state: '本版支持', desc: '笔记保存在本地 Vault，用 Obsidian 打开同一个目录即可。' },
        { icon: GitBranch, title: 'Git 版本管理', state: '自行配置', desc: '为私人 Vault 单独建立仓库，按需提交与备份。' },
        { icon: Network, title: 'Personal MCP', state: 'stdio + HTTP · 需配置', desc: '本地 Agent 可读写；HTTP 客户端使用凭据只读访问，可按目录限制资料范围。' },
        { icon: Database, title: 'Supabase / pgvector', state: '私人云端副本', desc: '正文、元数据和关联可从本地重建，语义索引后续加入。' },
        { icon: Cloud, title: 'Cloudflare R2', state: '后续接入', desc: '附件增加以后，再扩展云存储与恢复。' }].map(item => <article key={item.title} className="kb-layer"><item.icon size={20} /><span className="kb-layer-state">{item.state}</span><h3>{item.title}</h3><p>{item.desc}</p></article>)}
    </div>
    <div className="kb-setup-guide"><h3>给第三方 AI 使用资料库</h3><p>支持 MCP 的 Codex、Claude 和自建 Agent 可搜索、读取并查找关联笔记，返回真实 Markdown 来源。</p><p>本机 stdio：<code>npm run knowledge:mcp</code>；只读 HTTP：设置至少 32 字符的 <code>KNOWLEDGE_MCP_TOKEN</code> 后运行 <code>npm run knowledge:mcp:http</code>，地址为 <code>http://127.0.0.1:8790/mcp</code>。</p><p>HTTP 请求需要 <code>Authorization: Bearer 凭据</code>。可通过 <code>KNOWLEDGE_MCP_SCOPE</code> 指定允许目录，以分号分隔。凭据放在客户端配置中。</p><p>远程只读 MCP 地址：https://business-web-black.vercel.app/api/knowledge?action=mcp。使用独立 AI 只读凭据发送 Authorization: Bearer 凭据。要求 OAuth 的客户端还需适配，当前不能直接作为 ChatGPT OAuth 连接器使用。</p></div>
    <div className="kb-setup-guide"><h3>开始使用</h3><ol><li>在 BusinessWeb 目录运行 <code>npm run knowledge:app</code>。</li><li>默认 Vault 在 <code>BusinessWeb/.local/SecondBrain</code>，将它作为 Obsidian Vault 打开。</li><li>使用现有 Vault：<code>KNOWLEDGE_VAULT='/绝对路径/SecondBrain' npm run knowledge:app</code>。</li><li>本地 Agent 的 MCP 命令为 <code>node /绝对路径/BusinessWeb/server/knowledge/mcp.mjs</code>，配置相同的 <code>KNOWLEDGE_VAULT</code>。</li></ol><p>完整步骤见项目文档 <code>docs/knowledge-local-setup.md</code>。云端同步：npm run knowledge:cloud -- --prepare 生成本地快照；按 docs/knowledge-cloud-setup.md 配置服务后上传。云端修改请回到 Obsidian 后重新同步。</p></div>
  </section>
}
