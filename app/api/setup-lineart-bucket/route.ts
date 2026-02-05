import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET() {
    try {
        const supabase = await createAdminClient()

        const { data, error } = await supabase.storage.createBucket('lineart', {
            public: true,
            fileSizeLimit: 52428800, // 50MB
            allowedMimeTypes: ['image/png']
        })

        if (error) {
            if (error.message.includes('already exists')) {
                return NextResponse.json({ message: 'Lineart bucket already exists' })
            }
            throw error
        }

        return NextResponse.json({ success: true, message: 'Lineart bucket created', data })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
