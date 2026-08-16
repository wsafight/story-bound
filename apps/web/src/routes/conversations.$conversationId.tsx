import { apiContracts } from '@storybound/shared'
import { createFileRoute } from '@tanstack/react-router'
import { prefetchApiQuery } from '../app/apiQueries'
import { ConversationPage } from '../pages/ConversationPage'

export const Route = createFileRoute('/conversations/$conversationId')({
  loader: ({ params }) =>
    Promise.all([
      prefetchApiQuery(apiContracts.conversation(params.conversationId), 5_000),
      prefetchApiQuery(apiContracts.conversationModelHealth(params.conversationId), 15_000),
    ]),
  component: ConversationPage,
})
