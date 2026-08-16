export interface ProviderDraft {
  id?: string
  name: string
  kind: 'local' | 'remote'
  baseUrl: string
  apiKey: string
  defaultModel: string
  contextWindow: number
  maxOutputTokens: number
  thinkingMode: 'off' | 'auto' | 'on'
  thinkingEffort: 'low' | 'medium' | 'high' | null
}
