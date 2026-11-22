import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // 相对路径：产物可以挂在任意子路径（GitHub Pages 的 /sbg/ 之类）。
  // 注意 type="module" 受 CORS 限制，file:// 直开仍需一个 http 服务。
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
  },
})
