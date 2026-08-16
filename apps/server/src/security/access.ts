import { timingSafeEqual } from 'node:crypto'
import { isIP } from 'node:net'
import type { NextFunction, Request, Response } from 'express'
import { AppError } from '../shared/errors'

export function isLoopbackHost(value: string) {
  const host = value.toLowerCase().replace(/^\[|\]$/g, '')
  if (host === 'localhost' || host === '::1' || host === '0:0:0:0:0:0:0:1') return true
  if (isIP(host) !== 4) return false
  return host.startsWith('127.')
}

export function assertAccessConfiguration(host: string, accessToken: string) {
  if (!isLoopbackHost(host) && !accessToken) {
    throw new Error('ACCESS_TOKEN must be set when HOST is not a loopback address')
  }
}

export function hasValidAccessToken(authorization: string | undefined, accessToken: string) {
  if (!accessToken) return true
  if (!authorization?.startsWith('Bearer ')) return false
  const supplied = Buffer.from(authorization.slice('Bearer '.length), 'utf8')
  const expected = Buffer.from(accessToken, 'utf8')
  const comparable = supplied.length === expected.length ? supplied : Buffer.alloc(expected.length)
  return timingSafeEqual(comparable, expected) && supplied.length === expected.length
}

export function createAccessMiddleware(accessToken: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (hasValidAccessToken(req.get('authorization'), accessToken)) return next()
    res.setHeader('WWW-Authenticate', 'Bearer realm="Storybound"')
    return next(new AppError(401, 'ACCESS_DENIED', '访问令牌无效或缺失'))
  }
}
