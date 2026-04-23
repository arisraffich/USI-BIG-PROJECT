import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { isAdminRequest, unauthorizedJson } from '@/lib/auth/admin'

const PUBLIC_API_PREFIXES = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/review',
  '/api/submit',
  '/api/scheduled-sends/execute',
  '/api/download',
]

function isPublicApiPath(pathname: string) {
  return PUBLIC_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

function isCronAuthorizedInternalApi(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) return false

  const { pathname } = request.nextUrl
  const canRunScheduledSend = /^\/api\/projects\/[^/]+\/send-to-customer$/.test(pathname)
  return canRunScheduledSend && request.headers.get('authorization') === `Bearer ${cronSecret}`
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Protect all /admin routes (except login-related)
  if (pathname.startsWith('/admin')) {
    const isAuthenticated = await isAdminRequest(request)

    if (!isAuthenticated) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  if (pathname.startsWith('/api') && !isPublicApiPath(pathname)) {
    const isAuthenticated = await isAdminRequest(request)
    if (!isAuthenticated && !isCronAuthorizedInternalApi(request)) {
      return unauthorizedJson()
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // Match protected app and API routes. Public API exceptions are handled above.
    '/admin/:path*',
    '/api/:path*',
  ],
}
