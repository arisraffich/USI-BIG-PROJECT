import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/admin'
import { sendEmail } from '@/lib/notifications/email'
import { loadTemplate, renderFromTemplate } from '@/lib/email/renderer'
import { EMAIL_TEMPLATE_SEEDS } from '@/lib/email/seed-data'
import type { EmailTemplate } from '@/lib/email/types'
import {
  editableTextToHtml,
  getFollowUpButtonText,
  getFollowUpEpisodeKey,
  getFollowUpReviewUrl,
  getFollowUpStage,
  getFollowUpStageLabel,
  getFollowUpTemplateSlug,
  htmlToEditableText,
  MAX_FOLLOW_UP_SEQUENCE,
  replaceTemplateVariables,
} from '@/lib/project-followups'
import { getErrorMessage } from '@/lib/utils/error'

export const dynamic = 'force-dynamic'

interface ProjectRow {
  id: string
  status: string
  review_token: string | null
  book_title: string
  author_firstname: string
  author_lastname: string
  author_email: string
  created_at: string | null
  status_changed_at: string | null
  character_send_count: number | null
  illustration_send_count: number | null
}

interface FollowUpRow {
  sequence: number
  status: string
  sent_at: string | null
}

function isMissingFollowUpsTable(error: { code?: string; message?: string } | null | undefined): boolean {
  return Boolean(
    error &&
    (
      error.code === 'PGRST205' ||
      error.message?.includes('project_followups')
    )
  )
}

function fallbackTemplate(slug: string): EmailTemplate | null {
  const seed = EMAIL_TEMPLATE_SEEDS.find(template => template.slug === slug)
  if (!seed) return null

  return {
    ...seed,
    id: '',
    created_at: '',
    updated_at: '',
  }
}

async function loadProject(projectId: string): Promise<ProjectRow | null> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('projects')
    .select('id, status, review_token, book_title, author_firstname, author_lastname, author_email, created_at, status_changed_at, character_send_count, illustration_send_count')
    .eq('id', projectId)
    .single()

  if (error || !data) return null
  return data as ProjectRow
}

async function loadFollowUpRows(projectId: string, stage: string, episodeKey: string): Promise<FollowUpRow[]> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('project_followups')
    .select('sequence, status, sent_at')
    .eq('project_id', projectId)
    .eq('stage', stage)
    .eq('episode_key', episodeKey)
    .eq('is_test', false)

  if (error) {
    if (isMissingFollowUpsTable(error)) return []
    throw new Error(error.message)
  }

  return (data || []) as FollowUpRow[]
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function getSentState(rows: FollowUpRow[]) {
  const sentRows = rows.filter(row => row.status === 'sent')
  const lastSentAt = sentRows
    .map(row => row.sent_at)
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) || null

  return {
    sentCount: sentRows.length,
    isSending: rows.some(row => row.status === 'sending'),
    lastSentAt,
  }
}

