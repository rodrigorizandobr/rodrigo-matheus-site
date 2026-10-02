import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    // jsdom + userEvent passa dos 5 s padrão quando a máquina está carregada, e o deploy.sh depende disto
    testTimeout: 20000,
  },
})
