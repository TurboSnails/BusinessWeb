import React from 'react'

declare const __BUILD_TIME__: string

export default function Footer(): JSX.Element {
  const built = typeof __BUILD_TIME__ !== 'undefined' ? __BUILD_TIME__ : new Date().toLocaleDateString('zh-CN')
  return (
    <footer className="site-footer">
      <div className="site-footer__name">Live</div>
      <div className="site-footer__line">投资 · AI · 独立开发 · 自由生活</div>
      <div className="site-footer__note">本站内容仅为个人研究与方法讨论，不构成任何投资建议。</div>
      <div className="site-footer__build">更新于 {built}</div>
    </footer>
  )
}
