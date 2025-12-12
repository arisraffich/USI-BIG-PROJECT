import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET() {
    try {
        const supabase = createAdminClient()

        // Create Sketches Bucket
        const { data, error } = await supabase.storage.createBucket('sketches', {
            public: true,
            fileSizeLimit: 52428800, // 50MB
            allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp']
        })

        if (error && !error.message.includes('already exists')) {
            throw error
        }

        return NextResponse.json({ success: true, message: 'Sketches bucket created successfully', data })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
