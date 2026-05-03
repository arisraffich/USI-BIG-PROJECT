import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveR2Config, type R2ConfigEnv } from '../../lib/storage/r2'

const baseEnv: R2ConfigEnv = {
    R2_ACCESS_KEY_ID: 'access-key',
    R2_SECRET_ACCESS_KEY: 'secret-key',
    R2_PUBLIC_URL: 'https://cdn.example.com/r2/',
}

test('R2 config supports documented account ID and bucket name env vars', () => {
    assert.deepEqual(resolveR2Config({
        ...baseEnv,
        R2_ACCOUNT_ID: 'account123',
        R2_BUCKET_NAME: 'docs-bucket',
    }), {
        accessKeyId: 'access-key',
        secretAccessKey: 'secret-key',
        endpoint: 'https://account123.r2.cloudflarestorage.com',
        publicUrlBase: 'https://cdn.example.com/r2',
        bucket: 'docs-bucket',
    })
})

test('R2 config keeps compatibility with existing endpoint and bucket aliases', () => {
    assert.deepEqual(resolveR2Config({
        ...baseEnv,
        R2_ACCOUNT_ID: 'account123',
        R2_ENDPOINT: 'https://custom-r2.example.com',
        R2_BUCKET_NAME: 'docs-bucket',
        R2_BUCKET: 'legacy-bucket',
    }), {
        accessKeyId: 'access-key',
        secretAccessKey: 'secret-key',
        endpoint: 'https://custom-r2.example.com',
        publicUrlBase: 'https://cdn.example.com/r2',
        bucket: 'legacy-bucket',
    })
})

test('R2 config fails explicitly when public URL is missing', () => {
    assert.throws(() => resolveR2Config({
        R2_ACCESS_KEY_ID: 'access-key',
        R2_SECRET_ACCESS_KEY: 'secret-key',
        R2_ACCOUNT_ID: 'account123',
    }), /R2_PUBLIC_URL is not configured/)
})

test('R2 config fails explicitly when endpoint cannot be resolved', () => {
    assert.throws(() => resolveR2Config({
        ...baseEnv,
    }), /R2 credentials not configured/)
})
