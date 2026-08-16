import type { Context } from '@deepseek-ai/cordis'
import type { Express } from 'express'
import { createModelProviderSchema, updateModelProviderSchema } from '../../domain/schemas'
import { routeParam } from './helpers'

export function registerProviderRoutes(app: Express, ctx: Context) {
  app.get('/api/models', async (_req, res) => {
    res.json({ health: await ctx.providers.health(), scheduler: ctx.scheduler.status() })
  })
  app.get('/api/model-providers', (_req, res) => res.json({ providers: ctx.providers.list() }))
  app.get('/api/model-providers/:id/health', async (req, res) => {
    res.json({ health: await ctx.providers.health(routeParam(req, 'id')) })
  })
  app.post('/api/model-providers', async (req, res) => {
    const provider = await ctx.providers.create(createModelProviderSchema.parse(req.body))
    res.status(201).json({ provider })
  })
  app.patch('/api/model-providers/:id', async (req, res) => {
    res.json({
      provider: await ctx.providers.update(routeParam(req, 'id'), updateModelProviderSchema.parse(req.body)),
    })
  })
  app.post('/api/model-providers/:id/default', (req, res) => {
    res.json({ provider: ctx.providers.setDefault(routeParam(req, 'id')) })
  })
  app.post('/api/model-providers/:id/check', async (req, res) => {
    res.json({ health: await ctx.providers.health(routeParam(req, 'id'), true) })
  })
  app.delete('/api/model-providers/:id', (req, res) => {
    ctx.providers.delete(routeParam(req, 'id'))
    res.status(204).end()
  })
}
