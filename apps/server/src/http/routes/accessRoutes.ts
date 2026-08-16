import type { Context } from '@deepseek-ai/cordis'
import type { Express } from 'express'
import { config } from '../../config'
import { isLoopbackHost } from '../../security/access'

export function registerAccessRoutes(app: Express, _ctx: Context) {
  app.get('/api/access', (_req, res) => {
    res.json({ access: { protected: Boolean(config.accessToken), networkExposed: !isLoopbackHost(config.host) } })
  })
}
