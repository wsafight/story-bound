import type { Context } from '@deepseek-ai/cordis'
import type { Express } from 'express'
import {
  closeChapterSchema,
  createStateSuggestionSchema,
  forkConversationSchema,
  pinMemorySchema,
  resolveStateSuggestionSchema,
  selectReplyCandidateSchema,
  updateConversationModSchema,
  updateConversationSchema,
  updateConversationStateSchema,
  updateNodeProgressSchema,
  useAbilitySchema,
} from '../../domain/schemas'
import { AppError } from '../../shared/errors'
import { routeParam } from './helpers'

export function registerConversationRoutes(app: Express, ctx: Context) {
  app.get('/api/conversations/:id', (req, res) => {
    const conversation = ctx.conversations.get(routeParam(req, 'id'))
    if (!conversation) throw new AppError(404, 'CONVERSATION_NOT_FOUND', '没有找到这个对话')
    res.json({ conversation })
  })
  app.patch('/api/conversations/:id', (req, res) => {
    const conversation = ctx.conversations.update(routeParam(req, 'id'), updateConversationSchema.parse(req.body))
    res.json({ conversation })
  })
  app.get('/api/conversations/:id/model-health', async (req, res) => {
    res.json({ health: await ctx.conversations.modelHealth(routeParam(req, 'id')) })
  })
  app.post('/api/conversations/:id/memories/toggle', (req, res) => {
    res.json(ctx.conversations.toggleMemory(routeParam(req, 'id'), pinMemorySchema.parse(req.body)))
  })
  app.post('/api/conversations/:id/chapters/close', (req, res) => {
    res.json(ctx.conversations.closeChapter(routeParam(req, 'id'), closeChapterSchema.parse(req.body)))
  })
  app.put('/api/conversations/:id/state', (req, res) => {
    res.json(ctx.conversations.updateState(routeParam(req, 'id'), updateConversationStateSchema.parse(req.body)))
  })
  app.post('/api/conversations/:id/fork', (req, res) => {
    res.status(201).json(ctx.conversations.fork(routeParam(req, 'id'), forkConversationSchema.parse(req.body)))
  })
  app.post('/api/conversations/:id/abilities/use', (req, res) => {
    res.json(ctx.conversations.useAbility(routeParam(req, 'id'), useAbilitySchema.parse(req.body)))
  })
  app.post('/api/conversations/:id/state-suggestions', (req, res) => {
    res.json(
      ctx.conversations.createStateSuggestion(routeParam(req, 'id'), createStateSuggestionSchema.parse(req.body)),
    )
  })
  app.get('/api/conversations/:id/state-suggestions', (req, res) => {
    res.json({ suggestions: ctx.conversations.stateSuggestions(routeParam(req, 'id')) })
  })
  app.get('/api/conversations/:id/state-hints', (req, res) => {
    res.json({ fields: ctx.conversations.stateHints(routeParam(req, 'id')) })
  })
  app.post('/api/conversations/:id/state-suggestions/resolve', (req, res) => {
    res.json(
      ctx.conversations.resolveStateSuggestion(routeParam(req, 'id'), resolveStateSuggestionSchema.parse(req.body)),
    )
  })
  app.get('/api/conversations/:id/lorebook-diagnostics', (req, res) => {
    const currentInput = typeof req.query.input === 'string' ? req.query.input : ''
    res.json({ diagnostics: ctx.conversations.lorebookDiagnostics(routeParam(req, 'id'), currentInput) })
  })
  app.get('/api/conversations/:id/recall-diagnostics', (req, res) => {
    const currentInput = typeof req.query.input === 'string' ? req.query.input : ''
    res.json({ recall: ctx.conversations.recallDiagnostics(routeParam(req, 'id'), currentInput) })
  })
  app.get('/api/conversations/:id/nodes', (req, res) => {
    res.json({ nodes: ctx.conversations.nodes(routeParam(req, 'id')) })
  })
  for (const action of ['activate', 'deactivate', 'complete', 'skip'] as const) {
    app.post(`/api/conversations/:id/nodes/:nodeId/${action}`, (req, res) => {
      res.json(
        ctx.conversations.updateNodeProgress(
          routeParam(req, 'id'),
          routeParam(req, 'nodeId'),
          action,
          updateNodeProgressSchema.parse(req.body),
        ),
      )
    })
  }
  app.get('/api/conversations/:id/export/markdown', (req, res) => {
    const conversationId = routeParam(req, 'id')
    const conversation = ctx.conversations.get(conversationId)
    if (!conversation) throw new AppError(404, 'CONVERSATION_NOT_FOUND', '没有找到这个对话')
    const filename = `${String(conversation.title).replace(/[\\/:*?"<>|]/g, '_') || 'story'}.md`
    res.attachment(filename).type('text/markdown; charset=utf-8').send(ctx.conversations.exportMarkdown(conversationId))
  })
  app.get('/api/conversations/:id/mods', (req, res) => {
    res.json({ mods: ctx.conversations.listMods(routeParam(req, 'id')) })
  })
  app.put('/api/conversations/:id/mods/:modId', (req, res) => {
    res.json(
      ctx.conversations.updateMod(
        routeParam(req, 'id'),
        routeParam(req, 'modId'),
        updateConversationModSchema.parse(req.body),
      ),
    )
  })
  app.get('/api/conversations/:id/messages', (req, res) => {
    const before = typeof req.query.before === 'string' ? req.query.before : undefined
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined
    res.json(ctx.conversations.messages(routeParam(req, 'id'), { before, limit }))
  })
  app.get('/api/conversations/:id/reply-candidates', (req, res) => {
    res.json({ candidates: ctx.conversations.replyCandidates(routeParam(req, 'id')) })
  })
  app.get('/api/conversations/:id/reply-candidates/compare', (req, res) => {
    res.json({ comparison: ctx.conversations.replyCandidateComparison(routeParam(req, 'id')) })
  })
  app.post('/api/conversations/:id/reply-candidates/select', (req, res) => {
    res.json(ctx.conversations.selectReply(routeParam(req, 'id'), selectReplyCandidateSchema.parse(req.body)))
  })
  app.get('/api/conversations/:id/branches', (req, res) => {
    res.json({ branches: ctx.conversations.branches(routeParam(req, 'id')) })
  })
  app.get('/api/conversations/:id/context-preview', async (req, res) => {
    res.json({ context: await ctx.conversations.contextPreview(routeParam(req, 'id')) })
  })
}
