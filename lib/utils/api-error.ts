import { NextResponse } from 'next/server'

export interface ApiErrorOptions {
  message: string
  status?: number
  details?: string
  code?: string
}

/**
 * Creates a standardized error response for API routes
 */
export function createErrorResponse(
  error: unknown,
  defaultMessage: string = 'An error occurred',
  defaultStatus: number = 500
): NextResponse {
  const isDev = process.env.NODE_ENV === 'development'
  
  let message = defaultMessage
  let status = defaultStatus
  let details: string | undefined
  let code: string | undefined

  if (error instanceof Error) {
    message = error.message || defaultMessage
    details = isDev ? error.stack : undefined
  } else if (typeof error === 'string') {
    message = error
  } else if (error && typeof error === 'object' && 'message' in error) {
    message = String(error.message) || defaultMessage
    if ('status' in error) {
      status = Number(error.status) || defaultStatus
    }
    if ('code' in error) {
      code = String(error.code)
    }
  }

  // Log error in development
  if (isDev) {
    console.error('API Error:', { message, status, code, details })
  } else {
    console.error('API Error:', message)
  }

  const response: Record<string, unknown> = {
    error: message,
  }

  if (isDev && details) {
    response.details = details
  }

  if (code) {
    response.code = code
  }

  return NextResponse.json(response, { status })
}

/**
 * Creates a standardized validation error response
 */
export function createValidationError(message: string, details?: string): NextResponse {
  return NextResponse.json(
    {
      error: message,
      ...(details && { details }),
    },
    { status: 400 }
  )
}

/**
 * Creates a standardized not found error response
 */
export function createNotFoundError(resource: string = 'Resource'): NextResponse {
  return NextResponse.json(
    { error: `${resource} not found` },
    { status: 404 }
  )
}
















