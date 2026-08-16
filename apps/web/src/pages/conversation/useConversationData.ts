import { apiContracts, type Conversation } from '@storybound/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type Dispatch, type SetStateAction, useCallback, useState } from 'react'
import { apiQueryKey, apiQueryOptions } from '../../app/apiQueries'

export function useConversationData(conversationId: string) {
  const queryClient = useQueryClient()
  const [actionError, setActionError] = useState('')
  const conversationQuery = useQuery(apiQueryOptions(apiContracts.conversation(conversationId), 5_000))
  const modelQuery = useQuery(apiQueryOptions(apiContracts.conversationModelHealth(conversationId), 15_000))
  const conversation = conversationQuery.data?.conversation || null
  const model =
    modelQuery.data?.health ||
    (modelQuery.error ? { online: false, model: '当前模型', models: [], reason: '无法检查模型状态' } : null)
  const error = actionError || (conversationQuery.error instanceof Error ? conversationQuery.error.message : '')

  const setConversation: Dispatch<SetStateAction<Conversation | null>> = useCallback(
    (value) => {
      queryClient.setQueryData<{ conversation: Conversation }>(
        apiQueryKey(apiContracts.conversation(conversationId)),
        (current) => {
          const previous = current?.conversation || null
          const next = typeof value === 'function' ? value(previous) : value
          return next ? { conversation: next } : undefined
        },
      )
    },
    [conversationId, queryClient],
  )

  const loadConversation = useCallback(async () => {
    const result = await queryClient.fetchQuery(apiQueryOptions(apiContracts.conversation(conversationId), 0))
    void queryClient.invalidateQueries({ queryKey: apiQueryKey(apiContracts.stories()), exact: true })
    void queryClient.invalidateQueries({
      queryKey: apiQueryKey(apiContracts.storyConversations(result.conversation.story.id)),
      exact: true,
    })
    return result.conversation
  }, [conversationId, queryClient])

  return { conversation, setConversation, model, error, setError: setActionError, loadConversation }
}
