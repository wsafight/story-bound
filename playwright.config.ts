import { defineConfig, devices } from '@playwright/test'

function resolvePort() {
  const explicit = Number(process.env.E2E_PORT)
  if (Number.isSafeInteger(explicit) && explicit > 0) return explicit
  return 51_731
}

const port = resolvePort()
const e2eDataDir = `/tmp/storybound-e2e-${process.pid}`

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: process.env.CI ? 'bun apps/server/src/index.ts' : 'bun run build && bun apps/server/src/index.ts',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      DB_PATH: `${e2eDataDir}/story.db`,
      DATA_DIR: e2eDataDir,
      HOST: '127.0.0.1',
      PORT: String(port),
      LLM_CONNECT_TIMEOUT_MS: '100',
    },
    url: `http://127.0.0.1:${port}/api/access`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
