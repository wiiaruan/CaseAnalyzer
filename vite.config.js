import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/CaseAnalyzer/',
  plugins: [react()],
  server: {
    port: 5173,
    cors: true,
  },
});
