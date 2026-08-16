import { apiContracts } from '@storybound/shared'
import { createFileRoute } from '@tanstack/react-router'
import { prefetchApiQuery } from '../app/apiQueries'
import { SettingsPage } from '../pages/SettingsPage'

export const Route = createFileRoute('/settings')({
  loader: () =>
    Promise.all([
      prefetchApiQuery(apiContracts.providers()),
      prefetchApiQuery(apiContracts.runtime(), 15_000),
      prefetchApiQuery(apiContracts.runtimeMods()),
      prefetchApiQuery(apiContracts.backups()),
    ]),
  component: SettingsPage,
})
