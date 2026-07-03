import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      // The 'server-only' guard is a Next-ism; tests run outside Next.
      'server-only': path.resolve(__dirname, 'src/lib/ai/__tests__/server-only-stub.ts'),
    },
  },
})
