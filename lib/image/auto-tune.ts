import sharp from 'sharp'
import {
    DEFAULT_IMAGE_TUNE_SETTINGS,
    IMAGE_TUNE_LIMITS,
    ImageTuneSettings,
} from '@/types/image-tune'

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}

function clampSetting<Key extends keyof ImageTuneSettings>(key: Key, value: number): number {
    const limit = IMAGE_TUNE_LIMITS[key]
    return Math.round(clamp(value, limit.min, limit.max))
}

function normalizeSettings(settings?: Partial<ImageTuneSettings>): ImageTuneSettings {
    return {
        exposure: clampSetting('exposure', settings?.exposure ?? DEFAULT_IMAGE_TUNE_SETTINGS.exposure),
        brightness: clampSetting('brightness', settings?.brightness ?? DEFAULT_IMAGE_TUNE_SETTINGS.brightness),
        contrast: clampSetting('contrast', settings?.contrast ?? DEFAULT_IMAGE_TUNE_SETTINGS.contrast),
        saturation: clampSetting('saturation', settings?.saturation ?? DEFAULT_IMAGE_TUNE_SETTINGS.saturation),
        vibrance: clampSetting('vibrance', settings?.vibrance ?? DEFAULT_IMAGE_TUNE_SETTINGS.vibrance),
        midtones: clampSetting('midtones', settings?.midtones ?? DEFAULT_IMAGE_TUNE_SETTINGS.midtones),
        warmth: clampSetting('warmth', settings?.warmth ?? DEFAULT_IMAGE_TUNE_SETTINGS.warmth),
        red: clampSetting('red', settings?.red ?? DEFAULT_IMAGE_TUNE_SETTINGS.red),
        green: clampSetting('green', settings?.green ?? DEFAULT_IMAGE_TUNE_SETTINGS.green),
        blue: clampSetting('blue', settings?.blue ?? DEFAULT_IMAGE_TUNE_SETTINGS.blue),
        shadows: clampSetting('shadows', settings?.shadows ?? DEFAULT_IMAGE_TUNE_SETTINGS.shadows),
        highlights: clampSetting('highlights', settings?.highlights ?? DEFAULT_IMAGE_TUNE_SETTINGS.highlights),
        clarity: clampSetting('clarity', settings?.clarity ?? DEFAULT_IMAGE_TUNE_SETTINGS.clarity),
        dehaze: clampSetting('dehaze', settings?.dehaze ?? DEFAULT_IMAGE_TUNE_SETTINGS.dehaze),
        sharpness: clampSetting('sharpness', settings?.sharpness ?? DEFAULT_IMAGE_TUNE_SETTINGS.sharpness),
    }
}

function clampUnit(value: number): number {
    return clamp(value, 0, 1)
}

function applyGamma(value: number, gamma: number): number {
    return Math.pow(clampUnit(value / 255), gamma) * 255
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
    const red = r / 255
    const green = g / 255
    const blue = b / 255
    const max = Math.max(red, green, blue)
    const min = Math.min(red, green, blue)
    const lightness = (max + min) / 2

    if (max === min) return [0, 0, lightness]

    const delta = max - min
    const saturation = lightness > 0.5
        ? delta / (2 - max - min)
        : delta / (max + min)
    let hue = 0

    if (max === red) {
        hue = ((green - blue) / delta + (green < blue ? 6 : 0)) * 60
    } else if (max === green) {
        hue = ((blue - red) / delta + 2) * 60
    } else {
        hue = ((red - green) / delta + 4) * 60
    }

    return [hue, saturation, lightness]
}

function hueToRgb(p: number, q: number, t: number): number {
    let value = t
    if (value < 0) value += 1
    if (value > 1) value -= 1
    if (value < 1 / 6) return p + (q - p) * 6 * value
    if (value < 1 / 2) return q
    if (value < 2 / 3) return p + (q - p) * (2 / 3 - value) * 6
    return p
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    const hue = (((h % 360) + 360) % 360) / 360
    if (s === 0) {
        const gray = l * 255
        return [gray, gray, gray]
    }

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    return [
        hueToRgb(p, q, hue + 1 / 3) * 255,
        hueToRgb(p, q, hue) * 255,
        hueToRgb(p, q, hue - 1 / 3) * 255,
    ]
}

