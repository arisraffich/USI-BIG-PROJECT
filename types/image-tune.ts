export interface ImageTuneSettings {
    exposure: number
    brightness: number
    contrast: number
    saturation: number
    vibrance: number
    midtones: number
    warmth: number
    red: number
    green: number
    blue: number
    shadows: number
    highlights: number
    clarity: number
    dehaze: number
    sharpness: number
}

export const DEFAULT_IMAGE_TUNE_SETTINGS: ImageTuneSettings = {
    exposure: 0,
    brightness: 0,
    contrast: 0,
    saturation: 0,
    vibrance: 0,
    midtones: 0,
    warmth: 0,
    red: 0,
    green: 0,
    blue: 0,
    shadows: 0,
    highlights: 0,
    clarity: 0,
    dehaze: 0,
    sharpness: 0,
}

export const IMAGE_TUNE_LIMITS: Record<keyof ImageTuneSettings, { min: number; max: number; step: number }> = {
    exposure: { min: -30, max: 30, step: 1 },
    brightness: { min: -30, max: 30, step: 1 },
    contrast: { min: -30, max: 30, step: 1 },
    saturation: { min: -40, max: 40, step: 1 },
    vibrance: { min: -40, max: 40, step: 1 },
    midtones: { min: -30, max: 30, step: 1 },
    warmth: { min: -30, max: 30, step: 1 },
    red: { min: -30, max: 30, step: 1 },
    green: { min: -30, max: 30, step: 1 },
    blue: { min: -30, max: 30, step: 1 },
    shadows: { min: -40, max: 40, step: 1 },
    highlights: { min: -40, max: 40, step: 1 },
    clarity: { min: -30, max: 30, step: 1 },
    dehaze: { min: -30, max: 30, step: 1 },
    sharpness: { min: 0, max: 30, step: 1 },
}
