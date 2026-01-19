const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env' })
require('dotenv').config({ path: '.env.local', override: true })

const PROJECT_ID = '90b10d9d-8c4c-4b33-a915-3e111a06ecd1'

async function check() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  const { data: pages } = await supabase
    .from('pages')
    .select('page_number, feedback_notes, is_resolved, feedback_history')
    .eq('project_id', PROJECT_ID)
    .order('page_number')

  console.log('\n=== PAGE FEEDBACK STATUS ===')
  pages?.forEach(p => {
    const hasNotes = p.feedback_notes ? '✅ HAS NOTES' : '❌ No notes'
    const resolved = p.is_resolved ? '🟢 RESOLVED' : '🟡 Not resolved'
    const historyCount = Array.isArray(p.feedback_history) ? p.feedback_history.length : 0
    console.log(`Page ${p.page_number}: ${hasNotes} | ${resolved} | History: ${historyCount}`)
    if (p.feedback_notes) console.log(`   Notes: "${p.feedback_notes.substring(0, 50)}..."`)
    if (historyCount > 0) console.log(`   History:`, JSON.stringify(p.feedback_history))
  })
}

check().catch(console.error)
