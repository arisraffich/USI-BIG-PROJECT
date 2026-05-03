import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('scheduled send execution only sends after claiming a pending job', () => {
    const source = readFileSync('app/api/scheduled-sends/execute/route.ts', 'utf8')

    assert.match(source, /\.eq\('id', send\.id\)[\s\S]*?\.eq\('status', 'pending'\)[\s\S]*?\.select\('id'\)[\s\S]*?\.maybeSingle\(\)/)
    assert.match(source, /if \(!claimedSend\) \{[\s\S]*?continue[\s\S]*?\}/)
    assert.match(source, /await fetch\(`\$\{baseUrl\}\/api\/projects\/\$\{send\.project_id\}\/send-to-customer`/)
})
