import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Custom plugin to force page reload for service files
    {
      name: 'services-reload',
      handleHotUpdate({ file, server }) {
        // Force page reload for ANY file in services folder
        if (file.includes('/services/')) {
          server.ws.send({
            type: 'full-reload'
          });
          return [];
        }
      }
    }
  ],
  server: {
    port: 3000,
  },
});
