import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // The Express API runs separately in development; forward /api calls to it.
    proxy: { '/api': 'http://localhost:3000' },
  },
});
