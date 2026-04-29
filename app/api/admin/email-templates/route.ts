import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { EMAIL_TEMPLATE_SEEDS } from '@/lib/email/seed-data'

async function seedMissingTemplates() {
  const supabase = createAdminClient()

  const { data: existing, error: existingError } = await supabase
    .from('email_templates')
    .select('slug')

  if (existingError) {
    throw existingError
  }

  const existingSlugs = new Set((existing || []).map(t => t.slug))
  const toInsert = EMAIL_TEMPLATE_SEEDS.filter(t => !existingSlugs.has(t.slug))

  if (toInsert.length > 0) {
    const { error } = await supabase
      .from('email_templates')
      .insert(toInsert)

    if (error) {
      throw error
    }
  }

  return { supabase, seeded: toInsert.length }
}

export async function GET() {
  try {
    const { supabase } = await seedMissingTemplates()
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
    const { seeded } = await seedMissingTemplates()

    if (seeded === 0) {
      return NextResponse.json({ message: 'All templates already exist', seeded: 0 })
    }

    return NextResponse.json({ message: `Seeded ${seeded} new templates`, seeded })
  } catch {
    return NextResponse.json({ error: 'Failed to seed templates' }, { status: 500 })
  }
}
