import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

const CRON_SECRET = process.env.CRON_SECRET

// POST: Called by pg_cron every minute to process due scheduled sends
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createAdminClient()

    // Fetch all pending sends that are due
    const { data: dueSends, error: fetchError } = await supabase
      .from('scheduled_sends')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true })

    if (fetchError) throw fetchError
    if (!dueSends || dueSends.length === 0) {
      return NextResponse.json({ processed: 0 })
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    let processed = 0
    let failed = 0

    for (const send of dueSends) {
      try {
        // Mark as in-progress to prevent double-execution
        await supabase
          .from('scheduled_sends')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', send.id)
          .eq('status', 'pending')

        const res = await fetch(`${baseUrl}/api/projects/${send.project_id}/send-to-customer`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${CRON_SECRET}`,
          },
          body: JSON.stringify({ personalNote: send.personal_note || undefined }),
        })

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          throw new Error(errData.error || `HTTP ${res.status}`)
        }

        processed++
        console.log(`✅ Scheduled send executed: ${send.id} (project: ${send.project_id}, action: ${send.action_type})`)
      } catch (err) {
        failed++
        const errorMessage = err instanceof Error ? err.message : 'Unknown error'
        console.error(`❌ Scheduled send failed: ${send.id}`, errorMessage)

        // Mark as failed with error message
        await supabase
          .from('scheduled_sends')
          .update({
            status: 'failed',
            error_message: errorMessage,
            completed_at: new Date().toISOString(),
          })
          .eq('id', send.id)
      }
    }

    return NextResponse.json({ processed, failed, total: dueSends.length })
  } catch (error) {
    console.error('Scheduled sends execute error:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
