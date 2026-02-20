import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { EMAIL_TEMPLATE_SEEDS } from '@/lib/email/seed-data'

export async function GET() {
  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('email_templates')
      .select('*')
      .order('sort_order', { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'Failed to load templates' }, { status: 500 })
  }
}

export async function POST() {
  try {
    const supabase = createAdminClient()

    const { data: existing } = await supabase
      .from('email_templates')
      .select('slug')

    const existingSlugs = new Set((existing || []).map(t => t.slug))
    const toInsert = EMAIL_TEMPLATE_SEEDS.filter(t => !existingSlugs.has(t.slug))

    if (toInsert.length === 0) {
      return NextResponse.json({ message: 'All templates already exist', seeded: 0 })
    }

    const { error } = await supabase
      .from('email_templates')
      .insert(toInsert)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ message: `Seeded ${toInsert.length} new templates`, seeded: toInsert.length })
  } catch {
    return NextResponse.json({ error: 'Failed to seed templates' }, { status: 500 })
  }
}
