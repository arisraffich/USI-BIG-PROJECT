import { createAdminClient } from '@/lib/supabase/server'
import { generateSketch } from '@/lib/ai/google-ai'
import { sanitizeFilename } from '@/lib/utils/metadata-cleaner'
import { getErrorMessage } from '@/lib/utils/error'
import { SKETCH_PROMPT } from '@/lib/ai/sketch-prompt'

/**
 * Generate a pencil sketch from a character's colored illustration
 * Handles the complete flow: generation → upload → database update
 */
export async function generateCharacterSketch(
  characterId: string,
  imageUrl: string,
  projectId: string,
  characterName: string
): Promise<{ success: boolean; sketchUrl: string | null; error: string | null }> {
  try {
    console.log(`[Character Sketch] 🎨 Starting sketch generation for: ${characterName} (${characterId})`)
    
    // Generate sketch using Google AI
    console.log(`[Character Sketch] 📝 Calling generateSketch API...`)
    const result = await generateSketch(imageUrl, SKETCH_PROMPT)
    
    if (!result.success || !result.imageBuffer) {
      const errorMsg = result.error || 'Sketch generation returned no image buffer'
      console.error(`[Character Sketch] ❌ Generation failed:`, errorMsg)
      throw new Error(errorMsg)
    }
    
    console.log(`[Character Sketch] ✅ Image generated, now uploading...`)
    
    // Upload to storage
    const supabase = await createAdminClient()
    const timestamp = Date.now()
    const sanitizedName = sanitizeFilename(characterName)
    const filename = `${projectId}/characters/${sanitizedName}-sketch-${timestamp}.png`
    
    const { error: uploadError } = await supabase.storage
      .from('character-sketches')
      .upload(filename, result.imageBuffer, {
        contentType: 'image/png',
        upsert: true
      })
    
    if (uploadError) {
      console.error(`[Character Sketch] ❌ Upload failed:`, uploadError.message)
      throw new Error(`Upload failed: ${uploadError.message}`)
    }
    
    // Get public URL
    const { data: urlData } = supabase.storage
      .from('character-sketches')
      .getPublicUrl(filename)
    
    console.log(`[Character Sketch] 📤 Uploaded to: ${filename}`)
    
    // Update character record
    const { error: updateError } = await supabase
      .from('characters')
      .update({
        sketch_url: urlData.publicUrl,
        sketch_prompt: SKETCH_PROMPT
      })
      .eq('id', characterId)
    
    if (updateError) {
      console.error(`[Character Sketch] ⚠️ Database update failed:`, updateError.message)
      // Don't throw - image is uploaded, just log warning
    }
    
    console.log(`[Character Sketch] ✅ SUCCESS: ${characterName} sketch complete!`)
    
    return {
      success: true,
      sketchUrl: urlData.publicUrl,
      error: null
    }
    
  } catch (error: unknown) {
    console.error(`[Character Sketch] ❌ CRITICAL FAILURE for ${characterName}:`, error)
    console.error(`[Character Sketch] Error details:`, {
      message: getErrorMessage(error),
      stack: error instanceof Error ? error.stack : undefined,
      characterId,
      imageUrl
    })
    
    // Save error to sketch_url so UI knows to stop showing loading spinner
    try {
      const supabase = await createAdminClient()
      await supabase
        .from('characters')
        .update({ sketch_url: `error:${getErrorMessage(error, 'Sketch generation failed')}` })
        .eq('id', characterId)
      console.log(`[Character Sketch] ⚠️ Saved error state for ${characterName}`)
    } catch (dbErr) {
      console.error(`[Character Sketch] Failed to save error state:`, dbErr)
    }
    
    return {
      success: false,
      sketchUrl: null,
      error: getErrorMessage(error, 'Unknown error during sketch generation')
    }
  }
}




