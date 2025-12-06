import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const supabase = await createAdminClient()

    const { data: project, error } = await supabase
      .from('projects')
      .select('id, book_title, author_firstname, author_lastname, status')
      .eq('id', id)
      .single()

    if (error || !project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(project)
  } catch (error: any) {
    console.error('Error in GET /api/projects/[id]:', error)
    return NextResponse.json(
      { error: 'Failed to fetch project' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  try {
    const supabase = await createAdminClient()

    const { data: project, error: projectCheckError } = await supabase
      .from('projects')
      .select('id, book_title')
      .eq('id', id)
      .single()

    if (projectCheckError || !project) {
      return NextResponse.json(
        { error: 'Project not found', details: projectCheckError?.message },
        { status: 404 }
      )
    }

    try {
      const { data: imageFiles } = await supabase.storage
        .from('character-images')
        .list(id, { limit: 100 })

      if (imageFiles && imageFiles.length > 0) {
        const imagePaths = imageFiles.map((file) => `${id}/${file.name}`)
        const { error: imageDeleteError } = await supabase.storage
          .from('character-images')
          .remove(imagePaths)

        if (imageDeleteError) {
          console.error('Error deleting character images:', imageDeleteError)
        }
      }

      const { data: projectFiles } = await supabase.storage
        .from('project-files')
        .list(id, { limit: 100 })

      if (projectFiles && projectFiles.length > 0) {
        const projectPaths = projectFiles.map((file) => `${id}/${file.name}`)
        const { error: projectDeleteError } = await supabase.storage
          .from('project-files')
          .remove(projectPaths)

        if (projectDeleteError) {
          console.error('Error deleting project files:', projectDeleteError)
        }
      }

      try {
        await supabase.storage.from('character-images').remove([id])
        await supabase.storage.from('project-files').remove([id])
      } catch (folderError) {
        // Folder deletion might not be supported
      }
    } catch (storageError: any) {
      console.error('Storage deletion error:', storageError)
    }

    const [charCountResult, pageCountResult, reviewCountResult] = await Promise.all([
      supabase.from('characters').select('id', { count: 'exact', head: true }).eq('project_id', id),
      supabase.from('pages').select('id', { count: 'exact', head: true }).eq('project_id', id),
      supabase.from('reviews').select('id', { count: 'exact', head: true }).eq('project_id', id),
    ])

    const charCount = charCountResult.count || 0
    const pageCount = pageCountResult.count || 0
    const reviewCount = reviewCountResult.count || 0

    const { error: deleteError } = await supabase
      .from('projects')
      .delete()
      .eq('id', id)

    if (deleteError) {
      console.error('Database deletion error:', deleteError)
      return NextResponse.json(
        {
          error: 'Failed to delete project',
          details: deleteError.message,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Project deleted successfully',
      deleted: {
        project: project.book_title,
        characters: charCount,
        pages: pageCount,
        reviews: reviewCount,
      },
    })
  } catch (error: any) {
    console.error('Unexpected error deleting project:', error)
    return NextResponse.json(
      {
        error: 'An unexpected error occurred while deleting project',
        details: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    )
  }
}


