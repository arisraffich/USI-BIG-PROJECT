import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import test from 'node:test'

test('Next.js request guard uses proxy file convention', () => {
    assert.equal(existsSync('middleware.ts'), false)
    assert.equal(existsSync('proxy.ts'), true)

    const source = readFileSync('proxy.ts', 'utf8')

    assert.match(source, /export async function proxy\(request: NextRequest\)/)
    assert.doesNotMatch(source, /export async function middleware/)
    assert.match(source, /'\/admin\/:path\*'/)
    assert.match(source, /'\/api\/:path\*'/)
    assert.match(source, /isAdminRequest\(request\)/)
    assert.match(source, /isCronAuthorizedInternalApi\(request\)/)
})
