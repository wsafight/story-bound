import {
  apiContracts,
  apiPaths,
  type Conversation,
  type InputMode,
  type ReplyCandidate,
  type StoryMessage,
} from '@storybound/shared'
import { useQuery } from '@tanstack/react-query'
import {
  type Dispatch,
  type FormEvent,
  type KeyboardEvent,
  type SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react'
import { post } from '../../app/apiClient'
import { apiQueryOptions } from '../../app/apiQueries'
import { type StreamEvent, streamPost } from '../../app/sseClient'

interface GenerationControllerOptions {
  conversation: Conversation | null
  setConversation: Dispatch<SetStateAction<Conversation | null>>
  loadConversation: () => Promise<Conversation>
  setError: (message: string) => void
  onFollowLatest: () => void
}

export function useGenerationController({
  conversation,
  setConversation,
  loadConversation,
  setError,
  onFollowLatest,
}: GenerationControllerOptions) {
  const [draft, setDraft] = useState('')
  const [mode, setMode] = useState<InputMode>('dialogue')
  const [streamingText, setStreamingText] = useState('')
  const [generationId, setGenerationId] = useState<string | null>(null)
  const [recoveryGenerationId, setRecoveryGenerationId] = useState<string | null>(null)
  const [editing, setEditing] = useState<StoryMessage | null>(null)
  const [selectingCandidateId, setSelectingCandidateId] = useState<string | null>(null)
  const generationRef = useRef<string | null>(null)
  const pendingTextRef = useRef('')
  const frameRef = useRef<number | null>(null)
  const streamAbortRef = useRef<AbortController | null>(null)
  const mountedRef = useRef(true)
  const recoveryQuery = useQuery({
    ...apiQueryOptions(apiContracts.generation(recoveryGenerationId || ''), 0),
    enabled: Boolean(recoveryGenerationId),
    refetchInterval: 1_000,
    retry: false,
  })

  useEffect(() => {
    if (!conversation) return
    if (conversation.activeGeneration) {
      const activeId = conversation.activeGeneration.id
      if (generationRef.current !== activeId) {
        generationRef.current = activeId
        setGenerationId(activeId)
        setRecoveryGenerationId(activeId)
      }
    } else if (recoveryGenerationId) {
      generationRef.current = null
      setGenerationId(null)
      setRecoveryGenerationId(null)
    }
  }, [conversation, recoveryGenerationId])

  useEffect(() => {
    if (!recoveryGenerationId || !recoveryQuery.data) return
    const { generation } = recoveryQuery.data
    if (generation.status === 'accepted' || generation.status === 'streaming') return
    generationRef.current = null
    setGenerationId(null)
    setRecoveryGenerationId(null)
    setStreamingText('')
    if (generation.status === 'failed') setError('上次生成没有完成，可以直接重试。')
    void loadConversation()
  }, [loadConversation, recoveryGenerationId, recoveryQuery.data, setError])

  useEffect(
    () => () => {
      mountedRef.current = false
      streamAbortRef.current?.abort()
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    },
    [],
  )

  function clearStreamingText() {
    pendingTextRef.current = ''
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
    setStreamingText('')
  }

  function queueStreamingText(text: string) {
    pendingTextRef.current += text
    if (frameRef.current !== null) return
    frameRef.current = requestAnimationFrame(() => {
      const delta = pendingTextRef.current
      pendingTextRef.current = ''
      frameRef.current = null
      setStreamingText((current) => current + delta)
    })
  }

  function handleStreamEvent(event: StreamEvent) {
    if (event.event === 'accepted') {
      setGenerationId(event.data.generationId)
      setRecoveryGenerationId(null)
      generationRef.current = event.data.generationId
      setConversation((current) => {
        if (!current) return current
        const existingIndex = current.messages.findIndex((message) => message.id === event.data.playerMessage.id)
        if (existingIndex >= 0) return { ...current, messages: current.messages.slice(0, existingIndex + 1) }
        const parentIndex = event.data.playerMessage.parentMessageId
          ? current.messages.findIndex((message) => message.id === event.data.playerMessage.parentMessageId)
          : -1
        const messages =
          parentIndex >= 0
            ? [...current.messages.slice(0, parentIndex + 1), event.data.playerMessage]
            : [...current.messages, event.data.playerMessage]
        return { ...current, messages, replyCandidates: [] }
      })
    } else if (event.event === 'delta') {
      if (!generationRef.current || generationRef.current === event.data.generationId)
        queueStreamingText(event.data.text)
    } else if (event.event === 'completed') {
      generationRef.current = null
      setGenerationId(null)
      setRecoveryGenerationId(null)
      clearStreamingText()
      setEditing(null)
      setConversation((current) => {
        if (!current) return current
        const parentIndex = current.messages.findIndex((message) => message.id === event.data.message.parentMessageId)
        const messages =
          parentIndex >= 0
            ? [...current.messages.slice(0, parentIndex + 1), event.data.message]
            : [...current.messages, event.data.message]
        return {
          ...current,
          messages,
          activeLeafMessageId: event.data.activeLeafMessageId,
          activeCheckpointId: event.data.activeCheckpointId,
          updatedAt: event.data.updatedAt,
          activeGeneration: null,
          replyCandidates: [],
        }
      })
      void loadConversation().catch(() => undefined)
    } else if (event.event === 'error') {
      generationRef.current = null
      setGenerationId(null)
      setRecoveryGenerationId(null)
      clearStreamingText()
      setError(event.data.message)
      void loadConversation()
    }
  }

  async function runStream(path: string, body: unknown) {
    setError('')
    clearStreamingText()
    streamAbortRef.current?.abort()
    const controller = new AbortController()
    streamAbortRef.current = controller
    try {
      await streamPost(path, body, handleStreamEvent, controller.signal)
    } catch (reason) {
      if (!mountedRef.current || controller.signal.aborted) return
      generationRef.current = null
      setGenerationId(null)
      setRecoveryGenerationId(null)
      clearStreamingText()
      setError(reason instanceof Error ? reason.message : '生成请求失败')
      await loadConversation().catch(() => undefined)
    } finally {
      if (streamAbortRef.current === controller) streamAbortRef.current = null
    }
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault()
    if (!conversation || !draft.trim() || generationId) return
    const content = draft.trim()
    const currentMode = mode
    setDraft('')
    onFollowLatest()
    if (editing) {
      await runStream(apiPaths.editAndRetry(editing.id), {
        operationId: crypto.randomUUID(),
        clientMessageId: crypto.randomUUID(),
        expectedLeafMessageId: conversation.activeLeafMessageId,
        content,
        inputMode: currentMode,
      })
      return
    }
    await runStream(apiPaths.sendMessage(conversation.id), {
      clientMessageId: crypto.randomUUID(),
      expectedLeafMessageId: conversation.activeLeafMessageId,
      content,
      inputMode: currentMode,
    })
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void submit()
    }
  }

  async function stop() {
    if (!generationId) return
    const activeGenerationId = generationId
    streamAbortRef.current?.abort()
    generationRef.current = null
    setGenerationId(null)
    setRecoveryGenerationId(null)
    clearStreamingText()
    try {
      await post(apiContracts.cancelGeneration(activeGenerationId))
      await loadConversation().catch(() => undefined)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '停止生成失败')
    }
  }

  async function retryLast() {
    if (!conversation) return
    const last = conversation.messages.at(-1)
    if (!last || last.sender !== 'player') return
    await runStream(apiPaths.retryMessage(last.id), { expectedLeafMessageId: conversation.activeLeafMessageId })
  }

  async function regenerate() {
    if (!conversation) return
    await runStream(apiPaths.regenerate(conversation.id), {
      operationId: crypto.randomUUID(),
      expectedLeafMessageId: conversation.activeLeafMessageId,
    })
  }

  async function selectReplyCandidate(candidate: ReplyCandidate) {
    if (
      !conversation ||
      generationId ||
      conversation.status !== 'active' ||
      candidate.isActive ||
      !candidate.selectable
    )
      return
    setSelectingCandidateId(candidate.id)
    setError('')
    try {
      await post(apiContracts.selectReplyCandidate(conversation.id), {
        messageId: candidate.message.id,
        expectedLeafMessageId: conversation.activeLeafMessageId,
        expectedCheckpointId: conversation.activeCheckpointId,
      })
      await loadConversation()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法切换候选回复')
    } finally {
      setSelectingCandidateId(null)
    }
  }

  function beginEdit(message: StoryMessage) {
    setEditing(message)
    setDraft(message.content)
    setMode(message.inputMode || 'dialogue')
    requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>('.composer textarea')?.focus())
  }

  function cancelEdit() {
    setEditing(null)
    setDraft('')
  }

  return {
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
  }
}