export async function tuneIllustration(
    inputBuffer: Buffer,
    requestedSettings?: Partial<ImageTuneSettings>,
    options: { maxEdge?: number; quality?: number } = {}
): Promise<Buffer> {
    const settings = normalizeSettings(requestedSettings)
    let input = sharp(inputBuffer)
        .rotate()
        .flatten({ background: '#ffffff' })
        .toColorspace('srgb')

    if (options.maxEdge) {
        input = input.resize(options.maxEdge, options.maxEdge, { fit: 'inside', withoutEnlargement: true })
    }

    const { data, info } = await input
        .raw()
        .toBuffer({ resolveWithObject: true })

    const exposureFactor = Math.pow(2, settings.exposure / 60)
    const contrastFactor = 1 + settings.contrast / 100 + settings.dehaze / 160
    const saturationFactor = 1 + settings.saturation / 100 + settings.dehaze / 180
    const gamma = Math.pow(2, -settings.midtones / 60)
    const clarityStrength = settings.clarity / 100
    const output = Buffer.alloc(data.length)

    for (let index = 0; index < data.length; index += info.channels) {
        let r = data[index] * exposureFactor
        let g = data[index + 1] * exposureFactor
        let b = data[index + 2] * exposureFactor
        const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
        const shadowMask = Math.pow(clamp((0.58 - luminance) / 0.58, 0, 1), 1.25)
        const highlightMask = Math.pow(clamp((luminance - 0.42) / 0.58, 0, 1), 1.25)
        const lightnessOffset = settings.brightness * 1.35
            + settings.shadows * 1.2 * shadowMask
            + settings.highlights * 1.05 * highlightMask
            - settings.dehaze * 0.22

        r += lightnessOffset
        g += lightnessOffset
        b += lightnessOffset

        if (settings.midtones !== 0) {
            r = applyGamma(r, gamma)
            g = applyGamma(g, gamma)
            b = applyGamma(b, gamma)
        }

        r = (r - 128) * contrastFactor + 128
        g = (g - 128) * contrastFactor + 128
        b = (b - 128) * contrastFactor + 128

        if (settings.clarity !== 0) {
            const clarityLuminance = clampUnit((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255)
            const midtoneMask = Math.pow(1 - Math.min(1, Math.abs(clarityLuminance - 0.5) * 2), 0.8)
            const clarityFactor = 1 + clarityStrength * midtoneMask
            r = (r - 128) * clarityFactor + 128
            g = (g - 128) * clarityFactor + 128
            b = (b - 128) * clarityFactor + 128
        }

        const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b
        r = gray + (r - gray) * saturationFactor
        g = gray + (g - gray) * saturationFactor
        b = gray + (b - gray) * saturationFactor

        if (settings.vibrance !== 0) {
            const [h, s, l] = rgbToHsl(
                clamp(r, 0, 255),
                clamp(g, 0, 255),
                clamp(b, 0, 255)
            )
            const vibranceAmount = settings.vibrance / 100
            const nextS = settings.vibrance > 0
                ? clampUnit(s * (1 + vibranceAmount * (1 - s)))
                : clampUnit(s * (1 + vibranceAmount))
            const vibrant = hslToRgb(h, nextS, l)
            r = vibrant[0]
            g = vibrant[1]
            b = vibrant[2]
        }

        r += settings.warmth * 0.8
        g += settings.warmth * 0.12
        b -= settings.warmth * 0.75

        r += settings.red * 1.2
        g += settings.green * 1.2
        b += settings.blue * 1.2

        output[index] = clamp(Math.round(r), 0, 255)
        output[index + 1] = clamp(Math.round(g), 0, 255)
        output[index + 2] = clamp(Math.round(b), 0, 255)
    }

    let pipeline = sharp(output, {
        raw: {
            width: info.width,
            height: info.height,
            channels: 3,
        },
    })

    if (settings.sharpness > 0) {
        pipeline = pipeline.sharpen({
            sigma: 0.35 + settings.sharpness / 45,
            m1: 0.5 + settings.sharpness / 30,
            m2: 0.9 + settings.sharpness / 20,
        })
    }

    return pipeline
        .jpeg({ quality: options.quality ?? 96, chromaSubsampling: '4:4:4' })
        .toBuffer()
}
