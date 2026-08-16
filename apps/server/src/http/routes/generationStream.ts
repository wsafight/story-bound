import type { Context } from '@deepseek-ai/cordis'
import type { Response } from 'express'
import { config } from '../../config'
import type { GenerationEvent, PreparedGeneration } from '../../services/generationService'
import { AppError } from '../../shared/errors'

function sseWrite(res: Response, event: GenerationEvent) {
  if (res.writableEnded || res.destroyed) return
  res.write(`event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`)
}

export async function streamPrepared(ctx: Context, res: Response, prepared: PreparedGeneration, release: () => void) {
  res.status(200)
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()
  const heartbeat = setInterval(() => {
    if (!res.writableEnded && !res.destroyed) res.write(': keep-alive\n\n')
  }, config.sseHeartbeatMs)
  heartbeat.unref()
  let finished = false
  res.on('close', () => {
    if (!finished) ctx.conversations.cancel(prepared.id)
  })
  try {
    await ctx.conversations.run(prepared, (event) => sseWrite(res, event))
  } finally {
    finished = true
    clearInterval(heartbeat)
    release()
    res.end()
  }
}

export function acquirePermit(ctx: Context) {
  const release = ctx.scheduler.acquire()
  if (!release) throw new AppError(429, 'MODEL_BUSY', '模型正忙，请稍后再试', ctx.scheduler.status())
  return release
}
