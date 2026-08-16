import { ZodError } from 'zod'

export function isSchemaValidationError(error: unknown): error is ZodError {
  return error instanceof ZodError
}

export function getSchemaErrorMessage(error: unknown, fallback: string) {
  return isSchemaValidationError(error)
    ? error.issues[0]?.message || fallback
    : error instanceof Error
      ? error.message
      : fallback
}
