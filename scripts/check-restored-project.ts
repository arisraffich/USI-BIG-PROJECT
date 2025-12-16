
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// Load .env AND .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env') })
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

console.log('SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Loaded' : 'MISSING')

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
    const projectId = '8ed6e5c3-0884-470a-8b8e-320d94dc3d2c'
    console.log(`🕵️‍♀️ Checking for Project ID: ${projectId}`)

    const { data, error } = await supabase
        .from('projects')
        .select('id, book_title')
        .eq('id', projectId)
        .single()

    if (error) {
        console.log(`❌ Error / Not Found: ${error.message}`)
        if (error.code === 'PGRST116') console.log("Make sure the Snapshot you restored contains this project.")
    } else {
        console.log(`✅ Project Found: "${data.book_title}"`)
    }
}

main()
