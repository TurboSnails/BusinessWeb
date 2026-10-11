import type { DailyReview } from '../../types'
import { History, Plus } from 'lucide-react'
import { Card, EmptyState, TableWrap } from '../ui'
import '../../styles/pulse.css'

interface ReviewTableProps {
  reviews: DailyReview[]
  onEdit: (review: DailyReview) => void
  onDelete: (date: string) => void
  onExport: () => void
  onImport: () => void
  onAddToday: () => void
}

const HEADERS = ['日期', '周', '涨停', '封板率', '打开', '跌停', '封板率', '打开', '量能', '涨-跌', '沪深创', '连板晋级', '连板数', '最高板', '成交前五', '换手前五', '流入', '流出', '操作']

export const ReviewTable: React.FC<ReviewTableProps> = ({ reviews, onEdit, onDelete, onExport, onImport, onAddToday }) => (
  <Card
    title={<>每日复盘 <span className="pulse-muted">最近{reviews.length}天</span></>}
    icon={<History size={18} />}
    className="pulse-review"
    actions={<>
      <button type="button" className="tool-btn" onClick={onExport}>📥 导出</button>
      <button type="button" className="tool-btn" onClick={onImport}>📤 导入</button>
      <button type="button" className="tool-btn tool-btn--primary" onClick={onAddToday}><Plus size={14} aria-hidden="true" /> 录入今日</button>
    </>}
  >
    {reviews.length > 0 ? (
      <TableWrap label="每日复盘" stickyFirst>
        <table className="ui-table pulse-review__table">
          <thead>
            <tr>{HEADERS.map((h, i) => <th key={`${h}-${i}`} scope="col">{h}</th>)}</tr>
          </thead>
          <tbody>
            {reviews.slice(0, 10).map(r => (
              <tr key={r.date}>
                <td className="pulse-strong">{r.date.slice(5)}</td>
                <td>{r.weekday}</td>
                <td className="pulse-zt">{r.ztCount}</td>
                <td>{r.ztSealRate}</td>
                <td>{r.ztOpen}</td>
                <td className="pulse-dt">{r.dtCount}</td>
                <td>{r.dtSealRate}</td>
                <td>{r.dtOpen}</td>
                <td className="pulse-vol">{r.volume}</td>
                <td>{r.upDown}</td>
                <td>{r.shszcy}</td>
                <td>{r.lbRate}</td>
                <td className="pulse-strong">{r.lbCount}</td>
                <td className="pulse-zt pulse-zt--max">{r.maxBoard}</td>
                <td className="pulse-accent">{r.top5Amount || '--'}</td>
                <td className="pulse-accent">{r.top5Turnover || '--'}</td>
                <td className="pulse-flow pulse-zt-text" title={r.inflow}>{r.inflow}</td>
                <td className="pulse-flow pulse-dt-text" title={r.outflow}>{r.outflow}</td>
                <td>
                  <div className="pulse-row-actions">
                    <button type="button" className="tool-btn" onClick={() => onEdit(r)}>编辑</button>
                    <button type="button" className="tool-btn tool-btn--danger" onClick={() => onDelete(r.date)}>删除</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableWrap>
    ) : (
      <EmptyState title="暂无数据">点击「录入今日」开始记录</EmptyState>
    )}
  </Card>
)
