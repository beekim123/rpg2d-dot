import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { cpSync, existsSync } from 'node:fs';
export default defineConfig({
  base: './',
  plugins: [{ name: 'astra-art', closeBundle() { if (existsSync('art/export')) cpSync('art/export', 'dist/art/export', { recursive: true }); cpSync('third_party', 'dist/third_party', { recursive: true }); } }],
  build: { rollupOptions: { input: { game: resolve('index.html'), workbench: resolve('workbench/index.html') } } },
});
