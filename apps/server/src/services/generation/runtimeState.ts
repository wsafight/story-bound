import { streamModel } from '../../llm/adapter'

export const abortControllers = new Map<string, AbortController>()
let modelStreamer = streamModel

export function getModelStreamer() {
  return modelStreamer
}

export function setModelStreamImplementation(implementation: typeof streamModel) {
  modelStreamer = implementation
}

export function resetModelStreamImplementation() {
  modelStreamer = streamModel
}
