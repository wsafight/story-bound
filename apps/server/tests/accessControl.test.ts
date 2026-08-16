import { describe, expect, it } from 'bun:test'
import { assertAccessConfiguration, hasValidAccessToken, isLoopbackHost } from '../src/security/access'

describe('服务访问控制', () => {
  it('识别 IPv4、IPv6 和 localhost 回环地址', () => {
    expect(isLoopbackHost('127.0.0.1')).toBe(true)
    expect(isLoopbackHost('127.8.9.10')).toBe(true)
    expect(isLoopbackHost('::1')).toBe(true)
    expect(isLoopbackHost('localhost')).toBe(true)
    expect(isLoopbackHost('0.0.0.0')).toBe(false)
  })

  it('非回环监听必须配置访问令牌', () => {
    expect(() => assertAccessConfiguration('0.0.0.0', '')).toThrow('ACCESS_TOKEN')
    expect(() => assertAccessConfiguration('0.0.0.0', 'secret-token')).not.toThrow()
    expect(() => assertAccessConfiguration('127.0.0.1', '')).not.toThrow()
  })

  it('严格校验 Bearer Token', () => {
    expect(hasValidAccessToken(undefined, '')).toBe(true)
    expect(hasValidAccessToken('Bearer secret-token', 'secret-token')).toBe(true)
    expect(hasValidAccessToken('Bearer wrong-token', 'secret-token')).toBe(false)
    expect(hasValidAccessToken('Basic secret-token', 'secret-token')).toBe(false)
  })
})
