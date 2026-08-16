import { db } from '../../db/connection'
import { parseJson } from '../../repositories/conversations'
import { type ConversationRow, requireConversation } from './guards'

export function exportConversationMarkdown(conversationId: string) {
  const conversation = requireConversation(conversationId)
  const card = parseJson<Record<string, any>>(conversation.card_snapshot_json, {})
  const player = parseJson<Record<string, any>>(conversation.player_snapshot_json, {})
  const state = parseJson<Record<string, any>>(conversation.state_json, {})
  const characters = new Map(
    (Array.isArray(card.characters) ? card.characters : []).map((item: any) => [String(item.id), String(item.name)]),
  )
  const chapters = new Map(
    (
      db
        .query('SELECT id, number, title FROM chapters WHERE conversation_id = ?')
        .all(conversationId) as ConversationRow[]
    ).map((row) => [String(row.id), { number: Number(row.number), title: String(row.title) }]),
  )
  const messages = db
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
    .all(String(conversation.active_leaf_message_id), conversationId, conversationId) as ConversationRow[]

  const lines = [
    `# ${String(conversation.title)}`,
    '',
    `> 故事：${card.title || ''}`,
    `> 玩家：${player.name || ''}（${player.roleName || ''}）`,
    `> 导出时间：${new Date().toISOString()}`,
    '',
  ]
  let chapterId = ''
  for (const message of messages) {
    if (String(message.chapter_id) !== chapterId) {
      chapterId = String(message.chapter_id)
      const chapter = chapters.get(chapterId)
      lines.push(`## ${chapter?.title || `第 ${chapter?.number || ''} 章`}`, '')
    }
    const speaker =
      message.sender === 'player'
        ? String(player.name || '玩家')
        : message.character_id
          ? characters.get(String(message.character_id)) || '人物'
          : '旁白'
    lines.push(`**${speaker}**`, '', String(message.content), '')
  }
  const summaries = Array.isArray(state.custom?.chapterSummaries) ? state.custom.chapterSummaries : []
  if (summaries.length > 0) {
    lines.push('## 章节回顾', '')
    for (const item of summaries) lines.push(`### ${item.title}`, '', String(item.summary), '')
  }
  return `${lines.join('\n').trim()}\n`
}
