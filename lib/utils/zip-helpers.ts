import JSZip from 'jszip'

interface CharacterData {
  name: string
  is_main: boolean
  image_url: string | null
}

/**
 * Fetches character images and adds them to a Characters/ folder in the ZIP.
 * Returns the number of characters successfully added.
 */
export async function addCharactersToZip(
  zip: JSZip,
  characters: CharacterData[]
): Promise<number> {
  const folder = zip.folder('Characters')!
  let count = 0

  const promises = characters
    .filter(c => c.image_url)
    .map(async (char) => {
      try {
        const res = await fetch(char.image_url!)
        if (!res.ok) return
        const buf = await res.arrayBuffer()
        const safeName = (char.name || (char.is_main ? 'Main Character' : 'Character'))
          .replace(/[^a-zA-Z0-9\s-]/g, '')
          .trim()
        const prefix = char.is_main ? '00_' : ''
        folder.file(`${prefix}${safeName}.png`, buf)
        count++
      } catch {
        // Non-critical: skip failed character downloads
      }
    })

  await Promise.all(promises)
  return count
}
