import { describe, expect, it } from 'bun:test'
import { estimateTokens, withActualInputTokens } from '../src/services/prompt/contextCache'
import type { ContextEstimate } from '../src/services/prompt/types'

describe('Prompt Token 预算基线', () => {
  it('固定中文、英文、混合文本和长历史的启发式估算结果', () => {
    expect(estimateTokens('槐安站末班车')).toBe(7)
    expect(estimateTokens('last train arrives at midnight')).toBe(10)
    expect(estimateTokens('槐安站 platform 7')).toBe(8)
    expect(estimateTokens('行动 '.repeat(1_000))).toBe(2_634)
  })

  it('记录实际 usage 时只保存数值误差，不保存 Prompt 正文', () => {
    const estimate: ContextEstimate = {
      contextWindow: 8_000,
      outputReserved: 1_000,
      envelopeReserved: 400,
      requestBudget: 6_600,
      estimatedTokens: 100,
      segments: [
        {
          name: 'story.background',
          estimatedTokens: 100,
          source: 'story',
          scope: 'story',
          priority: 'required',
          included: true,
        },
      ],
      history: { includedMessages: 0, omittedMessages: 0, estimatedTokens: 0 },
    }
    const calibrated = withActualInputTokens(estimate, 125, '2026-08-17T00:00:00.000Z')

    expect(calibrated.calibration).toEqual({
      actualInputTokens: 125,
      estimateErrorTokens: 25,
      estimateErrorRatio: 0.25,
      measuredAt: '2026-08-17T00:00:00.000Z',
    })
    expect(JSON.stringify(calibrated)).not.toContain('槐安站隐藏正文')
  })
})
