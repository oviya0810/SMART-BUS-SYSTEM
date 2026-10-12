import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// In development the Vite server proxies /api and /socket.io to the Flask backend,
// so the browser always talks to ONE origin (no CORS, cookies work on mobile too).
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backend = env.VITE_DEV_BACKEND || 'http://127.0.0.1:80';
  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5173,
      proxy: {
        '/api': { target: backend, changeOrigin: false },
        '/socket.io': { target: backend, ws: true, changeOrigin: false },
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      chunkSizeWarningLimit: 1200,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            maps: ['leaflet', 'react-leaflet'],
            charts: ['recharts'],
          },
        },
      },
    },
  };
});
