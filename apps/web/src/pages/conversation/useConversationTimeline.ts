import { apiContracts, type Conversation } from '@storybound/shared'
import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from 'react'
import { api } from '../../app/apiClient'

interface ConversationTimelineOptions {
  conversation: Conversation | null
  setConversation: Dispatch<SetStateAction<Conversation | null>>
  streamingText: string
  setError: (message: string) => void
}

export function useConversationTimeline({
  conversation,
  setConversation,
  streamingText,
  setError,
}: ConversationTimelineOptions) {
  const timelineRef = useRef<HTMLDivElement>(null)
  const followingRef = useRef(true)
  const initializedScrollRef = useRef(false)
  const [showLatest, setShowLatest] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)

  useEffect(() => {
    const timeline = timelineRef.current
    if (!timeline) return
    if (!initializedScrollRef.current) {
      initializedScrollRef.current = true
      timeline.scrollTop = timeline.scrollHeight
    } else if (followingRef.current) {
      timeline.scrollTo({ top: timeline.scrollHeight, behavior: streamingText ? 'auto' : 'smooth' })
    }
  }, [conversation?.messages.length, streamingText])

  function onTimelineScroll() {
    const timeline = timelineRef.current
    if (!timeline) return
    const nearBottom = timeline.scrollHeight - timeline.scrollTop - timeline.clientHeight <= 120
    followingRef.current = nearBottom
    setShowLatest(!nearBottom)
  }

  function scrollToLatest() {
    followingRef.current = true
    setShowLatest(false)
    timelineRef.current?.scrollTo({ top: timelineRef.current.scrollHeight, behavior: 'smooth' })
  }

  async function loadOlderMessages() {
    if (!conversation?.messagePage.hasMore || !conversation.messagePage.nextCursor || loadingOlder) return
    const timeline = timelineRef.current
    const previousHeight = timeline?.scrollHeight || 0
    setLoadingOlder(true)
    try {
      const result = await api(
        apiContracts.conversationMessages(conversation.id, conversation.messagePage.nextCursor, 80),
      )
      setConversation((current) =>
        current
          ? {
              ...current,
              messages: [...result.messages, ...current.messages],
              events: [...result.events, ...current.events],
              messagePage: result.page,
            }
          : current,
      )
      requestAnimationFrame(() => {
        if (timeline) timeline.scrollTop += timeline.scrollHeight - previousHeight
      })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法加载更早的故事内容')
    } finally {
      setLoadingOlder(false)
    }
  }

  return { timelineRef, showLatest, loadingOlder, onTimelineScroll, scrollToLatest, loadOlderMessages }
}
