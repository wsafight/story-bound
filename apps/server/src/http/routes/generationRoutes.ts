import type { Context } from '@deepseek-ai/cordis'
import type { Express } from 'express'
import { editAndRetrySchema, regenerateSchema, retrySchema, sendMessageSchema } from '../../domain/schemas'
import { acquirePermit, streamPrepared } from './generationStream'
import { routeParam } from './helpers'

export function registerGenerationRoutes(app: Express, ctx: Context) {
  app.post('/api/conversations/:id/messages', async (req, res) => {
    const release = acquirePermit(ctx)
    try {
      await streamPrepared(
        ctx,
        res,
        ctx.conversations.prepareSend(routeParam(req, 'id'), sendMessageSchema.parse(req.body)),
        release,
      )
    } catch (error) {
      release()
      throw error
    }
  })
  app.post('/api/messages/:id/retry', async (req, res) => {
    const release = acquirePermit(ctx)
    try {
      const input = retrySchema.parse(req.body)
      await streamPrepared(
        ctx,
        res,
        ctx.conversations.prepareRetry(routeParam(req, 'id'), input.expectedLeafMessageId),
        release,
      )
    } catch (error) {
      release()
      throw error
    }
  })
  app.post('/api/conversations/:id/regenerate', async (req, res) => {
    const release = acquirePermit(ctx)
    try {
      await streamPrepared(
        ctx,
        res,
        ctx.conversations.prepareRegenerate(routeParam(req, 'id'), regenerateSchema.parse(req.body)),
        release,
      )
    } catch (error) {
      release()
      throw error
    }
  })
  app.post('/api/messages/:id/edit-and-retry', async (req, res) => {
    const release = acquirePermit(ctx)
    try {
      await streamPrepared(
        ctx,
        res,
        ctx.conversations.prepareEdit(routeParam(req, 'id'), editAndRetrySchema.parse(req.body)),
        release,
      )
    } catch (error) {
      release()
      throw error
    }
  })
  app.get('/api/generations/:id', (req, res) => {
    res.json({ generation: ctx.conversations.generation(routeParam(req, 'id')) })
  })
  app.post('/api/generations/:id/cancel', (req, res) => {
    res.json(ctx.conversations.cancel(routeParam(req, 'id')))
  })
}
