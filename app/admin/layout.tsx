import { AdminGenerationBrowserNotice } from '@/components/admin/AdminGenerationBrowserNotice'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <AdminGenerationBrowserNotice />
      {children}
    </>
  )
}
