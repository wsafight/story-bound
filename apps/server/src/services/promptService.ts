import { getPromptProfileSnapshot } from './prompt/registry'

export { auditPromptProfile } from './prompt/audit'
export { evaluatePromptGoldenSnapshot, getPromptGoldenScenarios } from './prompt/golden'

export function getPromptProfile() {
  return getPromptProfileSnapshot()
}
