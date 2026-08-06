import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5000,
    host: true,
    allowedHosts: true,
    proxy: {
      '/api': 'http://localhost:3000',
      // The payment page is rendered by the backend, not React, so it needs
      // forwarding too — otherwise the QR link 404s during development.
      '/pay': 'http://localhost:3000',
    },
  },
});
