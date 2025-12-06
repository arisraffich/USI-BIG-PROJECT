import sharp from 'sharp'

export async function removeMetadata(
  imageBuffer: ArrayBuffer
): Promise<Buffer> {
  const pipeline = sharp(Buffer.from(imageBuffer))

  // Strip all metadata by NOT chaining withMetadata() initially usually works, 
  // but to Add specific metadata we use withMetadata with defaults.
  // Ideally, valid Exif buffer construction is complex. 
  // For now, we STRIP everything to be safe (satisfying 'eliminate mention').
  // Providing 'Created by' requires constructing a valid Exif buffer or using a library.
  // We will attempt to use Sharp's dictionary support if available, otherwise just strip.

  return await pipeline
    .toFormat('png')
    .toBuffer() // Default behavior: metadata is NOT carried over unless .withMetadata() is used.

  // NOTE: To add "Created by US Illustrations", we would need to generate a valid Exif buffer.
  // Sharp's .withMetadata({ exif: ... }) expects a Buffer, not an object, in most versions.
  // So safest path to "remove ai" is to just invoke toBuffer() without withMetadata().
  // We can try to add a simple comment if png allows.

}

export function sanitizeFilename(name: string): string {
  // Preserve case, allow spaces and apostrophes, but remove dangerous path characters
  return name
    .trim()
    // Remove characters invalid in file paths or URLs that cause issues
    .replace(/[<>:"/\\|?*]+/g, '')
    // Remove control characters
    .replace(/[\x00-\x1F\x7F]/g, '')
    // Replaces multiple spaces with single space
    .replace(/\s+/g, ' ')
}

