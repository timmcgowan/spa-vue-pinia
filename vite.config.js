import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    host: true,
    port: 4000
    ,
    // Proxy API and auth requests to the BFF during development so cookies and CORS are simpler.
    // This lets the SPA call /api/... and /auth/... without worrying about cross-origin cookies.
    proxy: {
      // forward /api/* to BFF
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, '/api')
      },
      // forward auth routes
      '/auth': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/auth/, '/auth')
      }
    }
  }
})


