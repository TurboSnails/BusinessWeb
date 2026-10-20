import { useEffect, useState } from 'react'
import { readToolSources, type ToolSources } from './links'
import { loadAutoDcf } from '../dcf/autoDcf'

/** 本机已保存的 DCF、估值与网格记录；从 DCF 等页回来（窗口重新获得焦点）时自动重读 */
export function useToolSources(): ToolSources {
  const [tools, setTools] = useState<ToolSources>(readToolSources)
  useEffect(() => {
    let active = true
    void loadAutoDcf().then(auto => { if (active) setTools(t => ({ ...t, auto })) })
    const refresh = (): void => { if (document.visibilityState !== 'hidden') setTools(t => ({ ...readToolSources(), auto: t.auto })) }
    window.addEventListener('focus', refresh)
    window.addEventListener('storage', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => { active = false; window.removeEventListener('focus', refresh); window.removeEventListener('storage', refresh); document.removeEventListener('visibilitychange', refresh) }
  }, [])
  return tools
}
