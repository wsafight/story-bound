import type { Context } from '@deepseek-ai/cordis'
import type { Express } from 'express'
import { updateRuntimeModSchema } from '../../domain/schemas'
import { routeParam } from './helpers'

export function registerRuntimeRoutes(app: Express, ctx: Context) {
  app.get('/api/runtime', async (_req, res) => {
    res.json({ runtime: await ctx.runtimeAdmin.status() })
  })
  app.get('/api/prompts', (_req, res) => res.json({ profile: ctx.runtimeAdmin.promptProfile() }))
  app.get('/api/prompts/audit', (_req, res) => res.json({ audit: ctx.runtimeAdmin.promptAudit() }))
  app.get('/api/mods', (_req, res) => res.json({ mods: ctx.runtimeAdmin.listMods() }))
  app.patch('/api/mods/:id', async (req, res) => {
    res.json({ mod: await ctx.runtimeAdmin.updateMod(routeParam(req, 'id'), updateRuntimeModSchema.parse(req.body)) })
  })
}
