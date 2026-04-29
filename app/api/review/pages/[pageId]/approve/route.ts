import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getReviewToken, reviewUnauthorized, verifyReviewTokenForProject } from '@/lib/auth/review-token'
import { getErrorMessage } from '@/lib/utils/error'
import { notifyColoredIllustrationsApproved, notifyIllustrationsApproved, notifyPageIllustrationApproved } from '@/lib/notifications'

const FINISHED_STATUSES = new Set(['completed'])

type ApprovalStage = 'sketch' | 'illustration'
type ApprovalColumn = 'sketch_approved_at' | 'illustration_approved_at'

interface ApprovalPage {
  id: string
  page_number: number
  sketch_approved_at: string | null
  illustration_approved_at: string | null
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  try {
    const { pageId } = await params
    const body = await request.json().catch(() => ({}))
    const supabase = await createAdminClient()

    const { data: page, error: pageError } = await supabase
      .from('pages')
      .select('id, project_id, page_number, sketch_approved_at, illustration_approved_at')
      .eq('id', pageId)
      .single()

    if (pageError || !page) {
      return NextResponse.json({ error: 'Page not found' }, { status: 404 })
    }

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, book_title, author_firstname, author_lastname, status, review_token, show_colored_to_customer')
      .eq('id', page.project_id)
      .single()

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const token = getReviewToken(request, body)
    const isAuthorized = await verifyReviewTokenForProject(supabase, page.project_id, token)
    if (!isAuthorized) return reviewUnauthorized()

    if (FINISHED_STATUSES.has(project.status)) {
      return NextResponse.json({ error: 'Project is already finished' }, { status: 403 })
    }

    const stage: ApprovalStage = project.show_colored_to_customer ? 'illustration' : 'sketch'
    const approvalColumn: ApprovalColumn = stage === 'illustration' ? 'illustration_approved_at' : 'sketch_approved_at'
    const approvedAt = new Date().toISOString()

    const { data: updatedPage, error: updateError } = await supabase
      .from('pages')
      .update({ [approvalColumn]: approvedAt })
      .eq('id', pageId)
      .select()
      .single()

    if (updateError || !updatedPage) {
      console.error('Page approval update failed:', updateError)
      return NextResponse.json({ error: 'Failed to approve page' }, { status: 500 })
    }

    const { data: pages, error: pagesError } = await supabase
      .from('pages')
      .select('id, page_number, sketch_approved_at, illustration_approved_at')
      .eq('project_id', page.project_id)
      .order('page_number', { ascending: true })

    if (pagesError || !pages) {
      return NextResponse.json({ error: 'Failed to load approval progress' }, { status: 500 })
    }

    const approvalPages = (pages as ApprovalPage[]).filter((p) => p.page_number > 0)
    const approvedCount = approvalPages.filter((p) => !!p[approvalColumn]).length
    const totalCount = approvalPages.length
    const allApproved = totalCount > 0 && approvedCount === totalCount

    const authorName = `${project.author_firstname || ''} ${project.author_lastname || ''}`.trim() || 'Customer'
    const projectTitle = project.book_title || 'Untitled Project'
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    const projectUrl = `${baseUrl}/admin/project/${page.project_id}?tab=illustrations`

    notifyPageIllustrationApproved({
      projectTitle,
      authorName,
      projectUrl,
      pageNumber: page.page_number,
      stage: stage === 'illustration' ? 'Colored illustration review' : 'Sketch review',
    }).catch(error => console.error('Page approval notification error:', error))

    if (allApproved) {
      if (stage === 'sketch') {
        await supabase
          .from('projects')
          .update({ status: 'illustration_approved' })
          .eq('id', page.project_id)

        notifyIllustrationsApproved({
          projectId: page.project_id,
          projectTitle,
          authorName,
          projectUrl,
        }).catch(error => console.error('Sketch approval notification error:', error))
      } else {
        notifyColoredIllustrationsApproved({
          projectTitle,
          authorName,
          projectUrl,
        }).catch(error => console.error('Colored approval notification error:', error))
      }
    }

    return NextResponse.json({
      page: updatedPage,
      stage,
      approvedCount,
      totalCount,
      allApproved,
    })
  } catch (error: unknown) {
    console.error('Error approving page:', error)
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to approve page') },
      { status: 500 }
    )
  }
}
