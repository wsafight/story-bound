import { apiContracts } from '@storybound/shared'
import { createFileRoute } from '@tanstack/react-router'
import { prefetchApiQuery } from '../app/apiQueries'
import { StoryEditorPage } from '../pages/StoryEditorPage'

export const Route = createFileRoute('/stories/$storyId_/edit')({
  loader: ({ params }) => prefetchApiQuery(apiContracts.storyEditor(params.storyId), 5 * 60_000),
  component: StoryEditorPage,
})
