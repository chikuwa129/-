import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 動作確認用に、JS/CSS をすべて1つの HTML に埋め込んだ版を作る（PWA 機能なし）
export default defineConfig({
  mode: 'artifact',
  base: './',
  plugins: [react()],
  resolve: {
    alias: { 'virtual:pwa-register': '/src/pwa-stub.ts' },
  },
  build: {
    outDir: 'dist-single',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
