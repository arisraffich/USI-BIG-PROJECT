import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET() {
    try {
        const supabase = createAdminClient()

        // 1. Create Bucket
        const { data, error } = await supabase.storage.createBucket('illustrations', {
            public: true,
            fileSizeLimit: 52428800, // 50MB
            allowedMimeTypes: ['image/png', 'image/jpeg', 'image/webp']
        })

        if (error) {
            if (error.message.includes('already exists')) {
                return NextResponse.json({ message: 'Bucket already exists' })
            }
            throw error
        }

        // 2. Setup Policy (The bucket creation with public: true handles the read policy mostly, 
        // but for RLS we might need SQL. However, for now, getting the bucket to exist is step 1.
        // The previous migration file I wrote won't run, so I can't rely on it for policies.
        // But createBucket with public: true usually makes it readable.
        // Uploads usually require RLS. Admin client bypasses RLS, so the API route uploads will work fine!)

        return NextResponse.json({ success: true, message: 'Bucket created successfully', data })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
