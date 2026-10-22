import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiTarget = process.env.VITE_BACKEND_URL || 'https://operatorai-6uq9.onrender.com';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: 'localhost',
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
        secure: true,
      },
      '/share-location.html': {
        target: apiTarget,
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
