import { nodeProgressStatus } from '../prompt/dynamics'
import { storyConditionMatches } from '../storyConditions'

type JsonRecord = Record<string, any>

export type NodeAction = 'activate' | 'deactivate' | 'complete' | 'skip'
export type NodeStatus = 'locked' | 'available' | 'active' | 'completed' | 'skipped'
export type NodeBlockedReason = 'disabled' | 'condition_not_matched' | 'terminal' | 'action_unavailable' | null

const transitions: Record<NodeStatus, Partial<Record<NodeAction, NodeStatus>>> = {
  locked: {},
  available: {
    activate: 'active',
    complete: 'completed',
    skip: 'skipped',
  },
  active: {
    deactivate: 'available',
    complete: 'completed',
    skip: 'skipped',
  },
  completed: {},
  skipped: {},
}

export function availableNodeActions(status: NodeStatus) {
  return Object.keys(transitions[status]) as NodeAction[]
}

export function resolveNodeStatus(node: JsonRecord, state: JsonRecord): NodeStatus {
  const progress = nodeProgressStatus(state, String(node.id))
  if (progress === 'active' || progress === 'completed' || progress === 'skipped') return progress
  if (node.enabled === false) return 'locked'
  return storyConditionMatches(node.condition, state) ? 'available' : 'locked'
}

export function nodeBlockedReason(node: JsonRecord, state: JsonRecord, status = resolveNodeStatus(node, state)) {
  if (status === 'completed' || status === 'skipped') return 'terminal' as const
  if (status !== 'locked') return null
  return node.enabled === false ? ('disabled' as const) : ('condition_not_matched' as const)
}

export function transitionNodeStatus(status: NodeStatus, action: NodeAction) {
  const toStatus = transitions[status][action] || null
  return {
    allowed: Boolean(toStatus),
    fromStatus: status,
    toStatus,
    action,
    availableActions: availableNodeActions(status),
    blockedReason: toStatus ? null : ('action_unavailable' as const),
  }
}

export function nodeReachabilityDiagnostic(node: JsonRecord, state: JsonRecord) {
  const status = resolveNodeStatus(node, state)
  const conditionMatched = storyConditionMatches(node.condition, state)
  const blockedReason = nodeBlockedReason(node, state, status)
  const availableActions = availableNodeActions(status)
  return {
    status,
    conditionMatched,
    availableActions,
    blockedReason,
    reachability: {
      reachable: availableActions.length > 0,
      terminal: status === 'completed' || status === 'skipped',
      blockedReasons: blockedReason ? [blockedReason] : [],
      transitions: availableActions.map((action) => ({
        action,
        toStatus: transitions[status][action]!,
      })),
    },
  }
}
