import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getErrorMessage } from '@/lib/utils/error'

/**
 * One-time migration: Add original_illustration_url column to pages table
 * 
 * This column stores the first successful illustration generation for each page,
 * preserving an immutable quality reference for style anchoring and "Reset to Original".
 * 
 * Safe to run multiple times (uses IF NOT EXISTS via ADD COLUMN IF NOT EXISTS).
 * 
 * Call: GET /api/migrations/add-original-illustration-url
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const expectedToken = process.env.MIGRATION_SECRET_TOKEN

  if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const supabase = await createAdminClient()

    // Add the column
    const { error: alterError } = await supabase.rpc('exec_sql', {
      query: `ALTER TABLE pages ADD COLUMN IF NOT EXISTS original_illustration_url TEXT;`
    })

    if (alterError) {
      // Fallback: try direct SQL if exec_sql RPC doesn't exist
      console.warn('exec_sql RPC failed, trying alternative:', alterError.message)
      
      // Use raw REST API call to PostgREST won't work for DDL,
      // so just backfill existing illustrations as originals
      const { data: pages, error: fetchError } = await supabase
        .from('pages')
        .select('id, illustration_url, original_illustration_url')
        .not('illustration_url', 'is', null)

      if (fetchError) {
        return NextResponse.json({
          error: 'Column may need to be added manually via Supabase SQL Editor',
          sql: 'ALTER TABLE pages ADD COLUMN IF NOT EXISTS original_illustration_url TEXT;',
          details: alterError.message
        }, { status: 500 })
      }

      // If we got here, column already exists — backfill
      let backfilled = 0
      for (const page of (pages || [])) {
        if (!page.original_illustration_url && page.illustration_url) {
          await supabase
            .from('pages')
            .update({ original_illustration_url: page.illustration_url })
            .eq('id', page.id)
          backfilled++
        }
      }

      return NextResponse.json({
        success: true,
        message: `Column already exists. Backfilled ${backfilled} pages with original illustration URLs.`
      })
    }

    // Backfill: Set original_illustration_url = illustration_url for all existing pages that have illustrations
    const { data: pages } = await supabase
      .from('pages')
      .select('id, illustration_url')
      .not('illustration_url', 'is', null)

    let backfilled = 0
    for (const page of (pages || [])) {
      if (page.illustration_url) {
        await supabase
          .from('pages')
          .update({ original_illustration_url: page.illustration_url })
          .eq('id', page.id)
        backfilled++
      }
    }

    return NextResponse.json({
      success: true,
      message: `Column added and ${backfilled} pages backfilled with original illustration URLs.`
    })

  } catch (error: unknown) {
    console.error('Migration error:', error)
    return NextResponse.json(
      { error: getErrorMessage(error, 'Migration failed') },
      { status: 500 }
    )
  }
}
