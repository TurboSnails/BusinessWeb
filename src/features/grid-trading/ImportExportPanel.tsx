import React, { useRef, useState } from 'react'
import { Download, FileDown, FileUp } from 'lucide-react'
import { applyGridImport, exportGridRecords, parseGridImport } from './importExport'
import type { ImportConflictChoice, GridImportPreview } from './importExport'
import { readRecords, writeRecords } from './repository'
import type { SavedRecord } from './types'

type Props = { records: SavedRecord[]; onImported: (records: SavedRecord[]) => void }

export default function ImportExportPanel({ records, onImported }: Props): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<GridImportPreview | null>(null)
  const [choices, setChoices] = useState<Record<string, ImportConflictChoice>>({})
  const [message, setMessage] = useState('')
  const [dragging, setDragging] = useState(false)

  const download = () => {
    const content = exportGridRecords(records)
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `businessweb-grid-records-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const readFile = async (file?: File) => {
    if (!file) return
    const parsed = parseGridImport(await file.text())
    setPreview(parsed)
    setChoices({})
    setMessage(parsed.errors.length ? `发现 ${parsed.errors.length} 个问题；有效记录可单独预览。` : '')
  }

  const apply = () => {
    if (!preview || !preview.records.length) return
    const result = applyGridImport(readRecords(), preview.records, choices)
    if (result.conflicts.length) {
      setMessage('请先为每条同 ID 记录选择保留本地或使用导入版本。')
      return
    }
    const added = result.records.length - records.length
    if (!window.confirm(`将导入 ${preview.records.length} 条记录（新增 ${added} 条），继续写入本机吗？`)) return
    try {
      writeRecords(result.records)
      onImported(result.records)
      setPreview(null)
      setMessage(`已导入 ${preview.records.length} 条记录。`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '导入未能保存。')
    }
  }

  const conflictIds = preview?.records.map(item => item.id).filter(id => records.some(record => record.id === id)) ?? []

  return (
    <section className="grid-card" aria-labelledby="grid-portability-title">
      <div className="grid-section-heading">
        <div className="grid-icon-badge"><FileDown size={18} /></div>
        <div><h2 id="grid-portability-title">备份与迁移</h2><p>导出包含成交调整、参数历史、手动交易和全部快照，不包含同步 Token。</p></div>
      </div>
      <div className="grid-button-row">
        <button type="button" className="grid-button grid-button-secondary" onClick={download}><Download size={16} /> 导出 JSON</button>
        <button type="button" className="grid-button grid-button-secondary" onClick={() => inputRef.current?.click()}><FileUp size={16} /> 选择 JSON 导入</button>
        <input ref={inputRef} className="grid-file-input" type="file" accept="application/json,.json" onChange={event => void readFile(event.target.files?.[0])} />
      </div>
      <div
        className={`grid-dropzone ${dragging ? 'is-dragging' : ''}`}
        onDragOver={event => { event.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={event => { event.preventDefault(); setDragging(false); void readFile(event.dataTransfer.files[0]) }}
      >
        可把 JSON 备份拖放到这里。预览和确认之前不会修改现有记录。
      </div>
      {preview && <div className="grid-import-preview" aria-live="polite">
        <h3>导入预览：{preview.records.length} 条有效记录</h3>
        {preview.errors.map(error => <p key={error} className="grid-error-text">{error}</p>)}
        {preview.records.map(record => <div className="grid-import-row" key={record.id}>
          <span>{record.row.code} · {record.row.name}</span>
          {conflictIds.includes(record.id) && <label>同 ID 冲突
            <select value={choices[record.id] ?? ''} onChange={event => setChoices(current => ({ ...current, [record.id]: event.target.value as ImportConflictChoice }))}>
              <option value="">请选择</option><option value="skip">保留本地</option><option value="replace">使用导入版本</option>
            </select>
          </label>}
        </div>)}
        <button type="button" className="grid-button" onClick={apply} disabled={!preview.records.length}>确认导入</button>
      </div>}
      {message && <p className="grid-inline-message" role="status">{message}</p>}
    </section>
  )
}
