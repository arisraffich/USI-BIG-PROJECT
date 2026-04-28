import sharp from 'sharp'

export type CoverToolAspectRatio = 'match' | '8:10' | '8.5:8.5' | '8.5:11'

const SUPPORTED_RATIOS = new Set<CoverToolAspectRatio>(['match', '8:10', '8.5:8.5', '8.5:11'])

export function normalizeCoverToolAspectRatio(value: FormDataEntryValue | null, width: number, height: number): string {
    const ratio = typeof value === 'string' && SUPPORTED_RATIOS.has(value as CoverToolAspectRatio)
        ? value as CoverToolAspectRatio
        : 'match'

    if (ratio === 'match') {
        return `custom:${Math.max(1, Math.round(width))}:${Math.max(1, Math.round(height))}`
    }

    return ratio
}

export async function fileToImageDataUrl(file: File): Promise<{ dataUrl: string, width: number, height: number }> {
    const inputBuffer = Buffer.from(await file.arrayBuffer())
    const normalizedBuffer = await sharp(inputBuffer)
        .rotate()
        .resize(2048, 2048, { fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer()
    const metadata = await sharp(normalizedBuffer).metadata()
    const width = metadata.width || 1
    const height = metadata.height || 1

    return {
        dataUrl: bufferToPngDataUrl(normalizedBuffer),
        width,
        height,
    }
}

export function bufferToPngDataUrl(buffer: Buffer): string {
    return `data:image/png;base64,${buffer.toString('base64')}`
}
