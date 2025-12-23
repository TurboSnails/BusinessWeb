import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/BusinessWeb/',
  server: { 
    host: true,
    proxy: {
      '/api/proxy': {
        target: 'https://hq.sinajs.cn',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/proxy/, ''),
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            // 设置请求头，模拟浏览器请求
            proxyReq.setHeader('Referer', 'https://finance.sina.com.cn')
            proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
          })
        }
      }
    }
  }
})