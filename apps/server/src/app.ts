import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import { config } from './config'
import { installJsonBodyParsing } from './http/jsonBody'
import {
  registerAccessRoutes,
  registerBackupRoutes,
  registerConversationRoutes,
  registerGenerationRoutes,
  registerProviderRoutes,
  registerRuntimeRoutes,
  registerStoryRoutes,
} from './http/routes'
import { createAccessMiddleware } from './security/access'
import { toErrorBody } from './shared/errors'

export function createApp(ctx: Context): Express {
  const app = express()
  app.disable('x-powered-by')
  app.use('/api', createAccessMiddleware(config.accessToken))
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })
  installJsonBodyParsing(app)

  registerAccessRoutes(app, ctx)
  registerStoryRoutes(app, ctx)
  registerConversationRoutes(app, ctx)
  registerGenerationRoutes(app, ctx)
  registerProviderRoutes(app, ctx)
  registerRuntimeRoutes(app, ctx)
  registerBackupRoutes(app, ctx)

  if (config.isProduction) {
    const dist = config.webDistPath
    app.use(express.static(dist))
    app.get(/.*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')))
  }

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return res.end()
    const normalized = toErrorBody(error)
    res.status(normalized.status).json(normalized.body)
  })
  return app
}
