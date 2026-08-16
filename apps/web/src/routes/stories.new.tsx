import { createFileRoute } from '@tanstack/react-router'
import { StoryEditorPage } from '../pages/StoryEditorPage'

export const Route = createFileRoute('/stories/new')({ component: StoryEditorPage })
