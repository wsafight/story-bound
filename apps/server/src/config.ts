import { existsSync } from 'node:fs'
import path from 'node:path'

const workspaceRoot = path.resolve(import.meta.dir, '../../..')
const rootDir = existsSync(path.join(workspaceRoot, 'package.json')) ? workspaceRoot : process.cwd()

function intFromEnv(name: string, fallback: number, minimum = 1) {
  const value = Number(process.env[name])
  return Number.isSafeInteger(value) && value >= minimum ? value : fallback
}

export const config = {
  host: process.env.HOST || '127.0.0.1',
  port: intFromEnv('PORT', 3001),
  accessToken: process.env.ACCESS_TOKEN || '',
  dbPath: path.resolve(rootDir, process.env.DB_PATH || './data/story.db'),
  dataDir: path.resolve(rootDir, process.env.DATA_DIR || './data'),
  webDistPath: path.resolve(rootDir, process.env.WEB_DIST_PATH || './apps/web/dist'),
  llmBaseUrl: (process.env.LLM_BASE_URL || 'http://127.0.0.1:8000/v1').replace(/\/$/, ''),
  llmApiKey: process.env.LLM_API_KEY || 'local-ds4',
  llmModel: process.env.LLM_MODEL || 'deepseek-v4-flash',
  llmConnectTimeoutMs: intFromEnv('LLM_CONNECT_TIMEOUT_MS', 5_000),
  llmFirstTokenTimeoutMs: intFromEnv('LLM_FIRST_TOKEN_TIMEOUT_MS', 30_000),
  llmIdleTimeoutMs: intFromEnv('LLM_IDLE_TIMEOUT_MS', 120_000),
  modelHealthCacheTtlMs: intFromEnv('MODEL_HEALTH_CACHE_TTL_MS', 30_000, 1_000),
  runtimeMaintenanceIntervalMs: intFromEnv('RUNTIME_MAINTENANCE_INTERVAL_MS', 60_000, 1_000),
  providerHealthIntervalMs: intFromEnv('PROVIDER_HEALTH_INTERVAL_MS', 0, 10_000),
  autoBackupIntervalMs: intFromEnv('AUTO_BACKUP_INTERVAL_MS', 0, 60_000),
  llmMaxConcurrency: intFromEnv('LLM_MAX_CONCURRENCY', 1),
  sseHeartbeatMs: intFromEnv('SSE_HEARTBEAT_MS', 15_000, 1_000),
  shutdownTimeoutMs: intFromEnv('SHUTDOWN_TIMEOUT_MS', 10_000, 1_000),
  maxJsonBodyBytes: intFromEnv('MAX_JSON_BODY_BYTES', 32 * 1_024),
  maxStoryDraftBytes: intFromEnv('MAX_STORY_DRAFT_BYTES', 1 * 1_024 * 1_024),
  maxMessageChars: intFromEnv('MAX_MESSAGE_CHARS', 8_000),
  maxContextTokens: intFromEnv('MAX_CONTEXT_TOKENS', 32_768, 1_024),
  reservedOutputTokens: intFromEnv('RESERVED_OUTPUT_TOKENS', 2_048, 64),
  isProduction: process.env.NODE_ENV === 'production',
}
