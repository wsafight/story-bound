import type { ApiContract } from '@storybound/shared'
import { queryOptions } from '@tanstack/react-query'
import { api, getAccessToken } from './apiClient'
import { queryClient } from './queryClient'

export function apiQueryKey(contract: ApiContract) {
  return ['api', getAccessToken(), contract.path] as const
}

export function apiQueryOptions<Contract extends ApiContract>(contract: Contract, staleTime = 30_000) {
  return queryOptions({
    queryKey: apiQueryKey(contract),
    queryFn: ({ signal }) => api(contract, { signal }),
    staleTime,
  })
}

export function prefetchApiQuery(contract: ApiContract, staleTime = 30_000) {
  return queryClient.prefetchQuery(apiQueryOptions(contract, staleTime))
}
