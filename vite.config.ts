import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/hbase-16-region-assignment/',
  server: {
    port: 54316,
  },
})
