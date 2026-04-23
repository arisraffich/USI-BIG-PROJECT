import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import LoginForm from './login-form'
import { ADMIN_SESSION_COOKIE, verifyAdminSessionValue } from '@/lib/auth/admin'

export default async function AdminLoginPage() {
  const cookieStore = await cookies()
  const isAuthenticated = await verifyAdminSessionValue(cookieStore.get(ADMIN_SESSION_COOKIE)?.value)

  if (isAuthenticated) {
    redirect('/admin/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-center text-gray-900">
          Admin Login
        </h1>
        <LoginForm />
      </div>
    </div>
  )
}
