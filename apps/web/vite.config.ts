import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '../..', '');
  return {
    envDir: '../..',
    plugins: [react()],
    server: {
      proxy: {
        '/api': {
          target: env['VITE_API_PROXY_TARGET'] || env['API_URL'] || 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
  };
})
