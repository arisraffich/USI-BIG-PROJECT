// export async function removeMetadata(
//   imageBuffer: Buffer | ArrayBuffer
// ): Promise<Buffer> {
//   // Temporary bypass: Sharp might be creating corrupted buffers in this env.
//   // Returning raw buffer is safer for now.
//   return Buffer.isBuffer(imageBuffer) ? imageBuffer : Buffer.from(imageBuffer)
// }

// Keeping the function signature but making it a pass-through
export async function removeMetadata(
  imageBuffer: Buffer | ArrayBuffer
): Promise<Buffer> {
  return Buffer.isBuffer(imageBuffer) ? imageBuffer : Buffer.from(imageBuffer)
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

