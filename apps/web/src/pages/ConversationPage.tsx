import { useParams } from '@tanstack/react-router'
import { useRef } from 'react'
import { cx, ui } from '../shared/ui'
import { ChapterPanel } from './conversation/ChapterPanel'
import { ContextPanel } from './conversation/ContextPanel'
import { ConversationComposerBlock } from './conversation/ConversationComposerBlock'
import { ConversationDiagnosticsPanel } from './conversation/ConversationDiagnosticsPanel'
import { ConversationHeaderBlock } from './conversation/ConversationHeaderBlock'
import { ConversationSidebarBlock } from './conversation/ConversationSidebarBlock'
import { ConversationTimelineBlock } from './conversation/ConversationTimelineBlock'
import { ModPanel } from './conversation/ModPanel'
import { useConversationData } from './conversation/useConversationData'
import { useConversationTimeline } from './conversation/useConversationTimeline'
import { useConversationTools } from './conversation/useConversationTools'
import { useGenerationController } from './conversation/useGenerationController'

export function ConversationPage() {
  const { conversationId } = useParams({ from: '/conversations/$conversationId' })
  const { conversation, setConversation, model, error, setError, loadConversation } =
    useConversationData(conversationId)
  const followLatestRef = useRef<() => void>(() => undefined)
  const generation = useGenerationController({
    conversation,
    setConversation,
    loadConversation,
    setError,
    onFollowLatest: () => followLatestRef.current(),
  })
  const timeline = useConversationTimeline({
    conversation,
    setConversation,
    streamingText: generation.streamingText,
    setError,
  })
  followLatestRef.current = timeline.scrollToLatest

  const {
    draft,
    setDraft,
    mode,
    setMode,
    streamingText,
    generationId,
    editing,
    selectingCandidateId,
    submit,
    onComposerKeyDown,
    stop,
    retryLast,
    regenerate,
    selectReplyCandidate,
    beginEdit,
    cancelEdit,
  } = generation
  const { timelineRef, showLatest, loadingOlder, onTimelineScroll, scrollToLatest, loadOlderMessages } = timeline
  const tools = useConversationTools({
    conversationId,
    conversation,
    currentInput: draft,
    setConversation,
    generationId,
    loadConversation,
    setError,
    setDraft,
    setMode,
  })
  const {
    mods,
    modDrafts,
    showMods,
    setShowMods,
    updatingMod,
    showContext,
    setShowContext,
    contextPreview,
    panelLoading,
    diagnosticsLoading,
    showDiagnostics,
    setShowDiagnostics,
    stateSuggestions,
    stateHints,
    lorebookDiagnostics,
    recallDiagnostics,
    nodes,
    branches,
    replyCandidateComparison,
    showChapter,
    setShowChapter,
    chapterTitle,
    setChapterTitle,
    chapterSummary,
    setChapterSummary,
    savingChapter,
    toggleMemory,
    openChapterDialog,
    finishChapter,
    editState,
    useAbility,
    createStateSuggestion,
    resolveStateSuggestion,
    forkFromMessage,
    openModPanel,
    applyMod,
    updateModDraft,
    openContextInspector,
    openDiagnosticsPanel,
    updateNodeProgress,
    promptDialog,
  } = tools

  if (!conversation)
    return (
      <div className={cx(ui.page, 'grid min-h-64 place-items-center text-muted')}>{error || '正在恢复故事现场…'}</div>
    )
  const readOnly = conversation.status !== 'active'
  const lastMessage = conversation.messages.at(-1)
  const waitingForRetry = !readOnly && !generationId && lastMessage?.sender === 'player'

  return (
    <div className="flex h-[calc(100dvh-60px)] min-h-[560px] flex-col overflow-hidden bg-[#f0f3f0]">
      <ConversationHeaderBlock
        conversation={conversation}
        model={model}
        readOnly={readOnly}
        generationId={generationId}
        onChapter={openChapterDialog}
        onContext={() => void openContextInspector()}
        onDiagnostics={() => void openDiagnosticsPanel()}
        onMods={() => void openModPanel()}
        onError={setError}
      />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="relative flex min-h-0 min-w-0 flex-col">
          {!model?.online && model && (
            <div className="flex items-baseline gap-2.5 border-b border-[#dfc4bd] bg-[#f0dfdb] px-[22px] py-[9px] text-xs text-[#6d3c34]">
              <span className="shrink-0 font-bold whitespace-nowrap">模型 Provider 未连接</span>
              <p className="m-0 truncate">{model.reason}。你仍可查看存档，发送的内容也会先保存。</p>
            </div>
          )}
          {readOnly && (
            <div className="flex items-baseline gap-2.5 border-b border-[#d4d4cd] bg-[#e8e8e3] px-[22px] py-[9px] text-xs text-[#555b57]">
              <span className="shrink-0 font-bold whitespace-nowrap">这个存档已归档</span>
              <p className="m-0 truncate">当前为只读状态；恢复存档后可以继续故事。</p>
            </div>
          )}
          <ConversationTimelineBlock
            conversation={conversation}
            timelineRef={timelineRef}
            generationId={generationId}
            streamingText={streamingText}
            loadingOlder={loadingOlder}
            waitingForRetry={waitingForRetry}
            showLatest={showLatest}
            error={error}
            selectingCandidateId={selectingCandidateId}
            onScroll={onTimelineScroll}
            onLoadOlder={() => void loadOlderMessages()}
            onScrollLatest={scrollToLatest}
            onToggleMemory={(message) => void toggleMemory(message)}
            onBeginEdit={beginEdit}
            onRegenerate={() => void regenerate()}
            onSelectCandidate={(candidate) => void selectReplyCandidate(candidate)}
            onRetry={() => void retryLast()}
            onFork={(message) => void forkFromMessage(message)}
          />
          <ConversationComposerBlock
            readOnly={readOnly}
            editing={editing}
            mode={mode}
            draft={draft}
            generationId={generationId}
            onSubmit={submit}
            onCancelEdit={cancelEdit}
            onModeChange={setMode}
            onDraftChange={setDraft}
            onKeyDown={onComposerKeyDown}
            onStop={() => void stop()}
          />
        </section>
        <ConversationSidebarBlock
          conversation={conversation}
          readOnly={readOnly}
          generationId={generationId}
          onAbility={useAbility}
          onEditState={() => void editState()}
          onCreateSuggestion={() => void createStateSuggestion()}
          onResolveSuggestion={(suggestionId, accept) => void resolveStateSuggestion(suggestionId, accept)}
          onChapter={openChapterDialog}
        />
      </div>
      <ModPanel
        open={showMods}
        loading={panelLoading}
        conversation={conversation}
        mods={mods}
        drafts={modDrafts}
        generationId={generationId}
        updatingMod={updatingMod}
        onClose={() => setShowMods(false)}
        onApply={(mod, enabled) => void applyMod(mod, enabled)}
        onDraftChange={updateModDraft}
      />
      <ContextPanel
        open={showContext}
        loading={panelLoading}
        context={contextPreview}
        onClose={() => setShowContext(false)}
      />
      <ConversationDiagnosticsPanel
        open={showDiagnostics}
        loading={diagnosticsLoading}
        readOnly={readOnly}
        generationId={generationId}
        conversation={conversation}
        stateSuggestions={stateSuggestions}
        stateHints={stateHints}
        lorebookDiagnostics={lorebookDiagnostics}
        recall={recallDiagnostics}
        nodes={nodes}
        branches={branches}
        comparison={replyCandidateComparison}
        onClose={() => setShowDiagnostics(false)}
        onResolveSuggestion={(suggestionId, accept) => void resolveStateSuggestion(suggestionId, accept)}
        onNodeAction={(nodeId, action) => void updateNodeProgress(nodeId, action)}
      />
      <ChapterPanel
        open={showChapter}
        title={chapterTitle}
        summary={chapterSummary}
        saving={savingChapter}
        onTitleChange={setChapterTitle}
        onSummaryChange={setChapterSummary}
        onSubmit={finishChapter}
        onClose={() => setShowChapter(false)}
      />
      {promptDialog}
    </div>
  )
}
