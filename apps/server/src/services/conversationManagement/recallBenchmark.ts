import { getRecallDiagnostics } from './recallDiagnostics'
import type { RecallSourceId } from './recallSources'

export interface RecallBenchmarkExpectation {
  source: RecallSourceId
  title: string
}

export interface RecallBenchmarkCase {
  id: string
  query: string
  expected: RecallBenchmarkExpectation[]
  ignoredUnexpectedSources?: RecallSourceId[]
}

export interface RecallBenchmarkCaseResult {
  id: string
  query: string
  expected: RecallBenchmarkExpectation[]
  matchedExpected: RecallBenchmarkExpectation[]
  missedExpected: RecallBenchmarkExpectation[]
  unexpectedMatches: RecallBenchmarkExpectation[]
  recallAtK: number
}

function key(item: RecallBenchmarkExpectation) {
  return `${item.source}\n${item.title}`
}

export function evaluateRecallBenchmark(conversationId: string, cases: RecallBenchmarkCase[]) {
  const results: RecallBenchmarkCaseResult[] = cases.map((item) => {
    const expectedKeys = new Set(item.expected.map(key))
    const ignoredSources = new Set(item.ignoredUnexpectedSources || [])
    const recall = getRecallDiagnostics(conversationId, item.query)
    const matched = recall.diagnostics
      .filter((diagnostic) => diagnostic.matched)
      .map((diagnostic) => ({ source: diagnostic.source, title: diagnostic.title }))
    const matchedKeys = new Set(matched.map(key))
    const matchedExpected = item.expected.filter((expected) => matchedKeys.has(key(expected)))
    const missedExpected = item.expected.filter((expected) => !matchedKeys.has(key(expected)))
    const unexpectedMatches = matched.filter(
      (match) => !expectedKeys.has(key(match)) && !ignoredSources.has(match.source),
    )
    return {
      id: item.id,
      query: item.query,
      expected: item.expected,
      matchedExpected,
      missedExpected,
      unexpectedMatches,
      recallAtK: item.expected.length === 0 ? 1 : matchedExpected.length / item.expected.length,
    }
  })
  const expectedCount = results.reduce((sum, item) => sum + item.expected.length, 0)
  const matchedExpectedCount = results.reduce((sum, item) => sum + item.matchedExpected.length, 0)
  const unexpectedMatchCount = results.reduce((sum, item) => sum + item.unexpectedMatches.length, 0)
  return {
    cases: results,
    summary: {
      totalCases: cases.length,
      expectedCount,
      matchedExpectedCount,
      missedExpectedCount: expectedCount - matchedExpectedCount,
      unexpectedMatchCount,
      recallAtK: expectedCount === 0 ? 1 : matchedExpectedCount / expectedCount,
    },
  }
}
