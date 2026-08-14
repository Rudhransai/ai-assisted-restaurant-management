import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // 'dist-web', not 'dist': a stale committed dist/ once shadowed fresh builds on the
  // deploy host (cached COPY layers kept resurrecting it). A directory name that never
  // existed in any old commit or cache cannot be shadowed.
  build: { outDir: 'dist-web' },
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
