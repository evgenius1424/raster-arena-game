import { getCookie, setCookie } from '@tanstack/react-start/server'

export type SessionPayload = {
    sessionId: string
    createdAt: string
    nickname?: string
}

const COOKIE_NAME = 'nff_session'
const SECRET = process.env['SESSION_SECRET'] ?? 'dev-secret-please-change-in-production-min32'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

// --- Base64url helpers ---

function base64urlEncode(data: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(data)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
}

function base64urlDecode(str: string): Uint8Array {
    const padded = str
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(str.length + ((4 - (str.length % 4)) % 4), '=')
    return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}

// --- HMAC key ---

async function getKey(): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(SECRET),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify'],
    )
}

// --- Token sign/verify ---

export async function signToken(payload: SessionPayload): Promise<string> {
    const encoded = base64urlEncode(
        new TextEncoder().encode(JSON.stringify(payload)).buffer as ArrayBuffer,
    )
    const key = await getKey()
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(encoded))
    return `${encoded}.${base64urlEncode(sig)}`
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
    const parts = token.split('.')
    if (parts.length !== 2) return null
    const [encoded, sigStr] = parts

    try {
        const key = await getKey()
        const sig = base64urlDecode(sigStr)
        const valid = await crypto.subtle.verify(
            'HMAC',
            key,
            sig,
            new TextEncoder().encode(encoded),
        )
        if (!valid) return null

        const json = new TextDecoder().decode(base64urlDecode(encoded))
        return JSON.parse(json) as SessionPayload
    } catch {
        return null
    }
}

// --- High-level session API (uses TanStack Start AsyncLocalStorage context) ---

/**
 * Read and validate the session from the TanStack Start request context.
 * Works in server functions (createServerFn) and API route handlers.
 * Returns null if the cookie is missing or the signature is invalid.
 */
export async function readSessionCtx(): Promise<SessionPayload | null> {
    const token = getCookie(COOKIE_NAME)
    if (!token) return null
    return verifyToken(token)
}

/**
 * Read the session, or create a new one (via TanStack Start context).
 * Sets the cookie if a new session is created.
 */
export async function getOrCreateSessionCtx(): Promise<SessionPayload> {
    const existing = await readSessionCtx()
    if (existing) return existing

    const session: SessionPayload = {
        sessionId: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
    }
    const token = await signToken(session)
    const isProduction = process.env['NODE_ENV'] === 'production'
    setCookie(COOKIE_NAME, token, {
        maxAge: COOKIE_MAX_AGE,
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: isProduction,
    })
    return session
}

// --- Raw request-based helpers (for use in server.handlers where request is explicit) ---

function parseCookiesFromHeader(cookieHeader: string | null): Record<string, string> {
    if (!cookieHeader) return {}
    return Object.fromEntries(
        cookieHeader.split(';').map((part) => {
            const idx = part.indexOf('=')
            if (idx === -1) return [part.trim(), '']
            return [
                part.slice(0, idx).trim(),
                decodeURIComponent(part.slice(idx + 1).trim()),
            ]
        }),
    )
}

function buildSetCookie(value: string): string {
    const isProduction = process.env['NODE_ENV'] === 'production'
    const parts = [
        `${COOKIE_NAME}=${encodeURIComponent(value)}`,
        `Max-Age=${COOKIE_MAX_AGE}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
    ]
    if (isProduction) parts.push('Secure')
    return parts.join('; ')
}

export async function readSession(request: Request): Promise<SessionPayload | null> {
    const cookies = parseCookiesFromHeader(request.headers.get('cookie'))
    const token = cookies[COOKIE_NAME]
    if (!token) return null
    return verifyToken(token)
}

export async function getOrCreateSession(request: Request): Promise<{
    session: SessionPayload
    setCookie: string | null
}> {
    const existing = await readSession(request)
    if (existing) return { session: existing, setCookie: null }

    const session: SessionPayload = {
        sessionId: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
    }
    const token = await signToken(session)
    return { session, setCookie: buildSetCookie(token) }
}

export async function updateSession(payload: SessionPayload): Promise<string> {
    const token = await signToken(payload)
    return buildSetCookie(token)
}
