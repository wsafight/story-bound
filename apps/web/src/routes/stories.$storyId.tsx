import { apiContracts } from '@storybound/shared'
import { createFileRoute } from '@tanstack/react-router'
import { prefetchApiQuery } from '../app/apiQueries'
import { StoryDetailPage } from '../pages/StoryDetailPage'

export const Route = createFileRoute('/stories/$storyId')({
  loader: ({ params }) =>
    Promise.all([
      prefetchApiQuery(apiContracts.story(params.storyId), 5 * 60_000),
      prefetchApiQuery(apiContracts.storyConversations(params.storyId)),
    ]),
  component: StoryDetailPage,
})
