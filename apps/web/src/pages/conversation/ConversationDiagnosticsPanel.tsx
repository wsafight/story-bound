import type {
  Conversation,
  ConversationBranch,
  LorebookDiagnostic,
  NodeDiagnostic,
  RecallQualityReport,
  ReplyCandidateComparison,
  StateFieldHint,
  StateSuggestionItem,
} from '@storybound/shared'
import { Check, CheckCircle2, GitBranch, Pause, Play, SearchCheck, SkipForward, X } from 'lucide-react'
import { useState } from 'react'
import { buttonClass, cx, noticeClass, ui } from '../../shared/ui'
import { panelEmptyClass, ToolPanel, toolPanelBodyClass } from './ToolPanel'

type PanelTab = 'state' | 'nodes' | 'recall' | 'branches'
type NodeAction = 'activate' | 'deactivate' | 'complete' | 'skip'

interface ConversationDiagnosticsPanelProps {
  open: boolean
  loading: boolean
  readOnly: boolean
  generationId: string | null
  conversation: Conversation
  stateSuggestions: StateSuggestionItem[]
  stateHints: StateFieldHint[]
  lorebookDiagnostics: LorebookDiagnostic[]
  recall: RecallQualityReport | null
  nodes: NodeDiagnostic[]
  branches: ConversationBranch | null
  comparison: ReplyCandidateComparison | null
  onClose: () => void
  onResolveSuggestion: (suggestionId: string, accept: boolean) => void
  onNodeAction: (nodeId: string, action: NodeAction) => void
}

const tabLabels: Record<PanelTab, string> = {
  state: '状态',
  nodes: '节点',
  recall: '召回',
  branches: '分支',
}

const nodeActionLabels: Record<NodeAction, string> = {
  activate: '激活',
  deactivate: '取消',
  complete: '完成',
  skip: '跳过',
}

const statusLabels: Record<string, string> = {
  pending: '待处理',
  accepted: '已接受',
  rejected: '已拒绝',
  locked: '锁定',
  available: '可用',
  active: '进行中',
  completed: '已完成',
  skipped: '已跳过',
}

const reasonLabels: Record<string, string> = {
  matched: '命中',
  query_empty: '无检索词',
  disabled: '已停用',
  scope_not_matched: '作用域不符',
  condition_not_matched: '条件不符',
  keyword_not_matched: '关键词未命中',
  low_relevance: '相关性低',
}

