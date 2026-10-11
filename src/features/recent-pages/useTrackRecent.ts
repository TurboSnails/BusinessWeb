import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { pushRecent } from './store'

/** 每次路由变化记录一次；注册表外的路径由 pushRecent 自己忽略 */
export function useTrackRecent(): void {
  const { pathname } = useLocation()
  useEffect(() => {
    pushRecent(pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname)
  }, [pathname])
}
