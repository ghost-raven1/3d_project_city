import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
    },
    build: {
        rollupOptions: {
            output: {
                manualChunks: {
                    three: ['three', '@react-three/fiber', '@react-three/drei'],
                    mui: [
                        '@mui/material',
                        '@mui/icons-material',
                        '@emotion/react',
                        '@emotion/styled',
                    ],
                    socket: ['socket.io-client'],
                },
            },
        },
    },
});
