import { afterEach, describe, expect, it } from 'bun:test'
import { createUuid } from '../src/shared/id'

const originalCrypto = globalThis.crypto

function replaceCrypto(value: Partial<Crypto> | undefined) {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value,
  })
}

afterEach(() => {
  replaceCrypto(originalCrypto)
})

describe('前端 UUID 生成器', () => {
  it('优先使用浏览器 randomUUID', () => {
    replaceCrypto({ randomUUID: () => '00000000-0000-4000-8000-000000000000' } as Partial<Crypto>)

    expect(createUuid()).toBe('00000000-0000-4000-8000-000000000000')
  })

  it('在 randomUUID 不可用时使用 getRandomValues 生成 v4 UUID', () => {
    replaceCrypto({
      getRandomValues: (array: Uint8Array) => {
        array.set(Array.from({ length: array.length }, (_, index) => index))
        return array
      },
    } as Partial<Crypto>)

    expect(createUuid()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('没有安全随机源时拒绝生成弱 ID', () => {
    replaceCrypto(undefined)

    expect(() => createUuid()).toThrow('当前浏览器不支持安全 UUID 生成')
  })
})
