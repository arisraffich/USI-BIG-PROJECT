import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import LoginForm from './login-form'

export default async function AdminLoginPage() {
  const cookieStore = await cookies()
  const isAuthenticated = cookieStore.get('admin_session_v2')?.value === 'true'

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


