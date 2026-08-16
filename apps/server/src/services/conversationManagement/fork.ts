import { db, newId, nowIso } from '../../db/connection'
import type { ForkConversationInput } from '../../domain/schemas'
import { getConversationView, parseJson } from '../../repositories/conversations'
import { AppError } from '../../shared/errors'
import { insertConversationEvent, requireConversation } from './guards'

type Row = Record<string, unknown>

function activePathToMessage(conversationId: string, activeLeafMessageId: string, targetMessageId: string) {
  const rows = db
    .query(`
      WITH RECURSIVE active_path AS (
        SELECT * FROM messages WHERE id = ? AND conversation_id = ?
        UNION ALL
        SELECT parent.* FROM messages parent
        JOIN active_path ON parent.id = active_path.parent_message_id
        WHERE parent.conversation_id = ?
      )
      SELECT * FROM active_path ORDER BY tree_depth ASC
    `)
    .all(activeLeafMessageId, conversationId, conversationId) as Row[]
  const targetIndex = rows.findIndex((row) => row.id === targetMessageId)
  if (targetIndex < 0) throw new AppError(422, 'MESSAGE_NOT_ON_ACTIVE_PATH', '只能从当前采用路径上的历史消息派生')
  return rows.slice(0, targetIndex + 1)
}

