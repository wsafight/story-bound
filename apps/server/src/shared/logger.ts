export type LogLevel = 'info' | 'warn' | 'error'

export interface StructuredLogEntry {
  level: LogLevel
  message: string
  route?: string
  method?: string
  status?: number
  errorCode?: string
  appRequestId?: string
  generationId?: string | null
  durationMs?: number
}

export function writeStructuredLog(entry: StructuredLogEntry) {
  const payload = {
    time: new Date().toISOString(),
    ...entry,
  }
  const line = JSON.stringify(payload)
  if (entry.level === 'error') console.error(line)
  else if (entry.level === 'warn') console.warn(line)
  else console.log(line)
}
