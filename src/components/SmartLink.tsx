import React from 'react'
import { Link } from 'react-router-dom'
import { isAbsoluteUrl, isNotesPath, isStaticToolPath } from '../data/notesLinks'

type Props = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { to: string }

/**
 * 站内链接：/note/、/index-panorama/ 等静态页，以及完整 http(s) 地址，都必须用普通 <a> 整页加载；
 * 用前端路由的 Link 会被 SPA 路由接管，找不到匹配路由而显示"这一页不存在"。其余路径照常使用 Link。
 */
const SmartLink = React.forwardRef<HTMLAnchorElement, Props>(function SmartLink({ to, ...rest }, ref) {
  if (isNotesPath(to) || isStaticToolPath(to) || isAbsoluteUrl(to)) return <a ref={ref} href={to} {...rest} />
  return <Link ref={ref} to={to} {...rest} />
})

export default SmartLink
