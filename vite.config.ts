/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          'cm': ['@codemirror/view', '@codemirror/state', '@codemirror/lang-markdown', '@codemirror/commands', '@codemirror/search', '@codemirror/language'],
          'md': ['marked', 'marked-highlight', 'highlight.js'],
          'katex': ['katex'],
          'html2canvas': ['html2canvas'],
        },
      },
    },
  },
  optimizeDeps: {
    include: [
      '@codemirror/view', '@codemirror/state', '@codemirror/lang-markdown', '@codemirror/commands', '@codemirror/search', '@codemirror/language',
      'marked', 'marked-highlight', 'highlight.js',
    ],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
