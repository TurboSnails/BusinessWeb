import type { DailyReview } from '../../types'
import { History, Download, Upload, Plus } from 'lucide-react'

interface ReviewTableProps {
  reviews: DailyReview[]
  onEdit: (review: DailyReview) => void
  onDelete: (date: string) => void
  onExport: () => void
  onImport: () => void
  onAddToday: () => void
}

export const ReviewTable: React.FC<ReviewTableProps> = ({
  reviews,
  onEdit,
  onDelete,
  onExport,
  onImport,
  onAddToday
}) => {
  const headers = ['日期', '周', '涨停', '封板率', '打开', '跌停', '封板率', '打开', '量能', '涨-跌', '沪深创', '连板晋级', '连板数', '最高板', '成交前五', '换手前五', '流入', '流出', '操作']

  return (
    <div style={{ marginBottom: '24px', padding: '16px', background: 'white', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', color: '#374151', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <History size={18} /> 每日复盘 <span style={{ fontSize: '0.8rem', color: '#9ca3af', fontWeight: 'normal' }}>最近{reviews.length}天</span>
        </h3>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          <button onClick={onExport} style={{
            padding: '6px 12px', background: '#10b981', color: 'white', border: 'none',
            borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '500'
          }}>📥 导出</button>
          <button onClick={onImport} style={{
            padding: '6px 12px', background: '#8b5cf6', color: 'white', border: 'none',
            borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '500'
          }}>📤 导入</button>
          <button onClick={onAddToday} style={{
            display: 'flex', alignItems: 'center', gap: '4px',
            padding: '6px 12px', background: '#3b82f6', color: 'white', border: 'none',
            borderRadius: '6px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: '500'
          }}>
            <Plus size={14} /> 录入今日
          </button>
        </div>
      </div>

      {reviews.length > 0 ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', minWidth: '1200px' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {headers.map(h => (
                  <th key={h} style={{ padding: '8px 6px', textAlign: 'center', fontWeight: '600', color: '#64748b', borderBottom: '2px solid #e2e8f0', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {reviews.slice(0, 10).map((r, i) => (
                <tr key={r.date} style={{ background: i % 2 === 0 ? 'white' : '#fafafa' }}>
                  <td style={{ padding: '8px 6px', textAlign: 'center', fontWeight: '500' }}>{r.date.slice(5)}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center' }}>{r.weekday}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center', color: '#dc2626', fontWeight: '600' }}>{r.ztCount}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center' }}>{r.ztSealRate}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center' }}>{r.ztOpen}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center', color: '#16a34a', fontWeight: '600' }}>{r.dtCount}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center' }}>{r.dtSealRate}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center' }}>{r.dtOpen}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center', color: '#f59e0b', fontWeight: '600' }}>{r.volume}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center' }}>{r.upDown}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center' }}>{r.shszcy}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center' }}>{r.lbRate}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center', color: '#8b5cf6', fontWeight: '600' }}>{r.lbCount}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center', color: '#dc2626', fontWeight: '700' }}>{r.maxBoard}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center', color: '#0ea5e9', fontWeight: '600' }}>{r.top5Amount || '--'}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'center', color: '#0ea5e9', fontWeight: '600' }}>{r.top5Turnover || '--'}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'left', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#dc2626' }} title={r.inflow}>
                    {r.inflow}
                  </td>
                  <td style={{ padding: '8px 6px', textAlign: 'left', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#16a34a' }} title={r.outflow}>
                    {r.outflow}
                  </td>
                  <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                    <button onClick={() => onEdit(r)} style={{ padding: '2px 6px', marginRight: '4px', background: '#e0f2fe', color: '#0369a1', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '0.7rem' }}>
                      编辑
                    </button>
                    <button onClick={() => onDelete(r.date)} style={{ padding: '2px 6px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '3px', cursor: 'pointer', fontSize: '0.7rem' }}>
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ padding: '24px', textAlign: 'center', color: '#9ca3af' }}>
          暂无数据，点击"录入今日"开始记录
        </div>
      )}
    </div>
  )
}

