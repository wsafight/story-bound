type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function matchesScalar(actual: unknown, expected: unknown) {
  if (Array.isArray(expected)) return expected.includes(actual)
  if (isRecord(expected)) {
    if ('exists' in expected) return Boolean(actual !== undefined && actual !== null) === Boolean(expected.exists)
    if ('equals' in expected) return actual === expected.equals
    if ('not' in expected) return actual !== expected.not
  }
  return expected === undefined || actual === expected
}

function matchesCustom(custom: JsonRecord, expected: unknown) {
  if (!isRecord(expected)) return true
  return Object.entries(expected).every(([key, value]) => matchesScalar(custom[key], value))
}

export function storyConditionMatches(condition: unknown, state: JsonRecord) {
  if (!isRecord(condition) || Object.keys(condition).length === 0) return true
  if (Array.isArray(condition.all) && !condition.all.every((item) => storyConditionMatches(item, state))) return false
  if (Array.isArray(condition.any) && !condition.any.some((item) => storyConditionMatches(item, state))) return false
  if (condition.not !== undefined && storyConditionMatches(condition.not, state)) return false

  const scene = isRecord(state.scene) ? state.scene : {}
  const custom = isRecord(state.custom) ? state.custom : {}
  if ('phase' in condition && !matchesScalar(state.phase, condition.phase)) return false
  if ('location' in condition && !matchesScalar(scene.location, condition.location)) return false
  if ('time' in condition && !matchesScalar(scene.time, condition.time)) return false
  if ('custom' in condition && !matchesCustom(custom, condition.custom)) return false
  return true
}
