import { defineConfig } from '@playwright/test'

const port = 4179

const root = `http://127.0.0.1:${port}/pinkroad/`

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: root,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  },
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: root,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
