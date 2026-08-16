import { apiContracts } from '@storybound/shared'
import { createFileRoute } from '@tanstack/react-router'
import { prefetchApiQuery } from '../app/apiQueries'
import { ConversationSetupPage } from '../pages/ConversationSetupPage'

export const Route = createFileRoute('/stories/$storyId_/conversations/new')({
  loader: ({ params }) =>
    Promise.all([
      prefetchApiQuery(apiContracts.story(params.storyId), 5 * 60_000),
      prefetchApiQuery(apiContracts.providers()),
    ]),
  component: ConversationSetupPage,
})
