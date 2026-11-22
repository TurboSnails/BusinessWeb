import type { Master } from './types'
import { renderBlogMarkdown } from '../blog/markdown'
import druckenmiller from '../../../docs/research/macro-masters/druckenmiller/README.md?raw'
import dalio from '../../../docs/research/macro-masters/dalio/README.md?raw'
import marks from '../../../docs/research/macro-masters/marks/README.md?raw'
import tudorJones from '../../../docs/research/macro-masters/tudor-jones/README.md?raw'
import zweig from '../../../docs/research/macro-masters/zweig/README.md?raw'
import grantham from '../../../docs/research/macro-masters/grantham/README.md?raw'
import soros from '../../../docs/research/macro-masters/soros/README.md?raw'
import templeton from '../../../docs/research/macro-masters/templeton/README.md?raw'
import kostolany from '../../../docs/research/macro-masters/kostolany/README.md?raw'

export const MASTER_ARTICLES: Record<Master['slug'], string> = {
  druckenmiller,
  dalio,
  marks,
  'tudor-jones': tudorJones,
  zweig,
  grantham,
  soros,
  templeton,
  kostolany,
}

const ARTICLE_SOURCE_ROOT = 'https://github.com/TurboSnails/BusinessWeb/blob/main/docs/research/macro-masters'

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function normalizeArticleUrls(html: string, sourceBase: string): string {
  return html.replace(/(href|src)="([^"]*)"/g, (attribute, name: string, escapedUrl: string) => {
    if (!escapedUrl.startsWith(sourceBase)) return attribute
    const url = escapedUrl.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    return `${name}="${escapeAttribute(new URL(url).toString())}"`
  })
}

export function renderMasterArticleMarkdown(slug: Master['slug'], markdown: string): { html: string } {
  const sourceBase = `${ARTICLE_SOURCE_ROOT}/${slug}`
  const rendered = renderBlogMarkdown(markdown, sourceBase)
  return { html: normalizeArticleUrls(rendered.html, sourceBase) }
}
