import type { Database } from 'bun:sqlite'
import { db } from '../../db/connection'
import { getStory } from '../../repositories/stories'
import { AppError } from '../../shared/errors'

export function exportStoryPackage(storyId: string, database: Database = db) {
  const story = getStory(storyId, true, database)
  if (!story) throw new AppError(404, 'STORY_NOT_FOUND', '没有找到这张故事卡')
  return {
    format: 'storybound.story-card',
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    compatibility: {
      minimumStoryboundVersion: '0.1.0',
      includesMediaFiles: false,
    },
    story,
  }
}
