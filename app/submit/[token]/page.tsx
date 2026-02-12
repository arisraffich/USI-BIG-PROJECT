import { createAdminClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { CustomerSubmissionWizard } from '@/components/submit/CustomerSubmissionWizard'

export const dynamic = 'force-dynamic'

export default async function SubmitPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params

  if (!token) {
    notFound()
  }

  const supabase = await createAdminClient()

  // Fetch project by review token
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id, book_title, author_firstname, author_lastname, status, review_token, number_of_illustrations')
    .eq('review_token', token)
    .single()

  if (projectError || !project) {
    console.error('[SubmitPage] Project not found:', projectError)
    notFound()
  }

  // Allow access during customer input and character review (bg identification changes status)
  const allowedStatuses = ['awaiting_customer_input', 'character_review']
  if (!allowedStatuses.includes(project.status)) {
    // If customer already submitted, show a thank you message
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Already Submitted!</h1>
          <p className="text-gray-600">
            Your project information has already been submitted. Our team is working on your illustrations!
          </p>
          <p className="text-sm text-gray-400 mt-4">
            You&apos;ll receive an email when your characters are ready for review.
          </p>
        </div>
      </div>
    )
  }

  // Fetch any existing pages (in case customer partially submitted)
  const { data: existingPages } = await supabase
    .from('pages')
    .select('*')
    .eq('project_id', project.id)
    .order('page_number', { ascending: true })

  return (
    <CustomerSubmissionWizard
      projectId={project.id}
      reviewToken={token}
      authorFirstName={project.author_firstname || ''}
      authorLastName={project.author_lastname || ''}
      numberOfIllustrations={project.number_of_illustrations || 12}
      existingPages={existingPages || []}
    />
  )
}
