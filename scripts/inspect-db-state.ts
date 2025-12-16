
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// Load .env AND .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env') })
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

console.log('SUPABASE_URL:', process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Loaded' : 'MISSING')
console.log('SUPABASE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Loaded' : 'MISSING')

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
    console.log("🕵️‍♀️ Inspecting Database Schema state...")

    // 1. Check if 'project_locations' table exists
    const { error: tableError } = await supabase
        .from('project_locations')
        .select('id')
        .limit(1)

    const locationsTableExists = !tableError || tableError.code !== '42P01' // 42P01 is "undefined_table"
    console.log(`- Table 'project_locations': ${locationsTableExists ? 'EXISTS' : 'MISSING (Clean)'}`)

    // 2. Check if 'pages' has 'location_tag'
    const { error: columnError } = await supabase
        .from('pages')
        .select('location_tag')
        .limit(1)

    const locationTagExists = !columnError
    console.log(`- Column 'pages.location_tag': ${locationTagExists ? 'EXISTS' : 'MISSING (Clean)'}`)

    // 3. Check if 'pages' has 'director_output_v2'
    const { error: directorError } = await supabase
        .from('pages')
        .select('director_output_v2')
        .limit(1)

    const directorOutputV2Exists = !directorError
    console.log(`- Column 'pages.director_output_v2': ${directorOutputV2Exists ? 'EXISTS' : 'MISSING (Clean)'}`)
}

main()
