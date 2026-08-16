import { describe, expect, it } from 'bun:test'
import { config } from '../src/config'
import { sendMessageSchema } from '../src/domain/schemas'
import { resolveModelLimits } from '../src/llm/modelLimits'

describe('模型与消息硬上限', () => {
  it('上下文窗口不会超过应用上限', () => {
    const limits = resolveModelLimits(config.maxContextTokens * 4, 1_600)
    expect(limits.contextWindow).toBe(config.maxContextTokens)
    expect(limits.outputReserved).toBeGreaterThanOrEqual(limits.maxOutputTokens)
    expect(limits.outputReserved).toBeGreaterThanOrEqual(config.reservedOutputTokens)
  })

  it('发送消息服从 MAX_MESSAGE_CHARS', () => {
    const base = {
      clientMessageId: crypto.randomUUID(),
      expectedLeafMessageId: 'leaf',
      inputMode: 'action' as const,
    }
    expect(sendMessageSchema.safeParse({ ...base, content: 'x'.repeat(config.maxMessageChars) }).success).toBe(true)
    expect(sendMessageSchema.safeParse({ ...base, content: 'x'.repeat(config.maxMessageChars + 1) }).success).toBe(
      false,
    )
  })
})
