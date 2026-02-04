import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

// GET - Fetch project settings
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const supabase = await createAdminClient()

        const { data, error } = await supabase
            .from('projects')
            .select('show_colored_to_customer')
            .eq('id', id)
            .single()

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({
            show_colored_to_customer: data?.show_colored_to_customer ?? false
        })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}

// PATCH - Update project settings
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params
        const body = await request.json()
        const { show_colored_to_customer } = body

        if (typeof show_colored_to_customer !== 'boolean') {
            return NextResponse.json(
                { error: 'show_colored_to_customer must be a boolean' },
                { status: 400 }
            )
        }

        const supabase = await createAdminClient()

        const { data, error } = await supabase
            .from('projects')
            .update({ show_colored_to_customer })
            .eq('id', id)
            .select('show_colored_to_customer')
            .single()

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({
            success: true,
            show_colored_to_customer: data?.show_colored_to_customer ?? false
        })
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
