import sharp from 'sharp'

export async function removeMetadata(
  imageBuffer: Buffer | ArrayBuffer
): Promise<Buffer> {
  try {
    const buffer = Buffer.isBuffer(imageBuffer)
      ? imageBuffer
      : Buffer.from(imageBuffer)

    // Remove all metadata (EXIF, IPTC, XMP)
    // By default, sharp strips metadata when no .withMetadata() is called
    const cleanedBuffer = await sharp(buffer)
      .toBuffer()

    console.log('✅ [METADATA] Removed AI metadata from image')

    return cleanedBuffer

  } catch (error) {
    console.error('❌ [METADATA] Error during removal:', error)
    return Buffer.isBuffer(imageBuffer) ? imageBuffer : Buffer.from(imageBuffer)
  }
}

export function sanitizeFilename(name: string): string {
  // Sanitize for storage bucket keys: only alphanumeric, hyphens, underscores, dots
  return name
    .trim()
    // Replace invalid characters with hyphen (including spaces, parentheses, special chars)
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    // Remove duplicate hyphens
    .replace(/-+/g, '-')
    // Trim hyphens from start/end
    .replace(/^-|-$/g, '')
    // Ensure at least some valid content
    || 'character'
}

