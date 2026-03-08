import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return;
          }

          if (id.includes('/node_modules/three/')) {
            return 'three-core';
          }
          if (id.includes('/node_modules/three-stdlib/')) {
            return 'three-stdlib';
          }
          if (id.includes('/node_modules/@react-three/fiber/')) {
            return 'r3f';
          }
          if (id.includes('/node_modules/@react-three/drei/')) {
            return 'drei';
          }
          if (
            id.includes('/node_modules/@react-three/postprocessing/') ||
            id.includes('/node_modules/postprocessing/')
          ) {
            return 'postfx';
          }
          if (
            id.includes('/node_modules/@mui/') ||
            id.includes('/node_modules/@emotion/')
          ) {
            return 'mui';
          }
          if (id.includes('/node_modules/socket.io-client/')) {
            return 'socket';
          }

          return;
        },
      },
    },
  },
});
