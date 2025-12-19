import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createAdminClient()

    // Get characters
    const { data: characters, error } = await supabase
      .from('characters')
      .select('id, name, role, is_main, image_url, sketch_url, customer_image_url, customer_sketch_url')
      .eq('project_id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      project_id: id,
      total_characters: characters?.length || 0,
      characters: characters?.map(c => ({
        id: c.id,
        name: c.name || c.role,
        is_main: c.is_main,
        has_image_url: !!c.image_url,
        has_sketch_url: !!c.sketch_url,
        has_customer_image_url: !!c.customer_image_url,
        has_customer_sketch_url: !!c.customer_sketch_url,
        image_url: c.image_url,
        customer_image_url: c.customer_image_url,
      }))
    })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

