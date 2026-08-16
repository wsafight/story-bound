import type { UpdateNodeProgressInput } from '../../domain/schemas'
import { parseJson } from '../../repositories/conversations'
import { AppError } from '../../shared/errors'
import { requireConversation } from './guards'
import {
  type NodeAction,
  nodeReachabilityDiagnostic,
  resolveNodeStatus,
  transitionNodeStatus,
} from './nodeStateMachine'
import { commitStateMutation, customRecord } from './stateMutations'

type JsonRecord = Record<string, any>

function storyNodes(conversation: JsonRecord) {
  const story = parseJson<JsonRecord>(conversation.card_snapshot_json, {})
  return Array.isArray(story.nodes) ? story.nodes : []
}

function progressRecord(state: JsonRecord, nodeId: string) {
  const custom = customRecord(state)
  return custom.nodeProgress && typeof custom.nodeProgress === 'object' && !Array.isArray(custom.nodeProgress)
    ? custom.nodeProgress[nodeId]
    : null
}

export function getConversationNodeDiagnostics(conversationId: string) {
  const conversation = requireConversation(conversationId)
  const state = parseJson<JsonRecord>(conversation.state_json, {})
  return storyNodes(conversation).map((node) => {
    const diagnostic = nodeReachabilityDiagnostic(node, state)
    const progress = progressRecord(state, String(node.id))
    return {
      nodeId: String(node.id),
      title: String(node.title || '未命名节点'),
      status: diagnostic.status,
      enabled: node.enabled !== false,
      conditionMatched: diagnostic.conditionMatched,
      prompt: String(node.prompt || ''),
      description: String(node.description || ''),
      updatedAt: progress?.updatedAt ? String(progress.updatedAt) : null,
      availableActions: diagnostic.availableActions,
      blockedReason: diagnostic.blockedReason,
      reachability: diagnostic.reachability,
    }
  })
}

export function updateConversationNodeProgress(
  conversationId: string,
  nodeId: string,
  action: NodeAction,
  input: UpdateNodeProgressInput,
) {
  return commitStateMutation(conversationId, input, ({ conversation, state, timestamp }) => {
    const nodes = storyNodes(conversation)
    const node = nodes.find((item) => String(item.id) === nodeId)
    if (!node) throw new AppError(404, 'NODE_NOT_FOUND', '没有找到这个故事节点')
    const beforeStatus = resolveNodeStatus(node, state)
    const transition = transitionNodeStatus(beforeStatus, action)
    if (!transition.allowed || !transition.toStatus) {
      throw new AppError(409, 'NODE_ACTION_UNAVAILABLE', '当前节点状态不允许执行这个操作')
    }
    const custom = customRecord(state)
    const nodeProgress =
      custom.nodeProgress && typeof custom.nodeProgress === 'object' && !Array.isArray(custom.nodeProgress)
        ? { ...custom.nodeProgress }
        : {}
    nodeProgress[nodeId] = {
      status: transition.toStatus,
      updatedAt: timestamp,
      anchorMessageId: input.expectedLeafMessageId,
    }
    custom.nodeProgress = nodeProgress
    state.custom = custom

    return {
      kind: 'node_progress_updated',
      payload: {
        nodeId,
        nodeTitle: String(node.title || ''),
        action,
        fromStatus: beforeStatus,
        toStatus: transition.toStatus,
        note: input.note || '',
        availableActions: transition.availableActions,
      },
    }
  })
}
