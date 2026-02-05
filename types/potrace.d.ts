declare module 'potrace' {
    interface PotraceOptions {
        turdSize?: number
        alphaMax?: number
        optCurve?: boolean
        optTolerance?: number
        threshold?: number
        blackOnWhite?: boolean
        color?: string
        background?: string
    }

    interface Potrace {
        trace(
            buffer: Buffer | string,
            options: PotraceOptions,
            callback: (err: Error | null, svg: string) => void
        ): void
        trace(
            buffer: Buffer | string,
            callback: (err: Error | null, svg: string) => void
        ): void
    }

    const potrace: Potrace
    export default potrace
    export { PotraceOptions }
}
