import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!

console.log('Testing connection to:', url)
const supabase = createClient(url, key)

async function test() {
    const { data, error } = await supabase.from('projects').select('count', { count: 'exact', head: true })

    if (error) {
        console.error('❌ Connection Failed:', error.message)
        console.error('Code:', error.code)
        console.error('Details:', error.details)
    } else {
        console.log('✅ Connection Successful!')
    }
}

test()
