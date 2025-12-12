import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET() {
    try {
        const supabase = createAdminClient()

        const updates = []

        // Fix Illustrations Bucket
        const { data: illData, error: illError } = await supabase.storage.updateBucket('illustrations', {
            public: true,
            fileSizeLimit: 52428800,
            allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp']
        })
        updates.push({ bucket: 'illustrations', data: illData, error: illError })

        // Fix Sketches Bucket
        const { data: skData, error: skError } = await supabase.storage.updateBucket('sketches', {
            public: true,
            fileSizeLimit: 52428800,
            allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp']
        })
        updates.push({ bucket: 'sketches', data: skData, error: skError })

        return NextResponse.json({
            success: true,
            message: 'Buckets updated to public',
            updates
        })

    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
