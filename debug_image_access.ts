
import { createAdminClient } from './lib/supabase/server'

async function checkImageAccess() {
    const supabase = createAdminClient()

    // 1. Get Page 1 URLs
    // We need a projectId. I'll grab the most recently updated project or page.
    const { data: page, error } = await supabase
        .from('pages')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single()

    if (error || !page) {
        console.error('No pages found:', error)
        return
    }

    console.log(`Checking Page ID: ${page.id}`)
    console.log(`Sketch URL: ${page.sketch_url}`)
    console.log(`Illustration URL: ${page.illustration_url}`)

    const urlsToCheck = []
    if (page.sketch_url) urlsToCheck.push({ type: 'sketch', url: page.sketch_url })
    if (page.illustration_url) urlsToCheck.push({ type: 'illustration', url: page.illustration_url })

    for (const item of urlsToCheck) {
        if (!item.url) continue
        console.log(`\nTesting ${item.type} URL...`)
        try {
            const res = await fetch(item.url)
            console.log(`Status: ${res.status} ${res.statusText}`)
            console.log(`Content-Type: ${res.headers.get('content-type')}`)
            console.log(`Content-Length: ${res.headers.get('content-length')}`)
            
            if (!res.ok) {
                console.error(`❌ URL is not publicly accessible!`)
            } else {
                const contentType = res.headers.get('content-type')
                if (contentType && contentType.startsWith('image/')) {
                    console.log(`✅ Valid Image accessible.`)
                } else {
                    console.error(`❌ URL returned non-image content (likely HTML error page).`)
                }
            }
        } catch (e) {
            console.error(`Fetch failed:`, e)
        }
    }
}

checkImageAccess()
