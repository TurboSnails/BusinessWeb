import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // 将 '你的仓库名' 替换为 BusinessWeb
  base: '/BusinessWeb/', 
  server: { 
    host: true 
  }
})