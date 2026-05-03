import assert from 'node:assert/strict'
import test from 'node:test'

import { createAdminSessionValue, verifyAdminSessionValue } from '../../lib/auth/admin'

const originalSecret = process.env.ADMIN_SESSION_SECRET
const originalPassword = process.env.ADMIN_PASSWORD

test.after(() => {
    if (originalSecret === undefined) {
        delete process.env.ADMIN_SESSION_SECRET
    } else {
        process.env.ADMIN_SESSION_SECRET = originalSecret
    }

    if (originalPassword === undefined) {
        delete process.env.ADMIN_PASSWORD
    } else {
        process.env.ADMIN_PASSWORD = originalPassword
    }
})

test('admin session values are signed and reject tampering', async () => {
    process.env.ADMIN_SESSION_SECRET = 'unit-test-secret'
    delete process.env.ADMIN_PASSWORD

    const value = await createAdminSessionValue()
    assert.equal(await verifyAdminSessionValue(value), true)
    assert.equal(await verifyAdminSessionValue('true'), false)

    const parts = value.split('.')
    assert.equal(parts.length, 3)

    const tamperedNonce = `${parts[1].slice(0, -1)}${parts[1].endsWith('0') ? '1' : '0'}`
    const tamperedValue = `${parts[0]}.${tamperedNonce}.${parts[2]}`
    assert.equal(await verifyAdminSessionValue(tamperedValue), false)
})