export function forkConversation(conversationId: string, input: ForkConversationInput) {
  return db.transaction(() => {
    const source = requireConversation(conversationId)
    if (!source.active_leaf_message_id) throw new AppError(409, 'CONVERSATION_EMPTY', '这个存档没有可派生的消息')
    const path = activePathToMessage(conversationId, String(source.active_leaf_message_id), input.messageId)
    const target = path.at(-1)!
    const targetCheckpointId = target.runtime_checkpoint_id ? String(target.runtime_checkpoint_id) : ''
    if (!targetCheckpointId) throw new AppError(409, 'CHECKPOINT_UNAVAILABLE', '目标消息缺少运行时检查点')

    const nextConversationId = newId()
    const timestamp = nowIso()
    const title = input.title || `${String(source.title)} 分支`
    const messageIdMap = new Map<string, string>()
    const chapterIdMap = new Map<string, string>()
    const checkpointIdMap = new Map<string, string>()

    const sourceChapters = db
      .query('SELECT * FROM chapters WHERE conversation_id = ? ORDER BY number ASC')
      .all(conversationId) as Row[]
    const pathChapterIds = new Set(path.map((message) => String(message.chapter_id)))
    db.query(`
      INSERT INTO conversations (
        id, story_card_id, title, card_version, card_snapshot_json, player_snapshot_json,
        ability_snapshot_json, scene_snapshot_json, model_config_json, state_json, mod_snapshot_json,
        current_chapter_id, active_leaf_message_id, active_checkpoint_id,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', '{}', NULL, NULL, NULL, 'active', ?, ?)
    `).run(
      nextConversationId,
      source.story_card_id ? String(source.story_card_id) : null,
      title,
      Number(source.card_version),
      String(source.card_snapshot_json),
      String(source.player_snapshot_json),
      String(source.ability_snapshot_json),
      String(source.scene_snapshot_json),
      String(source.model_config_json || '{}'),
      timestamp,
      timestamp,
    )

    for (const chapter of sourceChapters.filter((chapter) => pathChapterIds.has(String(chapter.id)))) {
      const nextChapterId = newId()
      chapterIdMap.set(String(chapter.id), nextChapterId)
      db.query(`
        INSERT INTO chapters (id, conversation_id, number, title, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        nextChapterId,
        nextConversationId,
        Number(chapter.number),
        String(chapter.title || ''),
        String(chapter.id) === String(target.chapter_id) ? 'active' : 'completed',
        timestamp,
      )
    }

    for (const message of path) {
      const nextMessageId = newId()
      const nextChapterId = chapterIdMap.get(String(message.chapter_id))
      if (!nextChapterId) throw new AppError(409, 'CHAPTER_UNAVAILABLE', '无法复制消息所属章节')
      messageIdMap.set(String(message.id), nextMessageId)
      db.query(`
        INSERT INTO messages (
          id, conversation_id, chapter_id, client_message_id, parent_message_id, generation_id,
          runtime_checkpoint_id, sender, character_id, input_mode, content, tree_depth, created_at
        ) VALUES (?, ?, ?, NULL, ?, NULL, NULL, ?, ?, ?, ?, ?, ?)
      `).run(
        nextMessageId,
        nextConversationId,
        nextChapterId,
        message.parent_message_id ? messageIdMap.get(String(message.parent_message_id)) || null : null,
        String(message.sender),
        message.character_id ? String(message.character_id) : null,
        message.input_mode ? String(message.input_mode) : null,
        String(message.content),
        Number(message.tree_depth),
        timestamp,
      )
    }

    const cloneCheckpoint = (checkpointId: string): string => {
      const cached = checkpointIdMap.get(checkpointId)
      if (cached) return cached
      const checkpoint = db
        .query('SELECT * FROM runtime_checkpoints WHERE id = ? AND conversation_id = ?')
        .get(checkpointId, conversationId) as Row | null
      if (!checkpoint) throw new AppError(409, 'CHECKPOINT_UNAVAILABLE', '无法复制运行时检查点')
      const nextCheckpointId = newId()
      checkpointIdMap.set(checkpointId, nextCheckpointId)
      const parentCheckpointId = checkpoint.parent_checkpoint_id
        ? cloneCheckpoint(String(checkpoint.parent_checkpoint_id))
        : null
      const anchorMessageId =
        messageIdMap.get(String(checkpoint.anchor_message_id)) || messageIdMap.get(String(target.id))
      if (!anchorMessageId) throw new AppError(409, 'MESSAGE_PATH_INCOMPLETE', '无法复制检查点锚点')
      db.query(`
        INSERT INTO runtime_checkpoints (
          id, conversation_id, parent_checkpoint_id, anchor_message_id,
          state_json, ability_snapshot_json, mod_snapshot_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        nextCheckpointId,
        nextConversationId,
        parentCheckpointId,
        anchorMessageId,
        String(checkpoint.state_json),
        String(checkpoint.ability_snapshot_json),
        String(checkpoint.mod_snapshot_json || '{}'),
        timestamp,
      )
      return nextCheckpointId
    }

    for (const message of path) {
      if (!message.runtime_checkpoint_id) continue
      const nextCheckpointId = cloneCheckpoint(String(message.runtime_checkpoint_id))
      const nextMessageId = messageIdMap.get(String(message.id))
      if (!nextMessageId) throw new AppError(409, 'MESSAGE_PATH_INCOMPLETE', '无法复制消息检查点')
      db.query('UPDATE messages SET runtime_checkpoint_id = ? WHERE id = ?').run(nextCheckpointId, nextMessageId)
    }

    const nextActiveLeafId = messageIdMap.get(String(target.id))!
    const nextActiveCheckpointId = cloneCheckpoint(targetCheckpointId)
    const activeCheckpoint = db
      .query('SELECT * FROM runtime_checkpoints WHERE id = ? AND conversation_id = ?')
      .get(nextActiveCheckpointId, nextConversationId) as Row
    const stateJson = String(activeCheckpoint.state_json)
    const abilitySnapshotJson = String(activeCheckpoint.ability_snapshot_json)
    const modSnapshotJson = String(activeCheckpoint.mod_snapshot_json || '{}')
    db.query(`
      UPDATE conversations
      SET current_chapter_id = ?, active_leaf_message_id = ?, active_checkpoint_id = ?, state_json = ?,
          ability_snapshot_json = ?, mod_snapshot_json = ?, updated_at = ?
      WHERE id = ?
    `).run(
      chapterIdMap.get(String(target.chapter_id)) || null,
      nextActiveLeafId,
      nextActiveCheckpointId,
      stateJson,
      abilitySnapshotJson,
      modSnapshotJson,
      timestamp,
      nextConversationId,
    )

    const modSnapshot = parseJson<Record<string, any>>(modSnapshotJson, {})
    for (const [modId, snapshot] of Object.entries(modSnapshot)) {
      db.query(`
        INSERT OR IGNORE INTO conversation_mods (
          conversation_id, mod_id, enabled, config_json, activated_at, updated_at
        ) VALUES (?, ?, 1, ?, ?, ?)
      `).run(nextConversationId, modId, JSON.stringify(snapshot.config || {}), timestamp, timestamp)
    }

    insertConversationEvent({
      conversationId,
      anchorMessageId: input.messageId,
      checkpointId: targetCheckpointId,
      kind: 'conversation_forked',
      payload: { childConversationId: nextConversationId, title },
      timestamp,
    })
    insertConversationEvent({
      conversationId: nextConversationId,
      anchorMessageId: nextActiveLeafId,
      checkpointId: nextActiveCheckpointId,
      kind: 'conversation_forked',
      payload: { sourceConversationId: conversationId, sourceMessageId: input.messageId },
      timestamp,
    })

    const next = getConversationView(nextConversationId)
    if (!next) throw new AppError(500, 'FORK_FAILED', '派生存档创建失败')
    return next
  })()
}
