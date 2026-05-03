import assert from 'node:assert/strict'
import test from 'node:test'

import { getAllowedDownloadHosts, sanitizeDownloadFilename } from '../../lib/download'

test('download host allowlist accepts configured Supabase and R2 hosts only', () => {
    const hosts = getAllowedDownloadHosts({
        NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
        R2_PUBLIC_URL: 'https://cdn.example.com/folder/',
    })

    assert.deepEqual([...hosts].sort(), ['cdn.example.com', 'project.supabase.co'])
})

test('download host allowlist ignores invalid optional URLs', () => {
    const hosts = getAllowedDownloadHosts({
        NEXT_PUBLIC_SUPABASE_URL: 'not a url',
        R2_PUBLIC_URL: 'https://cdn.example.com',
    })

    assert.deepEqual([...hosts], ['cdn.example.com'])
})

test('download filenames strip header-breaking characters and unsafe symbols', () => {
    assert.equal(sanitizeDownloadFilename('cover:page?.png'), 'cover_page_.png')
    assert.equal(sanitizeDownloadFilename('\r\n"\\'), 'download')
})
