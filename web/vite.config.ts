import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

export default defineConfig(({ mode }) => {
  const envWebPath = path.resolve(__dirname, '..', '.env.web');
  const envPath = path.resolve(__dirname, '..', '.env');

  if (fs.existsSync(envWebPath)) {
    dotenv.config({ path: envWebPath });
  } else if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }

  return {
    plugins: [react()],
    envPrefix: 'VITE_',
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: process.env.VITE_BOT_API_URL || 'http://localhost:2020',
          changeOrigin: true,
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  };
});
