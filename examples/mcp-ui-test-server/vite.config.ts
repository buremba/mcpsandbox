import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  root: __dirname,
  server: {
    port: 3458,
    cors: true,
  },
  resolve: {
    alias: {
      '@onemcp/widget-react': resolve(__dirname, '../../packages/widget-react/src'),
    },
  },
});
