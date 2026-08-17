import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import express, { type Express, type NextFunction, type Request, type Response } from 'express'
import { config } from './config'
import { installJsonBodyParsing } from './http/jsonBody'
import { appRequestId, installRequestContext, requestDurationMs } from './http/requestContext'
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
import { writeStructuredLog } from './shared/logger'

function routeLabel(req: Request) {
  return String(req.originalUrl || req.url || '').split('?')[0] || 'unknown'
}

function generationIdFromRequest(req: Request) {
  const params = req.params as Record<string, string | undefined>
  if (params.generationId) return params.generationId
  if (routeLabel(req).startsWith('/api/generations/') && params.id) return params.id
  return null
}

export function createApp(ctx: Context): Express {
  const app = express()
  app.disable('x-powered-by')
  installRequestContext(app)
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

  app.use((error: unknown, req: Request, res: Response, _next: NextFunction) => {
    const requestId = appRequestId(res)
    const normalized = toErrorBody(error, requestId)
    writeStructuredLog({
      level: 'error',
      message: 'http_request_failed',
      route: routeLabel(req),
      method: req.method,
      status: normalized.status,
      errorCode: String(normalized.body.error.code),
      appRequestId: requestId,
      generationId: generationIdFromRequest(req),
      durationMs: requestDurationMs(res),
    })
    if (res.headersSent) return res.end()
    res.status(normalized.status).json(normalized.body)
  })
  return app
}
