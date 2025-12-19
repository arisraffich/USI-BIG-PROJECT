import { createAdminClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'

export default async function SubmittedPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  if (!token) {
    notFound()
  }

  try {
    const supabase = await createAdminClient()

    // Fetch project by review token
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, book_title, author_firstname, author_lastname, status')
      .eq('review_token', token)
      .single()

    if (projectError || !project) {
      notFound()
    }

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
        <div className="max-w-2xl w-full bg-white rounded-lg shadow-lg p-8 text-center">
          <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto mb-6" />
          <h1 className="text-3xl font-bold text-gray-900 mb-4">
            Changes Submitted Successfully
          </h1>
          <p className="text-lg text-gray-600 mb-6">
            Thank you for submitting your character information and story updates.
          </p>
          <p className="text-base text-gray-700">
            Our illustrators will now create the character illustrations based on your specifications.
            You will be notified once the illustrations are complete.
          </p>

          <div className="mt-8">
            <a
              href={`/review/${token}`}
              className="text-blue-600 hover:text-blue-800 font-medium hover:underline transition-colors"
            >
              Return to Project View
            </a>
          </div>
        </div>
      </div>
    )
  } catch (error: any) {
    console.error('Error in SubmittedPage:', error)
    notFound()
  }
}









