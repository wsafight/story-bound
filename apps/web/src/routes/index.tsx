import { apiContracts } from '@storybound/shared'
import { createFileRoute } from '@tanstack/react-router'
import { prefetchApiQuery } from '../app/apiQueries'
import { StoryLibraryPage } from '../pages/StoryLibraryPage'

export const Route = createFileRoute('/')({
  loader: () => prefetchApiQuery(apiContracts.stories()),
  component: StoryLibraryPage,
})
