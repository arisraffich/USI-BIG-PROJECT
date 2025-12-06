import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getProjectCounts } from '@/lib/utils/project-counts'
import { createErrorResponse } from '@/lib/utils/api-error'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const supabase = await createAdminClient()
    const counts = await getProjectCounts(supabase, id)

    return NextResponse.json({
      pages: counts.pageCount,
      characters: counts.characterCount,
    })
  } catch (error) {
    return createErrorResponse(error, 'Failed to fetch counts', 500)
  }
}



