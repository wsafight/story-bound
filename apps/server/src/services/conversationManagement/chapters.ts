import { db, newId, nowIso } from '../../db/connection'
import type { CloseChapterInput } from '../../domain/schemas'
import { parseJson } from '../../repositories/conversations'
import { AppError } from '../../shared/errors'
import { type ConversationRow, insertConversationEvent, requireCheckpoint, writeStateCheckpoint } from './guards'

export function closeChapter(conversationId: string, input: CloseChapterInput) {
  return db.transaction(() => {
    const { conversation, checkpoint } = requireCheckpoint(
      conversationId,
      input.expectedLeafMessageId,
      input.expectedCheckpointId,
    )
    const chapter = db
      .query("SELECT * FROM chapters WHERE id = ? AND conversation_id = ? AND status = 'active'")
      .get(String(conversation.current_chapter_id), conversationId) as ConversationRow | null
    if (!chapter) throw new AppError(409, 'CHAPTER_NOT_ACTIVE', '当前章节已经结束')

    const timestamp = nowIso()
    const nextChapterId = newId()
    const nextNumber = Number(chapter.number) + 1
    const state = parseJson<Record<string, any>>(conversation.state_json, {})
    const custom = state.custom && typeof state.custom === 'object' ? { ...state.custom } : {}
    const summaries = Array.isArray(custom.chapterSummaries) ? [...custom.chapterSummaries] : []
    summaries.push({
      chapterId: String(chapter.id),
      number: Number(chapter.number),
      title: input.title,
      summary: input.summary,
      closedAt: timestamp,
    })
    custom.chapterSummaries = summaries.slice(-50)
    state.custom = custom

    db.query("UPDATE chapters SET title = ?, status = 'completed' WHERE id = ? AND conversation_id = ?").run(
      input.title,
      String(chapter.id),
      conversationId,
    )
    db.query(
      "INSERT INTO chapters (id, conversation_id, number, title, status, created_at) VALUES (?, ?, ?, ?, 'active', ?)",
    ).run(nextChapterId, conversationId, nextNumber, `第 ${nextNumber} 章`, timestamp)
    const checkpointId = writeStateCheckpoint({
      conversationId,
      parentCheckpointId: input.expectedCheckpointId,
      anchorMessageId: input.expectedLeafMessageId,
      checkpoint,
      state,
      timestamp,
    })
    db.query('UPDATE conversations SET current_chapter_id = ? WHERE id = ?').run(nextChapterId, conversationId)
    insertConversationEvent({
      conversationId,
      anchorMessageId: input.expectedLeafMessageId,
      checkpointId,
      kind: 'chapter_closed',
      payload: {
        chapterId: String(chapter.id),
        title: input.title,
        summary: input.summary,
        nextChapterId,
      },
      timestamp,
    })
    return {
      activeCheckpointId: checkpointId,
      currentChapter: { id: nextChapterId, number: nextNumber, title: `第 ${nextNumber} 章`, status: 'active' },
      state,
      updatedAt: timestamp,
    }
  })()
}
