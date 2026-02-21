import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getErrorMessage } from '@/lib/utils/error'
import { removeMetadata, sanitizeFilename } from '@/lib/utils/metadata-cleaner'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ characterId: string }> }
) {
  try {
    const { characterId } = await params
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File is too large (max 10MB)' }, { status: 400 })
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
    if (!validTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type. Please upload a JPG, PNG, or HEIC image.' }, { status: 400 })
    }

    const supabase = await createAdminClient()

    const { data: character, error: charError } = await supabase
      .from('characters')
      .select('id, project_id, name, role, reference_photo_url')
      .eq('id', characterId)
      .single()

    if (charError || !character) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const cleaned = await removeMetadata(buffer)

    const baseName = sanitizeFilename(character.name || character.role || `character-${character.id}`)
    const ext = file.type === 'image/png' ? 'png' : 'jpg'
    const filename = `${character.project_id}/reference-photos/${baseName}-ref.${ext}`

    // Delete old reference photo if exists
    if (character.reference_photo_url) {
      try {
        const pathParts = character.reference_photo_url.split('/character-images/')
        if (pathParts.length > 1) {
          await supabase.storage.from('character-images').remove([pathParts[1]])
        }
      } catch {
        // Non-critical
      }
    }

    const { error: uploadError } = await supabase.storage
      .from('character-images')
      .upload(filename, cleaned, {
        contentType: file.type === 'image/png' ? 'image/png' : 'image/jpeg',
        upsert: true,
      })

    if (uploadError) {
      return NextResponse.json({ error: `Upload failed: ${uploadError.message}` }, { status: 500 })
    }

    const { data: urlData } = supabase.storage
      .from('character-images')
      .getPublicUrl(filename)

    const { error: updateError } = await supabase
      .from('characters')
      .update({ reference_photo_url: urlData.publicUrl })
      .eq('id', characterId)

    if (updateError) {
      return NextResponse.json({ error: 'Failed to save reference photo URL' }, { status: 500 })
    }

    return NextResponse.json({ url: urlData.publicUrl })
  } catch (error: unknown) {
    console.error('Error uploading reference photo:', error)
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to upload reference photo') },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ characterId: string }> }
) {
  try {
    const { characterId } = await params
    const supabase = await createAdminClient()

    const { data: character, error: charError } = await supabase
      .from('characters')
      .select('id, reference_photo_url')
      .eq('id', characterId)
      .single()

    if (charError || !character) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    }

    if (character.reference_photo_url) {
      try {
        const pathParts = character.reference_photo_url.split('/character-images/')
        if (pathParts.length > 1) {
          await supabase.storage.from('character-images').remove([pathParts[1]])
        }
      } catch {
        // Non-critical
      }
    }

    await supabase
      .from('characters')
      .update({ reference_photo_url: null })
      .eq('id', characterId)

    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Error deleting reference photo:', error)
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to delete reference photo') },
      { status: 500 }
    )
  }
}
