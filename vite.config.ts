/// <reference types="vitest/config" />
import preact from '@preact/preset-vite'
import { defineConfig } from 'vite'

export default defineConfig(({ mode }) => ({
  base: '/pinkroad/',
  plugins: [preact()],
  build: {
    outDir: mode === 'staging' ? 'dist-staging' : 'dist',
    emptyOutDir: true,
  },
  server: {
    host: true,
    port: 5173,
  },
  preview: {
    host: true,
    port: 4173,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
}))
