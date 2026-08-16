import { config } from './config'
import {
  forceStopStoryboundApplication,
  startStoryboundApplication,
  stopStoryboundApplication,
} from './runtime/applicationRuntime'
import { disposeStoryboundRuntime } from './runtime/storyboundRuntime'
import { assertAccessConfiguration } from './security/access'

assertAccessConfiguration(config.host, config.accessToken)
await startStoryboundApplication()

let shuttingDown = false

async function shutdown(signal: NodeJS.Signals) {
  if (shuttingDown) return
  shuttingDown = true
  const deadline = setTimeout(() => {
    console.error(`Graceful shutdown timed out after ${config.shutdownTimeoutMs}ms (${signal})`)
    forceStopStoryboundApplication()
    process.exit(1)
  }, config.shutdownTimeoutMs)
  deadline.unref()
  let exitCode = 0
  try {
    await stopStoryboundApplication()
    await disposeStoryboundRuntime()
  } catch (error) {
    exitCode = 1
    console.error('Failed to dispose Storybound runtime', error)
  }
  clearTimeout(deadline)
  process.exit(exitCode)
}

process.once('SIGINT', () => void shutdown('SIGINT'))
process.once('SIGTERM', () => void shutdown('SIGTERM'))
