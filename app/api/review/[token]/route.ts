import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params

    if (!token) {
      return NextResponse.json(
        { error: 'Review token is required' },
        { status: 400 }
      )
    }

    const supabase = await createAdminClient()

    // Find project by review token
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, book_title, author_firstname, author_lastname, status, review_token')
      .eq('review_token', token)
      .single()

    if (projectError || !project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    // Check if project is in correct status
    if (project.status !== 'character_review') {
      return NextResponse.json(
        { error: 'Project is not available for review' },
        { status: 403 }
      )
    }

    // Fetch pages
    const { data: pages, error: pagesError } = await supabase
      .from('pages')
      .select('*')
      .eq('project_id', project.id)
      .order('page_number', { ascending: true })

    if (pagesError) {
      console.error('Error fetching pages:', pagesError)
    }

    // Fetch characters
    const { data: characters, error: charactersError } = await supabase
      .from('characters')
      .select('*')
      .eq('project_id', project.id)
      .order('is_main', { ascending: false })

    if (charactersError) {
      console.error('Error fetching characters:', charactersError)
    }

    return NextResponse.json({
      project: {
        id: project.id,
        book_title: project.book_title,
        author_firstname: project.author_firstname,
        author_lastname: project.author_lastname,
        status: project.status,
      },
      pages: pages || [],
      characters: characters || [],
    })
  } catch (error: any) {
    console.error('Error fetching review project:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch project' },
      { status: 500 }
    )
  }
}











