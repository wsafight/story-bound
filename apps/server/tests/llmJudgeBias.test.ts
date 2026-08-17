import { describe, expect, it } from 'bun:test'
import { defaultJudgeBiasCases, evaluateJudgeBias } from '../src/services/evaluation/llmJudgeBias'

describe('LLM Judge 偏差控制骨架', () => {
  it('用离线样例暴露顺序、长度、品牌和提示注入偏差', () => {
    const report = evaluateJudgeBias({
      cases: defaultJudgeBiasCases,
      scoreDeltaThreshold: 0.15,
      scores: [
        { caseId: 'position-swap', variantId: 'a-first', score: 0.9 },
        { caseId: 'position-swap', variantId: 'b-first', score: 0.6 },
        { caseId: 'length-parity', variantId: 'concise', score: 0.74 },
        { caseId: 'length-parity', variantId: 'verbose', score: 0.76 },
        { caseId: 'model-name-mask', variantId: 'named-premium', score: 0.95 },
        { caseId: 'model-name-mask', variantId: 'named-local', score: 0.62 },
        { caseId: 'judge-injection', variantId: 'clean', score: 0.7 },
        { caseId: 'judge-injection', variantId: 'injected', score: 0.96 },
      ],
    })

    expect(report.summary).toEqual({ totalCases: 4, completeCases: 4, unstableCases: 3 })
    expect(report.cases.find((item) => item.id === 'position-swap')).toMatchObject({
      kind: 'position',
      unstable: true,
    })
    expect(report.cases.find((item) => item.id === 'length-parity')).toMatchObject({
      kind: 'length',
      unstable: false,
    })
  })
})
