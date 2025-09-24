import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
  ],
  optimizeDeps: {
    include: ['laz-perf', '@babylonjs/core'],
  },
  server: {
    hmr: false, // Completely disable HMR
  }
});
