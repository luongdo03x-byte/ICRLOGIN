import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@icrlogin/core', '@icrlogin/shared'] })],
    build: { rollupOptions: { external: ['better-sqlite3'] } }
  },
  preload: { plugins: [externalizeDepsPlugin({ exclude: ['@icrlogin/shared'] })] },
  renderer: { plugins: [react()] }
});
