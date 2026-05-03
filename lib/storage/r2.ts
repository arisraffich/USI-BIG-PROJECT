import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

export interface R2Config {
    accessKeyId: string
    secretAccessKey: string
    endpoint: string
    publicUrlBase: string
    bucket: string
}

export interface R2ConfigEnv {
    R2_ACCESS_KEY_ID?: string
    R2_SECRET_ACCESS_KEY?: string
    R2_ACCOUNT_ID?: string
    R2_ENDPOINT?: string
    R2_PUBLIC_URL?: string
    R2_BUCKET?: string
    R2_BUCKET_NAME?: string
    [key: string]: string | undefined
}

let client: S3Client | null = null

export function resolveR2Config(env: R2ConfigEnv = process.env): R2Config {
    const accessKeyId = env.R2_ACCESS_KEY_ID
    const secretAccessKey = env.R2_SECRET_ACCESS_KEY
    const endpoint = env.R2_ENDPOINT || (env.R2_ACCOUNT_ID ? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined)
    const publicUrlBase = env.R2_PUBLIC_URL?.replace(/\/+$/, '')
    const bucket = env.R2_BUCKET || env.R2_BUCKET_NAME || 'lineart-zips'

    if (!accessKeyId || !secretAccessKey || !endpoint) {
        throw new Error('R2 credentials not configured. Set R2_ENDPOINT or R2_ACCOUNT_ID, plus R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY.')
    }

    if (!publicUrlBase) {
        throw new Error('R2_PUBLIC_URL is not configured')
    }

    return {
        accessKeyId,
        secretAccessKey,
        endpoint,
        publicUrlBase,
        bucket,
    }
}

function getClient(config: R2Config): S3Client {
    if (client) return client
    client = new S3Client({
        region: 'auto',
        endpoint: config.endpoint,
        credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
        },
    })
    return client
}

export async function uploadToR2(
    key: string,
    body: Buffer,
    contentType: string = 'application/zip'
): Promise<string> {
    const config = resolveR2Config()
    const s3 = getClient(config)

    await s3.send(new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
    }))

    return `${config.publicUrlBase}/${key}`
}
