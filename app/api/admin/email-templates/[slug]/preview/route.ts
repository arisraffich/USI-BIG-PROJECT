import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { renderFromTemplate } from '@/lib/email/renderer'
import { SAMPLE_VARIABLES } from '@/lib/email/seed-data'
import type { EmailTemplate } from '@/lib/email/types'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('email_templates')
      .select('*')
      .eq('slug', slug)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    const rendered = renderFromTemplate(data as EmailTemplate, SAMPLE_VARIABLES)

    return new NextResponse(rendered.html, {
      headers: { 'Content-Type': 'text/html' },
    })
  } catch {
    return NextResponse.json({ error: 'Failed to render preview' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params
    const body = await request.json()

    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('email_templates')
      .select('*')
      .eq('slug', slug)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    const template = data as EmailTemplate
    const draft = {
      ...template,
      subject: body.subject ?? template.subject,
      body_html: body.body_html ?? template.body_html,
      closing_html: body.closing_html ?? template.closing_html,
      button_text: body.button_text ?? template.button_text,
      button_color: body.button_color ?? template.button_color,
    }

    const rendered = renderFromTemplate(draft, SAMPLE_VARIABLES)

    return new NextResponse(rendered.html, {
      headers: { 'Content-Type': 'text/html' },
    })
  } catch {
    return NextResponse.json({ error: 'Failed to render preview' }, { status: 500 })
  }
}
