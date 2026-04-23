import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { ADMIN_SESSION_COOKIE } from '@/lib/auth/admin'

export async function POST() {
  const cookieStore = await cookies()
  cookieStore.delete(ADMIN_SESSION_COOKIE)

  return NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'))
}
