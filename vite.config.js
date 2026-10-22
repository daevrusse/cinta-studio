import { defineConfig } from 'vite';

export default defineConfig({
  optimizeDeps: { exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util', '@huggingface/transformers'] },
  worker: { format: 'es' },
  build: { target: 'es2022', chunkSizeWarningLimit: 5000 },
});
