import React, { useState } from 'react'
import { Cloud, ShieldCheck } from 'lucide-react'
import { loadSyncConfig, saveSyncConfig, syncGridRecords } from './cloudSync'
import type { SyncConfig } from './cloudSync'
import type { SavedRecord } from './types'

type Props = {
  records: SavedRecord[]
  onSynced: (records: SavedRecord[]) => void
}

export default function CloudSyncPanel({ records, onSynced }: Props): JSX.Element {
  const [config, setConfig] = useState<SyncConfig | null>(() => loadSyncConfig())
  const [endpoint, setEndpoint] = useState(config?.endpoint ?? '')
  const [token, setToken] = useState(config?.token ?? '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const configure = async () => {
    try {
    const saved = await saveSyncConfig({ endpoint, token }, (domain) => window.confirm(
      `即将保存独立同步目标：${domain}\n只有你部署的独立服务才可使用；确认前不会发出网络请求。继续吗？`,
    ))
    if (!saved) {
      setMessage('配置未保存。请填写 HTTPS 地址和至少 16 位的专用 token。')
      return
    }
    const next = loadSyncConfig()
    setConfig(next)
    setEndpoint(next?.endpoint ?? '')
    setToken(next?.token ?? '')
    setMessage('独立服务配置已保存在本机；尚未发起同步。')
    } catch (e) { setMessage(e instanceof Error ? e.message : '配置保存失败') }
  }

  const sync = async () => {
    setBusy(true)
    setMessage('')
    const result = await syncGridRecords(records, config, fetch, (domain, count) => window.confirm(
      `即将连接 ${domain} 并同步 ${count} 条本地记录。确认这是你单独部署的同步服务后继续。`,
    ))
    setBusy(false)
    if (result.status === 'synced' && result.records) {
      onSynced(result.records)
      setMessage(`同步完成：${result.records.length} 条记录`)
    } else if (result.status === 'cancelled') {
      setMessage('已取消；没有发送同步请求。')
    } else {
      setMessage(result.error ?? (result.status === 'not-configured' ? '未配置独立同步服务。' : '同步未完成。'))
    }
  }

  return (
    <section className="grid-card grid-cloud-panel" aria-labelledby="grid-cloud-title">
      <div className="grid-section-heading">
        <div className="grid-icon-badge"><Cloud size={18} /></div>
        <div>
          <h2 id="grid-cloud-title">可选云同步</h2>
          <p>记录默认只存在本机浏览器；云同步不会连接 notes 项目的服务。</p>
        </div>
        <span className={`grid-sync-status ${config ? 'is-ready' : ''}`}>
          {config ? '独立服务已配置' : '未配置'}
        </span>
      </div>

      <div className="grid-cloud-boundary"><ShieldCheck size={16} /> 只填写你单独部署的 HTTPS 服务和专用 token；保存与每次同步前都会显示目标域名供确认。</div>
      <div className="grid-cloud-config">
        <label>独立同步服务地址
          <input type="url" value={endpoint} onChange={event => setEndpoint(event.target.value)} placeholder="https://your-own-sync.example/api" autoComplete="url" />
        </label>
        <label>专用 Token
          <input type="password" value={token} onChange={event => setToken(event.target.value)} placeholder="至少 16 个字符" autoComplete="new-password" />
        </label>
        <div className="grid-button-row">
          <button type="button" className="grid-button grid-button-secondary" onClick={() => void configure()} disabled={busy}>保存独立配置</button>
          <button type="button" className="grid-button" onClick={() => void sync()} disabled={!config || busy}>
            {busy ? '同步中…' : '立即同步'}
          </button>
        </div>
      </div>
      {message && <p className="grid-inline-message" role="status">{message}</p>}
    </section>
  )
}
