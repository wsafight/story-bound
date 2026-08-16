import type { ApiContract, ApiContractResponse } from '@storybound/shared'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

const accessTokenKey = 'storybound:access-token'

export function getAccessToken() {
  return typeof sessionStorage === 'undefined' ? '' : sessionStorage.getItem(accessTokenKey) || ''
}

export function setAccessToken(value: string) {
  if (typeof sessionStorage === 'undefined') return
  if (value) sessionStorage.setItem(accessTokenKey, value)
  else sessionStorage.removeItem(accessTokenKey)
}

export function authorizedHeaders(headers?: HeadersInit) {
  const result = new Headers(headers)
  const accessToken = getAccessToken()
  if (accessToken) result.set('Authorization', `Bearer ${accessToken}`)
  return result
}

export async function api<Contract extends ApiContract>(
  contract: Contract,
  init?: RequestInit,
): Promise<ApiContractResponse<Contract>> {
  const headers = authorizedHeaders(init?.headers)
  if (init?.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(contract.path, {
    ...init,
    headers,
  })
  const payload = response.status === 204 ? undefined : await response.json().catch(() => null)
  if (!response.ok) {
    const error = payload as { error?: { code?: string; message?: string } } | null
    throw new ApiError(
      response.status,
      error?.error?.code || 'REQUEST_FAILED',
      error?.error?.message || '请求失败，请稍后重试',
    )
  }
  const parsed = contract.response.safeParse(payload)
  if (!parsed.success) throw new ApiError(502, 'INVALID_RESPONSE', '服务端返回的数据格式不正确')
  return parsed.data as ApiContractResponse<Contract>
}

export async function downloadApi(path: string, fallbackName: string) {
  const response = await fetch(path, { headers: authorizedHeaders() })
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null
    throw new Error(payload?.error?.message || '下载失败')
  }
  const disposition = response.headers.get('content-disposition') || ''
  const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  const basicName = disposition.match(/filename="?([^";]+)"?/i)?.[1]
  const filename = encodedName ? decodeURIComponent(encodedName) : basicName || fallbackName
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function post<Contract extends ApiContract>(contract: Contract, body?: unknown) {
  return api(contract, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) })
}
