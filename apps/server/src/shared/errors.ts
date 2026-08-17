import { isSchemaValidationError } from '@storybound/shared'

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
  }
}

function withRequestId<T extends { error: Record<string, unknown> }>(body: T, requestId?: string): T {
  if (!requestId) return body
  return { ...body, error: { ...body.error, requestId } }
}

export function toErrorBody(error: unknown, requestId?: string) {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: withRequestId({ error: { code: error.code, message: error.message, details: error.details } }, requestId),
    }
  }
  if (error && typeof error === 'object' && 'type' in error) {
    if (error.type === 'entity.too.large') {
      return {
        status: 413,
        body: withRequestId(
          { error: { code: 'REQUEST_BODY_TOO_LARGE', message: '提交的数据超过大小限制' } },
          requestId,
        ),
      }
    }
    if (error.type === 'entity.parse.failed') {
      return {
        status: 400,
        body: withRequestId({ error: { code: 'INVALID_JSON', message: '请求正文不是有效的 JSON' } }, requestId),
      }
    }
  }
  if (isSchemaValidationError(error)) {
    return {
      status: 422,
      body: withRequestId(
        { error: { code: 'VALIDATION_ERROR', message: '提交的数据不完整或格式不正确', details: error } },
        requestId,
      ),
    }
  }
  return {
    status: 500,
    body: withRequestId({ error: { code: 'INTERNAL_ERROR', message: '服务处理请求时发生错误' } }, requestId),
  }
}
