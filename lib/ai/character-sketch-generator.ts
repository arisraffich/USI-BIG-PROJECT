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
    
    const prompt = `Convert the illustration into a loose, natural pencil draft sketch with real pencil texture. 
Black and white only. Use rough graphite lines with visible grain, uneven pressure, slight wobble, and broken strokes. 
Include light construction lines, faint smudges, and subtle overlapping marks. 
No digital-looking smooth lines. No fills or gradients.

Preserve every character, pose, expression, and composition exactly, but make the linework look hand-drawn with a physical pencil on paper.

ABSOLUTE FIDELITY RULES — NO EXCEPTIONS:

1. Do NOT add, invent, or complete any element that does not exist in the original illustration. 
   Do NOT infer or reconstruct hidden or partially obscured body parts. 
   If something is not visible in the original image, it must NOT appear in the sketch. 
   No extra hands, limbs, fingers, objects, lines, shadows, or background details may be added. 
   Zero new visual information may be introduced.

2. Do NOT remove or omit any element from the original illustration. 
   Every visible detail in the source image must be present in the sketch. 
   Every contour, shape, object, background element, character detail, and texture must be fully represented. 
   Nothing may be skipped or simplified away.

3. The sketch must be a 1:1 structural replica of the original illustration. 
   Only the rendering style may change (from color to pencil). 
   All proportions, positions, shapes, silhouettes, overlaps, and compositions must remain identical.

The result must look like a faithful pencil-line tracing of the original image — only translated into a natural, hand-drawn pencil style, with no added or missing elements.`
    
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





