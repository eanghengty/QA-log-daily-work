import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/QA-log-daily-work/',
  plugins: [vue(), tailwindcss()],
  server: {
    port: 5185,
    strictPort: true,
  },
  preview: {
    port: 5185,
    strictPort: true,
  },
})
