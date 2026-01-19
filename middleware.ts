import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Protect all /admin routes (except login-related)
  if (pathname.startsWith('/admin')) {
    // Using v2 cookie name to invalidate all existing sessions
    const isAuthenticated = request.cookies.get('admin_session_v2')?.value === 'true'

    if (!isAuthenticated) {
      // Redirect to login page
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // Match all /admin routes
    '/admin/:path*',
  ],
}