function formatValue(value: unknown) {
  if (value === undefined) return '未设置'
  if (value === null) return 'null'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function NodeActionIcon({ action }: { action: NodeAction }) {
  if (action === 'activate') return <Play size={13} />
  if (action === 'deactivate') return <Pause size={13} />
  if (action === 'complete') return <CheckCircle2 size={13} />
  return <SkipForward size={13} />
}

export function ConversationDiagnosticsPanel({
  open,
  loading,
  readOnly,
  generationId,
  conversation,
  stateSuggestions,
  stateHints,
  lorebookDiagnostics,
  recall,
  nodes,
  branches,
  comparison,
  onClose,
  onResolveSuggestion,
  onNodeAction,
}: ConversationDiagnosticsPanelProps) {
  const [tab, setTab] = useState<PanelTab>('state')
  const disabled = readOnly || Boolean(generationId)
  const activeBranchNodes = branches?.nodes.filter((node) => node.onActivePath) || []
  const branchPoints = branches?.branchPoints || []
  const pendingSuggestions = stateSuggestions.filter((suggestion) => suggestion.status === 'pending')
  const matchedRecall = recall?.diagnostics.filter((item) => item.matched) || []

  return (
    <ToolPanel open={open} eyebrow="Story Diagnostics" title="故事诊断" ariaLabel="故事诊断" onClose={onClose}>
      <div className="grid grid-cols-4 border-b border-line bg-[#edf1ed] p-2">
        {(Object.keys(tabLabels) as PanelTab[]).map((item) => (
          <button
            className={cx(
              'min-h-8 cursor-pointer rounded border-0 bg-transparent text-xs text-muted hover:bg-white/70 hover:text-ink',
              tab === item && 'bg-surface font-bold text-green shadow-[inset_0_0_0_1px_var(--color-line)]',
            )}
            type="button"
            key={item}
            onClick={() => setTab(item)}
          >
            {tabLabels[item]}
          </button>
        ))}
      </div>
      <div className={toolPanelBodyClass}>
        {loading && <div className={panelEmptyClass}>正在读取诊断数据…</div>}
        {!loading && tab === 'state' && (
          <div className="grid gap-5">
            <section>
              <h3 className="mt-0 mb-3 text-[11px] text-muted uppercase">状态建议</h3>
              {stateSuggestions.length === 0 ? (
                <div className={panelEmptyClass}>没有状态建议。</div>
              ) : (
                <div className="grid gap-2.5">
                  {stateSuggestions.map((suggestion) => (
                    <article className="rounded border border-line bg-surface p-3" key={suggestion.id}>
                      <header className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <strong className="block truncate text-sm">{suggestion.title}</strong>
                          <small className="text-muted">
                            {statusLabels[suggestion.status] || suggestion.status} · {suggestion.source}
                          </small>
                        </div>
                        {suggestion.status === 'pending' && (
                          <span className="flex shrink-0 gap-1">
                            <button
                              className={cx(ui.iconButton, 'size-7 bg-green-soft text-green')}
                              type="button"
                              disabled={disabled}
                              onClick={() => onResolveSuggestion(suggestion.id, true)}
                              title="接受建议"
                              aria-label="接受建议"
                            >
                              <Check size={13} />
                            </button>
                            <button
                              className={cx(ui.iconButton, 'size-7 bg-red-soft text-red')}
                              type="button"
                              disabled={disabled}
                              onClick={() => onResolveSuggestion(suggestion.id, false)}
                              title="拒绝建议"
                              aria-label="拒绝建议"
                            >
                              <X size={13} />
                            </button>
                          </span>
                        )}
                      </header>
                      {suggestion.summary && (
                        <p className="my-2 text-xs leading-[1.6] text-muted">{suggestion.summary}</p>
                      )}
                      {suggestion.diff.length > 0 && (
                        <dl className="mt-2 grid gap-1.5 text-[11px]">
                          {suggestion.diff.slice(0, 8).map((diff) => (
                            <div className="grid gap-1 border-t border-[#ece9df] pt-2" key={diff.path}>
                              <dt className="font-mono text-muted">{diff.path}</dt>
                              <dd className="m-0 grid grid-cols-2 gap-2 [overflow-wrap:anywhere]">
                                <span>{formatValue(diff.before)}</span>
                                <strong>{formatValue(diff.after)}</strong>
                              </dd>
                            </div>
                          ))}
                        </dl>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
            <section>
              <h3 className="mt-0 mb-3 text-[11px] text-muted uppercase">字段边界</h3>
              <div className="grid gap-1.5">
                {stateHints.map((field) => (
                  <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-b border-line py-2" key={field.path}>
                    <span className="min-w-0">
                      <strong className="block truncate text-xs">{field.label}</strong>
                      <small className="font-mono text-[10px] text-muted">{field.path}</small>
                    </span>
                    <em className="text-right text-[10px] not-italic text-muted">
                      {field.protectedReason || (field.storyEditable ? '可编辑' : '受限')}
                    </em>
                  </div>
                ))}
              </div>
            </section>
            {pendingSuggestions.length > 0 && (
              <div className={noticeClass(false)}>{pendingSuggestions.length} 条状态建议等待确认。</div>
            )}
          </div>
        )}
        {!loading && tab === 'nodes' && (
          <div className="grid gap-2.5">
            {nodes.length === 0 && <div className={panelEmptyClass}>当前故事没有节点。</div>}
            {nodes.map((node) => (
              <article className="rounded border border-line bg-surface p-3" key={node.nodeId}>
                <header className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <strong className="block truncate text-sm">{node.title}</strong>
                    <small className="text-muted">
                      {statusLabels[node.status] || node.status} · {node.conditionMatched ? '条件满足' : '条件未满足'}
                    </small>
                  </div>
                  <span className="flex shrink-0 flex-wrap justify-end gap-1">
                    {node.availableActions.map((action) => (
                      <button
                        className={cx(ui.iconButton, 'size-7 bg-[#edf1ed]')}
                        type="button"
                        key={action}
                        disabled={disabled}
                        onClick={() => onNodeAction(node.nodeId, action)}
                        title={nodeActionLabels[action]}
                        aria-label={nodeActionLabels[action]}
                      >
                        <NodeActionIcon action={action} />
                      </button>
                    ))}
                  </span>
                </header>
                {node.description && <p className="my-2 text-xs leading-[1.6] text-muted">{node.description}</p>}
                {node.blockedReason && <small className="text-[10px] text-red">{node.blockedReason}</small>}
              </article>
            ))}
          </div>
        )}
        {!loading && tab === 'recall' && (
          <div className="grid gap-5">
            <section>
              <h3 className="mt-0 mb-3 flex items-center gap-1.5 text-[11px] text-muted uppercase">
                <SearchCheck size={14} /> 召回质量
              </h3>
              {recall?.warnings.map((warning) => (
                <div className={noticeClass(false, 'mb-2')} key={warning}>
                  {warning}
                </div>
              ))}
              {!recall || recall.diagnostics.length === 0 ? (
                <div className={panelEmptyClass}>没有召回候选。</div>
              ) : (
                <div className="grid gap-2">
                  {(matchedRecall.length > 0 ? matchedRecall : recall.diagnostics.slice(0, 8)).map((item) => (
                    <article className="rounded border border-line bg-surface p-3" key={`${item.source}:${item.id}`}>
                      <header className="flex items-start justify-between gap-2">
                        <strong className="min-w-0 truncate text-sm">{item.title}</strong>
                        <em className="font-mono text-[10px] not-italic text-green">
                          {Math.round(item.relevanceScore * 100)}%
                        </em>
                      </header>
                      <small className="text-muted">
                        {item.boundary} · {item.reasons.map((reason) => reasonLabels[reason] || reason).join('、')}
                      </small>
                      {item.contentPreview && (
                        <p className="my-2 text-xs leading-[1.6] text-muted">{item.contentPreview}</p>
                      )}
                      {item.matchedTerms.length > 0 && (
                        <p className="m-0 text-[10px] text-green">命中：{item.matchedTerms.slice(0, 8).join('、')}</p>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
            <section>
              <h3 className="mt-0 mb-3 text-[11px] text-muted uppercase">Lorebook</h3>
              <div className="grid gap-1.5">
                {lorebookDiagnostics.map((entry) => (
                  <div
                    className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-b border-line py-2"
                    key={entry.entryId}
                  >
                    <span className="min-w-0">
                      <strong className="block truncate text-xs">{entry.title}</strong>
                      <small className="text-muted">
                        {entry.scope} · {entry.reasons.map((reason) => reasonLabels[reason] || reason).join('、')}
                      </small>
                    </span>
                    <em className={cx('text-[10px] not-italic', entry.matched ? 'text-green' : 'text-muted')}>
                      {entry.matched ? '命中' : '未命中'}
                    </em>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
        {!loading && tab === 'branches' && (
          <div className="grid gap-5">
            <section>
              <h3 className="mt-0 mb-3 flex items-center gap-1.5 text-[11px] text-muted uppercase">
                <GitBranch size={14} /> 分支树
              </h3>
              {!branches || branches.nodes.length === 0 ? (
                <div className={panelEmptyClass}>还没有分支数据。</div>
              ) : (
                <div className="grid gap-1.5">
                  {branches.nodes.slice(-24).map((node) => (
                    <div
                      className={cx(
                        'grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-b border-line py-2 text-xs',
                        node.onActivePath ? 'text-ink' : 'text-muted',
                      )}
                      style={{ paddingLeft: Math.min(node.depth * 10, 60) }}
                      key={node.message.id}
                    >
                      <span className="min-w-0 truncate">
                        {node.message.sender === 'player' ? conversation.player.name : '故事'}：{node.message.content}
                      </span>
                      <em className="text-[10px] not-italic text-muted">
                        {node.isActiveLeaf ? '当前' : node.childCount > 1 ? `${node.childCount} 分支` : ''}
                      </em>
                    </div>
                  ))}
                </div>
              )}
              {branchPoints.length > 0 && (
                <p className="mb-0 text-[11px] text-muted">分叉点：{branchPoints.length} 个</p>
              )}
              {activeBranchNodes.length > 0 && (
                <p className="mb-0 text-[11px] text-muted">当前路径：{activeBranchNodes.length} 条消息</p>
              )}
            </section>
            <section>
              <h3 className="mt-0 mb-3 text-[11px] text-muted uppercase">候选比较</h3>
              {!comparison || comparison.candidates.length === 0 ? (
                <div className={panelEmptyClass}>当前没有可比较候选。</div>
              ) : (
                <div className="grid gap-2">
                  {comparison.candidates.map((candidate) => (
                    <article className="rounded border border-line bg-surface p-3" key={candidate.id}>
                      <header className="flex items-center justify-between gap-2">
                        <strong className="text-xs">版本 {candidate.siblingIndex}</strong>
                        <small className="text-muted">
                          {candidate.isActive ? '当前采用' : candidate.selectable ? '可切换' : candidate.blockedReason}
                        </small>
                      </header>
                      <p className="my-2 text-xs leading-[1.7] text-muted">{candidate.contentPreview}</p>
                      <small className="font-mono text-[10px] text-muted">{candidate.estimatedTokens} tokens</small>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
        {!loading && tab === 'state' && (
          <button className={buttonClass('secondary', 'mt-5 w-full')} type="button" onClick={onClose}>
            关闭
          </button>
        )}
      </div>
    </ToolPanel>
  )
}
