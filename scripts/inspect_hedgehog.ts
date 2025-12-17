
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

async function inspectProject(projectId: string) {
    console.log('Inspecting Project:', projectId)

    // 1. Get Characters
    const { data: characters, error: charError } = await supabase
        .from('characters')
        .select('id, name, role, image_url, is_main')
        .eq('project_id', projectId)

    if (charError) console.error('Char Error:', charError)
    console.log('--- Characters ---')
    characters?.forEach(c => {
        console.log(`Name: "${c.name}", Role: "${c.role}", Main: ${c.is_main}`)
        console.log(`Image: ${c.image_url ? 'Yes' : 'No'}`)
    })

    // 2. Get Page 1 (Anchor)
    const { data: page1, error: pageError } = await supabase
        .from('pages')
        .select('id, page_number, illustration_url')
        .eq('project_id', projectId)
        .eq('page_number', 1)
        .single()

    if (pageError) console.error('Page Error:', pageError)
    console.log('--- Page 1 (Style Anchor) ---')
    console.log(`Has Illustration: ${page1?.illustration_url ? 'Yes' : 'No'}`)
    if (page1?.illustration_url) console.log(`URL: ${page1.illustration_url}`)
}

inspectProject('939fec2b-0718-4370-a8a3-5c8dc4c09fa8')
