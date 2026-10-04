import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { marketMiddleware } from './server/market.mjs'

export default defineConfig({
  plugins: [react(), { name: 'businessweb-market-api', configureServer(server) { server.middlewares.use(marketMiddleware) } }],
  base: process.env.VITE_BASE_PATH || '/',
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toLocaleString('zh-CN', { 
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })),
    __VERSION__: JSON.stringify(process.env.npm_package_version || '0.1.0')
  },
  server: { 
    host: true,
    proxy: {
      '/api/valuation': { target: `http://127.0.0.1:${process.env.VALUATION_PORT || 8788}`, changeOrigin: true },
      '/api/cls-plate': { target: 'https://business-web-black.vercel.app', changeOrigin: true },
      '/api/candidates-sync': { target: 'https://business-web-black.vercel.app', changeOrigin: true },
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
  },
  test: {
    environment: 'jsdom',
    environmentOptions: { jsdom: { url: 'http://localhost' } },
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    passWithNoTests: true,
    globals: true,
    setupFiles: ['src/features/grid-trading/testSetup.ts'],
    restoreMocks: true,
    clearMocks: true
  }
})
