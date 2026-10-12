import Pulse from './Pulse'
import '../styles/daily-analysis.css'

export default function DailyAnalysisLegacy(): JSX.Element {
  return <Pulse view="analysis" notice={<div className="daily-legacy-note" role="note"><span>历史旧版：原有手工复盘、导入导出与云同步。</span><Link className="tool-btn" to="/daily-analysis">返回自动分析</Link></div>} />
}
import { Link } from 'react-router-dom'