async function buildDraft(projectId: string) {
  const project = await loadProject(projectId)
  if (!project) {
    return { error: NextResponse.json({ error: 'Project not found' }, { status: 404 }) }
  }

  const stage = getFollowUpStage(project)
  if (!stage) {
    return { error: NextResponse.json({ error: 'This project is not ready for a follow-up email' }, { status: 409 }) }
  }

  const reviewUrl = getFollowUpReviewUrl(project, stage)
  if (!reviewUrl) {
    return { error: NextResponse.json({ error: 'Project is missing a customer review link' }, { status: 409 }) }
  }

  if (!project.author_email) {
    return { error: NextResponse.json({ error: 'Project is missing customer email' }, { status: 409 }) }
  }

  const episodeKey = getFollowUpEpisodeKey(project, stage)
  const rows = await loadFollowUpRows(project.id, stage, episodeKey)
  const { sentCount, isSending, lastSentAt } = getSentState(rows)

  if (isSending) {
    return {
      error: NextResponse.json(
        { error: 'A follow-up email is already being sent for this project' },
        { status: 409 }
      ),
    }
  }

  if (sentCount >= MAX_FOLLOW_UP_SEQUENCE) {
    return {
      error: NextResponse.json(
        {
          error: 'Maximum follow-ups already sent for this waiting round',
          count: sentCount,
          max: MAX_FOLLOW_UP_SEQUENCE,
          lastSentAt,
        },
        { status: 409 }
      ),
    }
  }

  const sequence = sentCount + 1
  const templateSlug = getFollowUpTemplateSlug(stage, sequence)
  const template = await loadTemplate(templateSlug) || fallbackTemplate(templateSlug)

  if (!template) {
    return { error: NextResponse.json({ error: 'Follow-up email template not found' }, { status: 500 }) }
  }

  const variables = {
    authorFirstName: project.author_firstname || 'there',
    reviewUrl,
  }

  return {
    project,
    stage,
    episodeKey,
    sequence,
    sentCount,
    lastSentAt,
    template,
    templateSlug,
    reviewUrl,
    subject: replaceTemplateVariables(template.subject, variables),
    bodyText: htmlToEditableText(replaceTemplateVariables(template.body_html, variables)),
    closingText: htmlToEditableText(replaceTemplateVariables(template.closing_html || '', variables)),
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const unauthorized = await requireAdmin(request)
    if (unauthorized) return unauthorized

    const { id } = await params
    const draft = await buildDraft(id)
    if ('error' in draft) return draft.error

    return NextResponse.json({
      stage: draft.stage,
      stageLabel: getFollowUpStageLabel(draft.stage),
      sequence: draft.sequence,
      count: draft.sentCount,
      max: MAX_FOLLOW_UP_SEQUENCE,
      lastSentAt: draft.lastSentAt,
      recipientEmail: draft.project.author_email,
      subject: draft.subject,
      bodyText: draft.bodyText,
      closingText: draft.closingText,
      buttonText: draft.template.button_text || getFollowUpButtonText(draft.stage),
      reviewUrl: draft.reviewUrl,
    })
  } catch (error) {
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to load follow-up draft') },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let followUpId: string | null = null

  try {
    const unauthorized = await requireAdmin(request)
    if (unauthorized) return unauthorized

    const { id } = await params
    const body = await request.json()
    const recipientEmail = typeof body.recipientEmail === 'string' ? body.recipientEmail.trim() : ''
    const subject = typeof body.subject === 'string' ? body.subject.trim() : ''
    const bodyText = typeof body.bodyText === 'string' ? body.bodyText.trim() : ''
    const closingText = typeof body.closingText === 'string' ? body.closingText.trim() : ''

    if (!recipientEmail || !subject || !bodyText) {
      return NextResponse.json({ error: 'Recipient, subject, and email body are required' }, { status: 400 })
    }

    if (!isValidEmail(recipientEmail)) {
      return NextResponse.json({ error: 'Enter a valid recipient email address' }, { status: 400 })
    }

    const draft = await buildDraft(id)
    if ('error' in draft) return draft.error

    const rendered = renderFromTemplate(
      {
        ...draft.template,
        subject,
        body_html: editableTextToHtml(bodyText),
        closing_html: closingText ? editableTextToHtml(closingText) : null,
        has_button: true,
        button_text: draft.template.button_text || getFollowUpButtonText(draft.stage),
        button_color: draft.template.button_color || '#2563eb',
        button_url_variable: 'reviewUrl',
      },
      { reviewUrl: draft.reviewUrl }
    )

    const supabase = createAdminClient()
    const { data: inserted, error: insertError } = await supabase
      .from('project_followups')
      .insert({
        project_id: draft.project.id,
        stage: draft.stage,
        episode_key: draft.episodeKey,
        sequence: draft.sequence,
        template_slug: draft.templateSlug,
        recipient_email: recipientEmail,
        subject: rendered.subject,
        body_html: rendered.html,
        status: 'sending',
        is_test: false,
      })
      .select('id')
      .single()

    if (insertError || !inserted) {
      if (isMissingFollowUpsTable(insertError)) {
        return NextResponse.json(
          { error: 'Follow-up history table is missing. Apply the project_followups migration before sending follow-ups.' },
          { status: 409 }
        )
      }

      return NextResponse.json(
        { error: insertError?.message || 'Could not create follow-up record' },
        { status: insertError?.code === '23505' ? 409 : 500 }
      )
    }

    followUpId = inserted.id as string

    try {
      await sendEmail({
        to: recipientEmail,
        subject: rendered.subject,
        html: rendered.html,
      })
    } catch (sendError) {
      await supabase
        .from('project_followups')
        .update({
          status: 'failed',
          error: getErrorMessage(sendError),
        })
        .eq('id', followUpId)

      throw sendError
    }

    const sentAt = new Date().toISOString()
    const { error: updateError } = await supabase
      .from('project_followups')
      .update({
        status: 'sent',
        sent_at: sentAt,
        error: null,
      })
      .eq('id', followUpId)

    if (updateError) {
      throw new Error(updateError.message)
    }

    return NextResponse.json({
      success: true,
      count: draft.sequence,
      max: MAX_FOLLOW_UP_SEQUENCE,
      lastSentAt: sentAt,
    })
  } catch (error) {
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to send follow-up email') },
      { status: 500 }
    )
  }
}
