import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  plugins: [
    wasm(),
    topLevelAwait(),
    react(),
    // Custom plugin to force page reload for service files
    {
      name: 'services-reload',
      handleHotUpdate({ file, server }) {
        // Force page reload for ANY file in services folder
        if (file.includes('/services/')) {
          server.ws.send({
            type: 'full-reload',
          });
          return [];
        }
      },
    },
  ],
  worker: {
    plugins: () => [wasm(), topLevelAwait()],
    format: 'es',
  },
  server: {
    port: 3000,
    host: '0.0.0.0', // Listen on all interfaces for public access
  },
});
