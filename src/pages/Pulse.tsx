import React from 'react'
import { useNavigate } from 'react-router-dom'
import useFetch from '../hooks/useFetch'
import { fetchExample } from '../services/api'

export default function Pulse(): JSX.Element {
  const navigate = useNavigate()
  const { data, loading, error } = useFetch(fetchExample)

  return (
    <div className="container">


      <div className="card">
        <h2>经济脉搏</h2>
        <h3>每日经济分析(机构+游资)</h3>

        <div style={{ margin: '12px 0' }}>
          <strong>每日经济分析</strong>
          <ul style={{ paddingLeft: 18, marginTop: 8 }}>
            <li>
              <a href="https://stcn.com/article/search.html?keyword=%E6%8F%AD%E7%A7%98%E6%B6%A8%E5%81%9C" target="_blank" rel="noopener noreferrer">证券时报 — 搜索：揭秘涨停</a>
            </li>
            <li>
              <a href="https://xuangutong.com.cn/jingxuan" target="_blank" rel="noopener noreferrer">选股通 — 精选</a>
            </li>
            <li>
              <a href="http://csme.cnthesims.com/pages/index/index" target="_blank" rel="noopener noreferrer">cs财经</a>
            </li>
          </ul>
        </div>

        <div style={{ marginTop: 16 }}>
          <strong>其他市场入口</strong>
          <ul style={{ paddingLeft: 18, marginTop: 8 }}>
            <li>
              <a href="https://finance.yahoo.com/quote/NAVI/" target="_blank" rel="noopener noreferrer">雅虎市值 — NAVI</a>
            </li>
            <li>
              <a href="https://www.cls.cn/" target="_blank" rel="noopener noreferrer">财联社</a>
            </li>
          </ul>
        </div>

        {loading && <p>加载中...</p>}
        {error && <p style={{ color: 'red' }}>请求失败：{error.message}</p>}
        {data && (
          <div>
            <strong>示例数据：</strong>
            <p>{data.message}</p>
          </div>
        )}
      </div>
    </div>
  )
}
