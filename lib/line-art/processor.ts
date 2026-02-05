/**
 * Line Art Processor
 * 
 * Converts AI-generated line art to transparent PNG using:
 * 1. Potrace - vectorization (SVG with transparent background)
 * 2. Sharp - PNG rendering at @2x resolution
 * 
 * Same pipeline as the tested vectorize-test/lineart-to-transparent-png.mjs
 */

import sharp from 'sharp'
import potrace from 'potrace'

// Manual promisify to handle overloaded trace function
function trace(buffer: Buffer, options: Record<string, unknown>): Promise<string> {
    return new Promise((resolve, reject) => {
        potrace.trace(buffer, options as any, (err: Error | null, svg: string) => {
            if (err) reject(err)
            else resolve(svg)
        })
    })
}

// Line art prompt for AI generation
export const LINE_ART_PROMPT = `Convert the illustration into clean, professional coloring book line art.

Pure black outlines on pure white background only. 
Use thick, bold, confident lines with consistent stroke weight.
Lines should be crisp, closed, and suitable for filling with color.
No shading, no gradients, no fills, no texture, no hatching.
Every shape must have clearly defined edges that form complete enclosed areas.

The result must be immediately usable by artists as a coloring template — 
clean borders ready for manual colorization.

ABSOLUTE FIDELITY RULES — NO EXCEPTIONS:

1. Do NOT add, invent, or complete any element that does not exist in the original illustration.
   Do NOT infer or reconstruct hidden or partially obscured body parts.
   If something is not visible in the original image, it must NOT appear in the line art.
   No extra hands, limbs, fingers, objects, lines, shadows, or background details may be added.
   Zero new visual information may be introduced.

2. Do NOT remove or omit any element from the original illustration.
   Every visible detail in the source image must be present in the line art.
   Every contour, shape, object, background element, character detail, and feature must be fully represented.
   Nothing may be skipped or simplified away.

3. The line art must be a 1:1 structural replica of the original illustration.
   Only the rendering style may change (from color to black line art).
   All proportions, positions, shapes, silhouettes, overlaps, and compositions must remain identical.

The result must look like a professional coloring book page — clean black outlines on white, preserving every element from the original image, ready for an artist to color.`

// Potrace settings (figma-like quality) - same as tested script
const POTRACE_OPTIONS = {
    turdSize: 3,        // Remove small speckles
    alphaMax: 1.2,      // Smooth curves
    optCurve: true,     // Optimize curves
    optTolerance: 0.3,  // Curve tolerance
    color: 'black',
    background: 'transparent',
}

/**
 * Process AI-generated line art image to transparent PNG
 * 
 * Pipeline: Grayscale → Potrace vectorize → SVG → Sharp render to PNG @2x
 * 
 * @param imageBuffer - Input image buffer (PNG with black lines on white/gray background)
 * @param outputSize - Optional output size (defaults to 2x input for @2x)
 * @returns Buffer of transparent PNG
 */
export async function processLineArtToTransparentPng(
    imageBuffer: Buffer,
    outputSize?: { width: number; height: number }
): Promise<Buffer> {
    // Get original dimensions
    const metadata = await sharp(imageBuffer).metadata()
    const originalWidth = metadata.width || 1024
    const originalHeight = metadata.height || 1024

    // Default to @2x resolution
    const targetWidth = outputSize?.width || originalWidth * 2
    const targetHeight = outputSize?.height || originalHeight * 2

    // Step 1: Convert to grayscale for Potrace
    const grayscaleBuffer = await sharp(imageBuffer)
        .grayscale()
        .toBuffer()

    // Step 2: Vectorize with Potrace (produces SVG with transparent bg)
    const svgString = await trace(grayscaleBuffer, POTRACE_OPTIONS)

    // Step 3: Render SVG to PNG at target resolution
    const pngBuffer = await sharp(Buffer.from(svgString))
        .resize(targetWidth, targetHeight, { fit: 'inside' })
        .png()
        .toBuffer()

    return pngBuffer
}
