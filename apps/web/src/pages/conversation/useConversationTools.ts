import {
  apiContracts,
  type Conversation,
  type ConversationMod,
  type InputMode,
  type ModConfigField,
  type StoryMessage,
} from '@storybound/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { type Dispatch, type FormEvent, type SetStateAction, useEffect, useState } from 'react'
import { api, post } from '../../app/apiClient'
import { apiQueryKey, apiQueryOptions } from '../../app/apiQueries'

interface ConversationToolsOptions {
  conversationId: string
  conversation: Conversation | null
  currentInput: string
  setConversation: Dispatch<SetStateAction<Conversation | null>>
  generationId: string | null
  loadConversation: () => Promise<Conversation>
  setError: (message: string) => void
  setDraft: Dispatch<SetStateAction<string>>
  setMode: Dispatch<SetStateAction<InputMode>>
}

export function useConversationTools({
  conversationId,
  conversation,
  currentInput,
  setConversation,
  generationId,
  loadConversation,
  setError,
  setDraft,
  setMode,
}: ConversationToolsOptions) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [modDrafts, setModDrafts] = useState<Record<string, Record<string, unknown>>>({})
  const [showMods, setShowMods] = useState(false)
  const [updatingMod, setUpdatingMod] = useState<string | null>(null)
  const [showContext, setShowContext] = useState(false)
  const [showDiagnostics, setShowDiagnostics] = useState(false)
  const [showChapter, setShowChapter] = useState(false)
  const [chapterTitle, setChapterTitle] = useState('')
  const [chapterSummary, setChapterSummary] = useState('')
  const [savingChapter, setSavingChapter] = useState(false)
  const modsContract = apiContracts.conversationMods(conversationId)
  const stateSuggestionsContract = apiContracts.stateSuggestions(conversationId)
  const stateHintsContract = apiContracts.stateHints(conversationId)
  const lorebookDiagnosticsContract = apiContracts.lorebookDiagnostics(conversationId, currentInput)
  const recallDiagnosticsContract = apiContracts.recallDiagnostics(conversationId, currentInput)
  const nodesContract = apiContracts.nodes(conversationId)
  const branchesContract = apiContracts.branches(conversationId)
  const replyCandidateComparisonContract = apiContracts.replyCandidateComparison(conversationId)
  const modsQuery = useQuery({
    ...apiQueryOptions(modsContract),
    enabled: showMods,
  })
  const contextQuery = useQuery({
    ...apiQueryOptions(apiContracts.contextPreview(conversationId), 0),
    enabled: showContext,
  })
  const stateSuggestionsQuery = useQuery({
    ...apiQueryOptions(stateSuggestionsContract, 0),
    enabled: showDiagnostics,
  })
  const stateHintsQuery = useQuery({
    ...apiQueryOptions(stateHintsContract, 0),
    enabled: showDiagnostics,
  })
  const lorebookDiagnosticsQuery = useQuery({
    ...apiQueryOptions(lorebookDiagnosticsContract, 0),
    enabled: showDiagnostics,
  })
  const recallDiagnosticsQuery = useQuery({
    ...apiQueryOptions(recallDiagnosticsContract, 0),
    enabled: showDiagnostics,
  })
  const nodesQuery = useQuery({
    ...apiQueryOptions(nodesContract, 0),
    enabled: showDiagnostics,
  })
  const branchesQuery = useQuery({
    ...apiQueryOptions(branchesContract, 0),
    enabled: showDiagnostics,
  })
  const replyCandidateComparisonQuery = useQuery({
    ...apiQueryOptions(replyCandidateComparisonContract, 0),
    enabled: showDiagnostics,
  })
  const mods = modsQuery.data?.mods || []
  const contextPreview = contextQuery.data?.context || null
  const stateSuggestions = stateSuggestionsQuery.data?.suggestions || []
  const stateHints = stateHintsQuery.data?.fields || []
  const lorebookDiagnostics = lorebookDiagnosticsQuery.data?.diagnostics || []
  const recallDiagnostics = recallDiagnosticsQuery.data?.recall || null
  const nodes = nodesQuery.data?.nodes || []
  const branches = branchesQuery.data?.branches || null
  const replyCandidateComparison = replyCandidateComparisonQuery.data?.comparison || null
  const panelLoading = (showMods && modsQuery.isFetching) || (showContext && contextQuery.isFetching)
  const diagnosticsLoading =
    showDiagnostics &&
    (stateSuggestionsQuery.isFetching ||
      stateHintsQuery.isFetching ||
      lorebookDiagnosticsQuery.isFetching ||
      recallDiagnosticsQuery.isFetching ||
      nodesQuery.isFetching ||
      branchesQuery.isFetching ||
      replyCandidateComparisonQuery.isFetching)

  useEffect(() => {
    if (!modsQuery.data) return
    setModDrafts(Object.fromEntries(modsQuery.data.mods.map((mod) => [mod.id, { ...mod.config }])))
  }, [modsQuery.data])

  useEffect(() => {
    const panelError =
      modsQuery.error ||
      contextQuery.error ||
      stateSuggestionsQuery.error ||
      stateHintsQuery.error ||
      lorebookDiagnosticsQuery.error ||
      recallDiagnosticsQuery.error ||
      nodesQuery.error ||
      branchesQuery.error ||
      replyCandidateComparisonQuery.error
    if (panelError) setError(panelError instanceof Error ? panelError.message : '无法读取面板数据')
  }, [
    branchesQuery.error,
    contextQuery.error,
    lorebookDiagnosticsQuery.error,
    modsQuery.error,
    nodesQuery.error,
    recallDiagnosticsQuery.error,
    replyCandidateComparisonQuery.error,
    setError,
    stateHintsQuery.error,
    stateSuggestionsQuery.error,
  ])

  function invalidateConversationLists() {
    if (!conversation) return
    void queryClient.invalidateQueries({ queryKey: apiQueryKey(apiContracts.stories()), exact: true })
    void queryClient.invalidateQueries({
      queryKey: apiQueryKey(apiContracts.storyConversations(conversation.story.id)),
      exact: true,
    })
  }

  function activeExpectation() {
    if (!conversation) return null
    return {
      expectedLeafMessageId: conversation.activeLeafMessageId,
      expectedCheckpointId: conversation.activeCheckpointId,
    }
  }

  function invalidateDiagnostics() {
    void queryClient.invalidateQueries({ queryKey: apiQueryKey(stateSuggestionsContract), exact: true })
    void queryClient.invalidateQueries({ queryKey: apiQueryKey(stateHintsContract), exact: true })
    void queryClient.invalidateQueries({ queryKey: apiQueryKey(lorebookDiagnosticsContract), exact: true })
    void queryClient.invalidateQueries({ queryKey: apiQueryKey(recallDiagnosticsContract), exact: true })
    void queryClient.invalidateQueries({ queryKey: apiQueryKey(nodesContract), exact: true })
    void queryClient.invalidateQueries({ queryKey: apiQueryKey(branchesContract), exact: true })
    void queryClient.invalidateQueries({ queryKey: apiQueryKey(replyCandidateComparisonContract), exact: true })
  }

  function parsePromptJson(label: string, initial: Record<string, unknown>) {
    const raw = window.prompt(label, JSON.stringify(initial, null, 2))
    if (raw === null) return null
    try {
      const parsed = JSON.parse(raw)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('需要 JSON 对象')
      return parsed as Record<string, unknown>
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'JSON 格式不正确')
      return null
    }
  }

  async function toggleMemory(message: StoryMessage) {
    if (!conversation || generationId) return
    setError('')
    try {
      const result = await post(apiContracts.toggleMemory(conversation.id), {
        messageId: message.id,
        expectedLeafMessageId: conversation.activeLeafMessageId,
        expectedCheckpointId: conversation.activeCheckpointId,
      })
      setConversation((current) =>
        current
          ? {
              ...current,
              activeCheckpointId: result.activeCheckpointId,
              state: result.state,
              updatedAt: result.updatedAt,
            }
          : current,
      )
      invalidateDiagnostics()
      invalidateConversationLists()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法更新固定记忆')
    }
  }

  function openChapterDialog() {
    if (!conversation) return
    const currentNumber = conversation.currentChapter?.number || 1
    setChapterTitle(conversation.currentChapter?.title || `第 ${currentNumber} 章`)
    setChapterSummary(
      conversation.messages
        .slice(-8)
        .map((message) => message.content)
        .join('\n\n')
        .slice(0, 4_000),
    )
    setShowChapter(true)
  }

  async function finishChapter(event: FormEvent) {
    event.preventDefault()
    if (!conversation || generationId) return
    setSavingChapter(true)
    setError('')
    try {
      const result = await post(apiContracts.closeChapter(conversation.id), {
        title: chapterTitle,
        summary: chapterSummary,
        expectedLeafMessageId: conversation.activeLeafMessageId,
        expectedCheckpointId: conversation.activeCheckpointId,
      })
      setConversation((current) =>
        current
          ? {
              ...current,
              activeCheckpointId: result.activeCheckpointId,
              currentChapter: result.currentChapter,
              state: result.state,
              updatedAt: result.updatedAt,
            }
          : current,
      )
      invalidateDiagnostics()
      invalidateConversationLists()
      setShowChapter(false)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法结束当前章节')
    } finally {
      setSavingChapter(false)
    }
  }

  async function editState() {
    if (!conversation || generationId) return
    const appManaged = new Set([
      'pinnedMemories',
      'chapterSummaries',
      'abilityUses',
      'stateSuggestions',
      'nodeProgress',
    ])
    const current = Object.fromEntries(
      Object.entries(conversation.state.custom || {}).filter(([key]) => !appManaged.has(key)),
    )
    const patch = parsePromptJson('提交自定义状态补丁', current)
    const expected = activeExpectation()
    if (!patch || !expected) return
    setError('')
    try {
      await api(apiContracts.updateConversationState(conversation.id), {
        method: 'PUT',
        body: JSON.stringify({ custom: patch, ...expected }),
      })
      await loadConversation()
      invalidateDiagnostics()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '状态更新失败')
    }
  }

  async function useAbility(abilityId: string) {
    if (!conversation || generationId) return
    const ability = conversation.abilities.find((item) => item.id === abilityId)
    if (!ability) return
    const input = parsePromptJson(`使用「${ability.name}」的输入`, {})
    const expected = activeExpectation()
    if (!input || !expected) return
    setError('')
    try {
      await post(apiContracts.useAbility(conversation.id), { abilityId, input, statePatch: {}, ...expected })
      await loadConversation()
      invalidateDiagnostics()
      setMode('action')
      setDraft((current) => current || `使用「${ability.name}」。`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '能力执行失败')
    }
  }

  async function createStateSuggestion() {
    if (!conversation || generationId) return
    const title = window.prompt('建议标题', '状态变化建议')?.trim()
    if (!title) return
    const patch = parsePromptJson('建议状态 Patch', {})
    const expected = activeExpectation()
    if (!patch || !expected) return
    setError('')
    try {
      await post(apiContracts.createStateSuggestion(conversation.id), {
        title,
        summary: '',
        patch,
        source: 'user',
        ...expected,
      })
      await loadConversation()
      invalidateDiagnostics()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '状态建议创建失败')
    }
  }

  async function resolveStateSuggestion(suggestionId: string, accept: boolean) {
    if (!conversation || generationId) return
    const expected = activeExpectation()
    if (!expected) return
    setError('')
    try {
      await post(apiContracts.resolveStateSuggestion(conversation.id), { suggestionId, accept, ...expected })
      await loadConversation()
      invalidateDiagnostics()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '状态建议处理失败')
    }
  }

  async function forkFromMessage(message: StoryMessage) {
    if (!conversation) return
    const title = window.prompt('派生存档名称', `${conversation.title} 分支`)?.trim()
    if (!title) return
    setError('')
    try {
      const result = await post(apiContracts.forkConversation(conversation.id), { messageId: message.id, title })
      await navigate({ to: '/conversations/$conversationId', params: { conversationId: result.conversation.id } })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '派生存档失败')
    }
  }

  function openModPanel() {
    setShowMods(true)
    setError('')
  }

  async function applyMod(mod: ConversationMod, enabled = mod.active) {
    if (!conversation || generationId) return
    setUpdatingMod(mod.id)
    setError('')
    try {
      await api(apiContracts.updateConversationMod(conversation.id, mod.id), {
        method: 'PUT',
        body: JSON.stringify({
          enabled,
          config: modDrafts[mod.id] || mod.config,
          expectedLeafMessageId: conversation.activeLeafMessageId,
          expectedCheckpointId: conversation.activeCheckpointId,
        }),
      })
      await Promise.all([
        loadConversation(),
        queryClient.invalidateQueries({ queryKey: apiQueryKey(modsContract), exact: true }),
      ])
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'MOD 更新失败')
    } finally {
      setUpdatingMod(null)
    }
  }

  function updateModDraft(mod: ConversationMod, field: ModConfigField, value: string | boolean) {
    setModDrafts((current) => {
      const config = { ...(current[mod.id] || mod.config), [field.key]: value }
      if (field.key === 'perspective') {
        const needsCharacter = value === 'first_character' || value === 'third_character'
        const validCharacter = conversation?.story.characters.some(
          (character) => character.id === config.viewpointCharacterId,
        )
        config.viewpointCharacterId = needsCharacter
          ? validCharacter
            ? config.viewpointCharacterId
            : conversation?.story.characters[0]?.id || null
          : null
      }
      return { ...current, [mod.id]: config }
    })
  }

  function openContextInspector() {
    setShowContext(true)
    setError('')
  }

  function openDiagnosticsPanel() {
    setShowDiagnostics(true)
    setError('')
  }

  async function updateNodeProgress(nodeId: string, action: 'activate' | 'deactivate' | 'complete' | 'skip') {
    if (!conversation || generationId) return
    const expected = activeExpectation()
    if (!expected) return
    setError('')
    try {
      await post(apiContracts.updateNodeProgress(conversation.id, nodeId, action), expected)
      await loadConversation()
      invalidateDiagnostics()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '节点更新失败')
    }
  }

  return {
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
  }
}
