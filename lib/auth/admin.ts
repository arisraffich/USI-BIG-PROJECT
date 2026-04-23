import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export const ADMIN_SESSION_COOKIE = 'admin_session_v2'
export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7

const encoder = new TextEncoder()

function getSigningSecret(): string | null {
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || null
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

async function signPayload(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  return bytesToBase64Url(new Uint8Array(signature))
}

function randomHex(bytes = 16): string {
  const values = new Uint8Array(bytes)
  crypto.getRandomValues(values)
  return Array.from(values, (value) => value.toString(16).padStart(2, '0')).join('')
}

export async function createAdminSessionValue(): Promise<string> {
  const secret = getSigningSecret()
  if (!secret) {
    throw new Error('Admin session signing secret is not configured')
  }

  const issuedAt = Math.floor(Date.now() / 1000)
  const payload = `${issuedAt}.${randomHex()}`
  const signature = await signPayload(payload, secret)
  return `${payload}.${signature}`
}

export async function verifyAdminSessionValue(value: string | undefined | null): Promise<boolean> {
  const secret = getSigningSecret()
  if (!secret || !value) return false

  // Backward compatibility: old unsigned cookies must not authenticate.
  if (value === 'true') return false

  const parts = value.split('.')
  if (parts.length !== 3) return false

  const [issuedAtRaw, nonce, signature] = parts
  if (!/^\d+$/.test(issuedAtRaw) || !/^[a-f0-9]{32}$/.test(nonce)) return false

  const issuedAt = Number(issuedAtRaw)
  const now = Math.floor(Date.now() / 1000)
  if (!Number.isSafeInteger(issuedAt)) return false
  if (issuedAt > now + 60) return false
  if (now - issuedAt > ADMIN_SESSION_MAX_AGE_SECONDS) return false

  const expected = await signPayload(`${issuedAtRaw}.${nonce}`, secret)
  return safeEqual(signature, expected)
}

export async function isAdminRequest(request: NextRequest): Promise<boolean> {
  return verifyAdminSessionValue(request.cookies.get(ADMIN_SESSION_COOKIE)?.value)
}

export function unauthorizedJson() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}

export async function requireAdmin(request: NextRequest): Promise<NextResponse | null> {
  if (await isAdminRequest(request)) return null
  return unauthorizedJson()
}
