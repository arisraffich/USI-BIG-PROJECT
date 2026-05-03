interface DownloadHostEnv {
    NEXT_PUBLIC_SUPABASE_URL?: string
    R2_PUBLIC_URL?: string
    [key: string]: string | undefined
}

export function getAllowedDownloadHosts(env: DownloadHostEnv = process.env): Set<string> {
    const hosts = new Set<string>()

    for (const value of [env.NEXT_PUBLIC_SUPABASE_URL, env.R2_PUBLIC_URL]) {
        if (!value) continue
        try {
            hosts.add(new URL(value).hostname)
        } catch {
            // Ignore invalid optional URLs.
        }
    }

    return hosts
}

export function sanitizeDownloadFilename(filename: string): string {
    return filename.replace(/[\r\n"\\]/g, '').replace(/[^a-zA-Z0-9._ -]/g, '_').trim() || 'download'
}
