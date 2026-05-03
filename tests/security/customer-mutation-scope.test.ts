import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function routeSource(path: string): string {
    return readFileSync(path, 'utf8')
}

test('customer review submit scopes body-provided page and character IDs to the token project', () => {
    const source = routeSource('app/api/review/[token]/submit/route.ts')

    assert.match(source, /from\('pages'\)[\s\S]*?\.eq\('id', update\.id\)[\s\S]*?\.eq\('project_id', project\.id\)/)
    assert.match(source, /from\('characters'\)[\s\S]*?\.eq\('id', update\.id\)[\s\S]*?\.eq\('project_id', project\.id\)/)
})

test('customer submission completion scopes body-provided character IDs to the token project', () => {
    const source = routeSource('app/api/submit/[token]/complete/route.ts')

    assert.match(source, /from\('characters'\)[\s\S]*?\.eq\('id', charId\)[\s\S]*?\.eq\('project_id', project\.id\)/)
})

test('direct customer page and character mutations include the authorized project scope', () => {
    const expectations = [
        ['app/api/review/pages/[pageId]/route.ts', /\.eq\('id', pageId\)[\s\S]*?\.eq\('project_id', page\.project_id\)/],
        ['app/api/review/pages/[pageId]/approve/route.ts', /\.eq\('id', pageId\)[\s\S]*?\.eq\('project_id', page\.project_id\)/],
        ['app/api/review/pages/[pageId]/follow-up/route.ts', /\.eq\('id', pageId\)[\s\S]*?\.eq\('project_id', page\.project_id\)/],
        ['app/api/review/pages/[pageId]/accept-reply/route.ts', /\.eq\('id', pageId\)[\s\S]*?\.eq\('project_id', page\.project_id\)/],
        ['app/api/review/pages/[pageId]/manuscript/route.ts', /\.eq\('id', pageId\)[\s\S]*?\.eq\('project_id', existingPage\.project_id\)/],
        ['app/api/review/characters/[characterId]/route.ts', /\.eq\('id', characterId\)[\s\S]*?\.eq\('project_id', character\.project_id\)/],
        ['app/api/review/characters/[characterId]/reference-photo/route.ts', /\.eq\('id', characterId\)[\s\S]*?\.eq\('project_id', character\.project_id\)/],
    ] as const

    for (const [path, pattern] of expectations) {
        assert.match(routeSource(path), pattern, path)
    }
})
