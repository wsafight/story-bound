import { randomUUID } from 'node:crypto'
import type { Express, NextFunction, Request, Response } from 'express'

export const requestIdHeader = 'X-Storybound-Request-Id'

const requestIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,79}$/

function incomingRequestId(req: Request) {
  const value = req.header(requestIdHeader)
  return value && requestIdPattern.test(value) ? value : randomUUID()
}

export function installRequestContext(app: Express) {
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.locals.appRequestId = incomingRequestId(req)
    res.locals.startedAtMs = Date.now()
    res.setHeader(requestIdHeader, res.locals.appRequestId)
    next()
  })
}

export function appRequestId(res: Response) {
  return typeof res.locals.appRequestId === 'string' ? res.locals.appRequestId : randomUUID()
}

export function requestDurationMs(res: Response) {
  const startedAtMs = typeof res.locals.startedAtMs === 'number' ? res.locals.startedAtMs : Date.now()
  return Math.max(0, Date.now() - startedAtMs)
}
