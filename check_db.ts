
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing env vars')
    process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkPage() {
    const { data, error } = await supabase
        .from('pages')
        .select('id, page_number, sketch_url, illustration_url')
        .eq('page_number', 1)
        .single()

    if (error) {
        console.error('Error:', error)
    } else {
        console.log('Page 1 Data:', data)
    }
}

checkPage()
