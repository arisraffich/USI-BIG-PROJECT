export async function removeMetadata(
  imageBuffer: Buffer | ArrayBuffer
): Promise<Buffer> {
  return Buffer.isBuffer(imageBuffer) ? imageBuffer : Buffer.from(imageBuffer)
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

