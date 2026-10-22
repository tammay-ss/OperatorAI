import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: 'localhost',
    proxy: {
      '/api': {
        target: 'https://operatorai-6uq9.onrender.com',
        changeOrigin: true,
        secure: true,
      },
      '/share-location.html': {
        target: 'https://operatorai-6uq9.onrender.com',
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
