import { Database } from 'bun:sqlite'
import { describe, expect, it } from 'bun:test'
import { initializeCurrentSchema } from '../src/db/schema'

describe('SQLite 查询索引', () => {
  it('按消息读取会话事件时使用锚点复合索引', () => {
    const database = new Database(':memory:')
    try {
      initializeCurrentSchema(database)
      const plan = database
        .query<{ detail: string }, [string, string, string]>(`
          EXPLAIN QUERY PLAN
          SELECT * FROM conversation_events
          WHERE conversation_id = ? AND anchor_message_id IN (?, ?)
          ORDER BY created_at ASC
        `)
        .all('conversation-1', 'message-1', 'message-2')

      expect(plan.some(({ detail }) => detail.includes('conversation_events_anchor_idx'))).toBe(true)
    } finally {
      database.close()
    }
  })
})
