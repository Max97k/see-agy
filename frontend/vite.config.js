import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const PORT = parseInt(process.env.PORT || '5173', 10);
const BACKEND_PORT = parseInt(process.env.BACKEND_PORT || '3005', 10);

export default defineConfig({
  plugins: [react()],
  server: {
    port: PORT,
    proxy: {
      '/api': {
        target: `http://localhost:${BACKEND_PORT}`,
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: PORT,
  },
});
