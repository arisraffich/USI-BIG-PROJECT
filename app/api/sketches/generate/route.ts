import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { replicate } from '@/lib/ai/replicate'
import { buildSketchPrompt } from '@/lib/utils/prompt-builder'
import { removeMetadata } from '@/lib/utils/metadata-cleaner'

export async function POST(request: NextRequest) {
  try {
    const { project_id, page_id } = await request.json()

    if (!project_id) {
      return NextResponse.json(
        { error: 'project_id is required' },
        { status: 400 }
      )
    }

    const supabase = await createAdminClient()

    // Get project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('*')
      .eq('id', project_id)
      .single()

    if (projectError || !project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      )
    }

    // Validate project settings
    if (!project.aspect_ratio || !project.text_integration) {
      return NextResponse.json(
        {
          error:
            'Project aspect_ratio and text_integration must be set before generating sketches',
        },
        { status: 400 }
      )
    }

    // Get pages to generate
    let pagesToGenerate
    if (page_id) {
      // Generate single page
      const { data: page, error: pageError } = await supabase
        .from('pages')
        .select('*')
        .eq('id', page_id)
        .eq('project_id', project_id)
        .single()

      if (pageError || !page) {
        return NextResponse.json(
          { error: 'Page not found' },
          { status: 404 }
        )
      }

      pagesToGenerate = [page]
    } else {
      // Generate all pages
      const { data: pages, error: pagesError } = await supabase
        .from('pages')
        .select('*')
        .eq('project_id', project_id)
        .order('page_number', { ascending: true })

      if (pagesError) {
        return NextResponse.json(
          { error: 'Failed to fetch pages' },
          { status: 500 }
        )
      }

      pagesToGenerate = pages || []
    }

    if (pagesToGenerate.length === 0) {
      return NextResponse.json(
        { error: 'No pages to generate' },
        { status: 400 }
      )
    }

    // Get all characters for this project
    const { data: characters, error: charsError } = await supabase
      .from('characters')
      .select('*')
      .eq('project_id', project_id)

    if (charsError) {
      return NextResponse.json(
        { error: 'Failed to fetch characters' },
        { status: 500 }
      )
    }

    const results = []

    // Generate sketch for each page
    for (const page of pagesToGenerate) {
      try {
        // Get characters for this page
        const pageCharacters =
          characters?.filter((c) => page.character_ids.includes(c.id)) || []

        // Ensure we have character images
        const charactersWithImages = pageCharacters.filter(
          (c) => c.image_url
        )

        if (charactersWithImages.length === 0) {
          throw new Error(
            'No character images available for this page. Generate character images first.'
          )
        }

        // Build prompt
        const prompt = buildSketchPrompt(page, pageCharacters, project)

        // Prepare character images as input
        const characterImages = charactersWithImages.map((c) => c.image_url!)

        // Map aspect ratio from project setting to Replicate format
        const aspectRatioMap: Record<string, string> = {
          '1:1': '1:1',
          '2:3': '2:3',
          '3:2': '3:2',
          '3:4': '3:4',
          '4:3': '4:3',
          '4:5': '4:5',
          '5:4': '5:4',
          '9:16': '9:16',
          '16:9': '16:9',
          '21:9': '21:9',
        }
        const aspectRatio =
          aspectRatioMap[project.aspect_ratio] || '4:3'

        // Generate sketch using Replicate
        const output = await replicate.run('google/nano-banana-pro', {
          input: {
            prompt: prompt,
            image_input: characterImages,
            aspect_ratio: aspectRatio,
            output_format: 'png',
            safety_filter_level: 'block_only_high',
            resolution: '2K',
          },
        })

        // Handle Replicate output
        let imageUrl: string
        if (typeof output === 'string') {
          imageUrl = output
        } else if (output && typeof (output as any).url === 'function') {
          imageUrl = (output as any).url()
        } else if (output && typeof output === 'object' && 'url' in output) {
          imageUrl = output.url as string
        } else {
          throw new Error('Unexpected output format from Replicate')
        }

        // Download generated image
        const imageResponse = await fetch(imageUrl)
        if (!imageResponse.ok) {
          throw new Error(`Failed to download image: ${imageResponse.statusText}`)
        }
        const imageBuffer = await imageResponse.arrayBuffer()

        // Remove metadata
        const cleanedImage = await removeMetadata(imageBuffer)

        // Upload to Supabase Storage
        const filename = `${project_id}/sketches/sketch-${page.page_number}.png`
        const { error: uploadError } = await supabase.storage
          .from('project-files')
          .upload(filename, cleanedImage, {
            contentType: 'image/png',
            upsert: true,
          })

        if (uploadError) {
          throw new Error(`Failed to upload sketch: ${uploadError.message}`)
        }

        // Get public URL
        const { data: urlData } = supabase.storage
          .from('project-files')
          .getPublicUrl(filename)
        const publicUrl = urlData.publicUrl

        // Update page record
        const { error: updateError } = await supabase
          .from('pages')
          .update({
            sketch_url: publicUrl,
            sketch_prompt: prompt,
          })
          .eq('id', page.id)

        if (updateError) {
          throw new Error(`Failed to update page: ${updateError.message}`)
        }

        results.push({
          page_id: page.id,
          page_number: page.page_number,
          success: true,
          sketch_url: publicUrl,
        })
      } catch (error: any) {
        console.error(`Error generating sketch for page ${page.page_number}:`, error)
        results.push({
          page_id: page.id,
          page_number: page.page_number,
          success: false,
          error: error.message || 'Generation failed',
        })
      }
    }

    // Update project status if all succeeded
    const allSucceeded = results.every((r) => r.success)
    if (allSucceeded && results.length > 0) {
      await supabase
        .from('projects')
        .update({ status: 'sketch_ready' })
        .eq('id', project_id)
    }

    return NextResponse.json({
      success: true,
      results,
      generated: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    })
  } catch (error: any) {
    console.error('Error generating sketches:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to generate sketches' },
      { status: 500 }
    )
  }
}












