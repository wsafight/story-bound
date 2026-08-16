import type { Database } from 'bun:sqlite'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import type { CreateModelProviderInput, UpdateModelProviderInput } from '../domain/schemas'
import { createModelProvider, getModelProvider, updateModelProvider } from '../repositories/modelProviders'
import { AppError } from '../shared/errors'

function isLoopback(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '')
  return host === 'localhost' || host === '::1' || host.startsWith('127.')
}

function isPrivateIpv4(hostname: string) {
  if (isIP(hostname) !== 4) return false
  const [a, b] = hostname.split('.').map(Number)
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && [0, 168].includes(b)) ||
    (a === 198 && [18, 19, 51].includes(b)) ||
    (a === 203 && b === 0)
  )
}

function isPrivateAddress(address: string) {
  if (isPrivateIpv4(address) || isLoopback(address)) return true
  const normalized = address.toLowerCase()
  if (normalized === '::' || normalized.startsWith('::ffff:')) {
    const mapped = normalized.replace('::ffff:', '')
    return mapped === normalized || isPrivateIpv4(mapped)
  }
  return (
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb') ||
    normalized.startsWith('2001:db8')
  )
}

export async function validateProviderEndpoint(kind: 'local' | 'remote', value: string) {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new AppError(422, 'PROVIDER_URL_INVALID', '模型地址必须是没有内嵌凭据的 HTTP(S) 地址')
  }
  if (url.search || url.hash) throw new AppError(422, 'PROVIDER_URL_INVALID', '模型地址不能包含查询参数或片段')
  if (kind === 'local' && !isLoopback(url.hostname)) {
    throw new AppError(422, 'PROVIDER_URL_NOT_LOCAL', '本地 Provider 只能使用 localhost 或回环地址')
  }
  if (kind === 'remote' && (url.protocol !== 'https:' || isLoopback(url.hostname) || isPrivateIpv4(url.hostname))) {
    throw new AppError(422, 'PROVIDER_URL_NOT_REMOTE', '远程 Provider 必须使用 HTTPS 公网地址')
  }
  if (kind === 'remote') {
    let addresses: Array<{ address: string }>
    try {
      addresses = await lookup(url.hostname, { all: true })
    } catch {
      throw new AppError(422, 'PROVIDER_HOST_UNRESOLVED', '远程 Provider 域名当前无法解析')
    }
    if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
      throw new AppError(422, 'PROVIDER_HOST_PRIVATE', '远程 Provider 不能解析到私网、回环或链路本地地址')
    }
  }
  return url.toString().replace(/\/$/, '')
}

export async function createValidatedProvider(input: CreateModelProviderInput, database?: Database) {
  return createModelProvider({ ...input, baseUrl: await validateProviderEndpoint(input.kind, input.baseUrl) }, database)
}

export async function updateValidatedProvider(
  providerId: string,
  input: UpdateModelProviderInput,
  database?: Database,
) {
  const current = getModelProvider(providerId, database)
  if (!current) throw new AppError(404, 'PROVIDER_NOT_FOUND', '没有找到这个模型 Provider')
  const kind = input.kind || current.kind
  const baseUrl = await validateProviderEndpoint(kind, input.baseUrl || current.baseUrl)
  return updateModelProvider(providerId, { ...input, baseUrl }, database)!
}
