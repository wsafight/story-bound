import express, { type Express } from 'express'
import { config } from '../config'

export function installJsonBodyParsing(target: Express) {
  const standardJson = express.json({ limit: config.maxJsonBodyBytes })
  const storyDraftJson = express.json({ limit: config.maxStoryDraftBytes })
  target.post('/api/story-cards', storyDraftJson)
  target.post('/api/story-cards/generate', storyDraftJson)
  target.post('/api/story-cards/lint', storyDraftJson)
  target.post('/api/story-cards/import/json', storyDraftJson)
  target.patch('/api/story-cards/:id', storyDraftJson)
  target.use(standardJson)
}
