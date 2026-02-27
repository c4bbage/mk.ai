/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // 将重依赖拆分成独立 chunk，减少首屏体积
          'cm': ['@codemirror/view', '@codemirror/state', '@codemirror/lang-markdown', '@codemirror/commands', '@codemirror/search', '@codemirror/language'],
          'md': ['marked', 'marked-highlight', 'highlight.js'],
          'viz': ['mermaid', 'katex'],
        },
      },
    },
  },
  optimizeDeps: {
    include: [
      '@codemirror/view', '@codemirror/state', '@codemirror/lang-markdown', '@codemirror/commands', '@codemirror/search', '@codemirror/language',
      'marked', 'marked-highlight', 'highlight.js',
      'mermaid', 'katex',
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
