// Vercel Serverless Function - 代理新浪财经 API
// 部署到 Vercel 后，访问地址：https://your-project.vercel.app/api/china-stock?symbol=sh000001

export default async function handler(req, res) {
  // 设置 CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  // 处理 OPTIONS 请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  const { symbol } = req.query

  if (!symbol) {
    return res.status(400).json({ error: '缺少 symbol 参数' })
  }

  try {
    // 请求新浪财经 API
    const response = await fetch(`https://hq.sinajs.cn/list=${symbol}`, {
      headers: {
        'Referer': 'https://finance.sina.com.cn',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    })

    if (!response.ok) {
      return res.status(response.status).json({ error: '请求失败' })
    }

    const text = await response.text()
    
    // 返回原始数据，让前端解析
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    return res.status(200).send(text)
  } catch (error) {
    console.error('Proxy error:', error)
    return res.status(500).json({ error: '代理请求失败', message: error.message })
  }
}

