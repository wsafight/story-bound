import type { Context } from '@deepseek-ai/cordis'
import type { Express } from 'express'
import { createConversationSchema, generateStoryDraftSchema, storyDraftSchema } from '../../domain/schemas'
import { AppError } from '../../shared/errors'
import { acquirePermit } from './generationStream'
import { routeParam } from './helpers'

export function registerStoryRoutes(app: Express, ctx: Context) {
  app.get('/api/story-cards', (_req, res) => res.json({ stories: ctx.stories.list() }))
  app.post('/api/story-cards/lint', (req, res) => {
    const draft = storyDraftSchema.parse(req.body)
    res.json({ issues: ctx.stories.lint(draft) })
  })
  app.post('/api/story-cards/import/json', (req, res) => {
    const result = ctx.stories.importPackage(req.body)
    res.status(result.story ? 201 : 200).json(result)
  })
  app.post('/api/story-cards', (req, res) => {
    const draft = storyDraftSchema.parse(req.body)
    const story = ctx.stories.create(draft)
    res.status(201).json({ story, issues: ctx.stories.lint(storyDraftSchema.parse(story)) })
  })
  app.post('/api/story-cards/generate', async (req, res) => {
    const release = acquirePermit(ctx)
    const controller = new AbortController()
    const abort = () => {
      if (!res.writableEnded) controller.abort()
    }
    res.on('close', abort)
    try {
      const result = await ctx.stories.generate(generateStoryDraftSchema.parse(req.body), controller.signal)
      res.status(201).json(result)
    } finally {
      res.off('close', abort)
      release()
    }
  })
  app.get('/api/story-cards/:id', (req, res) => {
    const story = ctx.stories.get(routeParam(req, 'id'))
    if (!story) throw new AppError(404, 'STORY_NOT_FOUND', '没有找到这张故事卡')
    res.json({ story })
  })
  app.get('/api/story-cards/:id/editor', (req, res) => {
    const story = ctx.stories.get(routeParam(req, 'id'), true)
    if (!story) throw new AppError(404, 'STORY_NOT_FOUND', '没有找到这张故事卡')
    res.json({ story })
  })
  app.get('/api/story-cards/:id/export/json', (req, res) => {
    const storyId = routeParam(req, 'id')
    const story = ctx.stories.get(storyId, true)
    if (!story) throw new AppError(404, 'STORY_NOT_FOUND', '没有找到这张故事卡')
    const filename = `${String(story.title).replace(/[\\/:*?"<>|]/g, '_') || 'story'}.storybound.json`
    res
      .attachment(filename)
      .type('application/json; charset=utf-8')
      .send(JSON.stringify(ctx.stories.exportPackage(storyId), null, 2))
  })
  app.patch('/api/story-cards/:id', (req, res) => {
    const story = ctx.stories.update(routeParam(req, 'id'), storyDraftSchema.parse(req.body))
    res.json({ story, issues: ctx.stories.lint(storyDraftSchema.parse(story)) })
  })
  app.post('/api/story-cards/:id/publish', (req, res) => res.json(ctx.stories.publish(routeParam(req, 'id'))))
  app.post('/api/story-cards/:id/duplicate', (req, res) => {
    res.status(201).json({ story: ctx.stories.duplicate(routeParam(req, 'id')) })
  })
  app.delete('/api/story-cards/:id', (req, res) => {
    ctx.stories.delete(routeParam(req, 'id'))
    res.status(204).end()
  })
  app.get('/api/story-cards/:id/conversations', (req, res) => {
    const storyId = routeParam(req, 'id')
    if (!ctx.stories.get(storyId)) throw new AppError(404, 'STORY_NOT_FOUND', '没有找到这张故事卡')
    res.json({ conversations: ctx.stories.listConversations(storyId) })
  })
  app.post('/api/story-cards/:id/conversations', (req, res) => {
    const conversation = ctx.conversations.create(routeParam(req, 'id'), createConversationSchema.parse(req.body))
    res.status(201).json({ conversation })
  })
}
