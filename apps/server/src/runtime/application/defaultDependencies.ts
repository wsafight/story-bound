import type { Server } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { createApp } from '../../app'
import { config } from '../../config'
import { db } from '../../db/connection'
import { initializeDatabase } from '../../db/initialize'
import { cancelAllGenerations } from '../../services/generationService'
import { startTrustedMods } from '../../services/modService'
import { startGenerationMonitoring, stopGenerationMonitoring } from '../monitoringRuntime'
import { stopManagedStoryboundPlugins } from '../storyboundRuntime'
import type { ApplicationRuntimeDependencies } from './types'

function listenWithExpress(ctx: Context) {
  return new Promise<Server>((resolve, reject) => {
    const server = createApp(ctx).listen(config.port, config.host)
    const onError = (error: Error) => reject(error)
    server.once('error', onError)
    server.once('listening', () => {
      server.off('error', onError)
      console.log(`Story server listening on http://${config.host}:${config.port}`)
      resolve(server)
    })
  })
}

function closeHttpServer(server: Server) {
  if (!server.listening) return Promise.resolve()
  return new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
    server.closeIdleConnections?.()
  })
}

export const defaultApplicationDependencies: ApplicationRuntimeDependencies = {
  database: db,
  initializeDatabase,
  closeDatabase: () => db.close(),
  startTrustedMods,
  stopTrustedMods: stopManagedStoryboundPlugins,
  startMonitoring: startGenerationMonitoring,
  stopMonitoring: stopGenerationMonitoring,
  cancelAllGenerations,
  startHttpServer: listenWithExpress,
  stopHttpServer: closeHttpServer,
  forceStopHttpServer(server) {
    server.closeAllConnections?.()
    server.close()
  },
}
