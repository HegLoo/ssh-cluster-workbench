import type { AppError as SerializedAppError } from '@shared/types'

export class AppError extends Error {
  readonly code: string
  readonly details?: string

  constructor(code: string, message: string, details?: string) {
    super(message)
    this.name = 'AppError'
    this.code = code
    if (details !== undefined) this.details = details
  }
}

export function serializeError(error: unknown): SerializedAppError {
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {})
    }
  }

  if (error instanceof Error) {
    return { code: 'UNEXPECTED_ERROR', message: error.message }
  }

  return { code: 'UNEXPECTED_ERROR', message: String(error) }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
