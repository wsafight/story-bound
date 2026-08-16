import { rmSync } from 'node:fs'

const testId = `${process.pid}`
const testDbPath = `/tmp/storybound-tests-${testId}.db`
const testDataDir = `/tmp/storybound-tests-data-${testId}`

process.env.NODE_ENV = 'test'
process.env.DB_PATH = testDbPath
process.env.DATA_DIR = testDataDir
process.env.LLM_CONNECT_TIMEOUT_MS = '100'
process.env.LLM_FIRST_TOKEN_TIMEOUT_MS = '100'
process.env.LLM_IDLE_TIMEOUT_MS = '100'

process.once('exit', () => {
  for (const suffix of ['', '-wal', '-shm']) rmSync(`${testDbPath}${suffix}`, { force: true })
  rmSync(testDataDir, { recursive: true, force: true })
})
