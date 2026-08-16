import { config } from '../config'

function positiveInteger(value: unknown, fallback: number) {
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0 ? number : fallback
}

export function resolveModelLimits(providerContextWindow: unknown, providerMaxOutputTokens: unknown) {
  const declaredContextWindow = positiveInteger(providerContextWindow, config.maxContextTokens)
  const contextWindow = Math.max(1_024, Math.min(config.maxContextTokens, declaredContextWindow))
  const outputCeiling = contextWindow - 512
  const maxOutputTokens = Math.min(
    outputCeiling,
    Math.max(64, positiveInteger(providerMaxOutputTokens, config.reservedOutputTokens)),
  )
  const outputReserved = Math.min(outputCeiling, Math.max(config.reservedOutputTokens, maxOutputTokens))
  return { contextWindow, maxOutputTokens, outputReserved }
}
