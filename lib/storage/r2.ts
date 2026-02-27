import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY
const R2_ENDPOINT = process.env.R2_ENDPOINT
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL
const R2_BUCKET = process.env.R2_BUCKET || 'lineart-zips'

let client: S3Client | null = null

function getClient(): S3Client {
    if (client) return client
    if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_ENDPOINT) {
        throw new Error('R2 credentials not configured')
    }
    client = new S3Client({
        region: 'auto',
        endpoint: R2_ENDPOINT,
        credentials: {
            accessKeyId: R2_ACCESS_KEY_ID,
            secretAccessKey: R2_SECRET_ACCESS_KEY,
        },
    })
    return client
}

export async function uploadToR2(
    key: string,
    body: Buffer,
    contentType: string = 'application/zip'
): Promise<string> {
    const s3 = getClient()

    await s3.send(new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
    }))

    return `${R2_PUBLIC_URL}/${key}`
}
