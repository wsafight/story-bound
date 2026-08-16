export const defaultContractOptions = {
  maxMessageChars: 8_000,
} as const

export interface ContractSchemaOptions {
  maxMessageChars: number
}
