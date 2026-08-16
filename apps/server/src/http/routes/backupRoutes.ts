import type { Context } from '@deepseek-ai/cordis'
import type { Express } from 'express'
import { routeParam } from './helpers'

export function registerBackupRoutes(app: Express, ctx: Context) {
  app.get('/api/backups', (_req, res) => res.json({ backups: ctx.backups.list() }))
  app.post('/api/backups', (_req, res) => res.status(201).json({ backup: ctx.backups.create() }))
  app.post('/api/backups/:name/restore', (req, res) => {
    res.json({ restore: ctx.backups.restore(routeParam(req, 'name')) })
  })
  app.get('/api/backups/:name/download', (req, res, next) => {
    const name = routeParam(req, 'name')
    res.download(ctx.backups.path(name), name, (error) => {
      if (error && !res.headersSent) next(error)
    })
  })
}
