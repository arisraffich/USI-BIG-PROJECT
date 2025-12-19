import { createAdminClient } from '@/lib/supabase/server'
import { generateSketch } from '@/lib/ai/google-ai'
import { sanitizeFilename } from '@/lib/utils/metadata-cleaner'

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
    
    const prompt = `Convert this illustration into a natural pencil sketch with authentic graphite texture. Black and white only.

STYLE: Rough pencil lines with visible grain, uneven pressure, wobble, and broken strokes. Include construction lines, smudges, and overlapping marks. No smooth digital lines, fills, or gradients.

FIDELITY RULES (STRICT):
1. DO NOT add anything not visible in the original (no extra limbs, objects, details, or background elements)
2. DO NOT remove or omit any visible element (every contour, shape, and detail must be present)
3. Maintain exact 1:1 structural replica (only style changes from color to pencil)

Preserve all proportions, positions, poses, expressions, and compositions exactly. Result must be a faithful pencil tracing with hand-drawn texture—no additions, no omissions.`
    
    // Generate sketch using Google AI
    console.log(`[Character Sketch] 📝 Calling generateSketch API...`)
    const result = await generateSketch(imageUrl, prompt)
    
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
        sketch_prompt: prompt
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
    
  } catch (error: any) {
    console.error(`[Character Sketch] ❌ CRITICAL FAILURE for ${characterName}:`, error)
    console.error(`[Character Sketch] Error details:`, {
      message: error.message,
      stack: error.stack,
      characterId,
      imageUrl
    })
    
    return {
      success: false,
      sketchUrl: null,
      error: error.message || 'Unknown error during sketch generation'
    }
  }
}

