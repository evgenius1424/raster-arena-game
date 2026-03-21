import { getCookie, setCookie } from '@tanstack/react-start/server'

export type SessionPayload = {
    sessionId: string
    createdAt: string
    nickname?: string
}

// --- Public API ---

export async function readSessionCtx(): Promise<SessionPayload | null> {
    const token = getCookie(COOKIE_NAME)
    if (!token) return null
    return verifyToken(token)
}

export async function getOrCreateSessionCtx(): Promise<SessionPayload> {
    const existing = await readSessionCtx()
    if (existing) return existing
    const session: SessionPayload = { sessionId: crypto.randomUUID(), createdAt: new Date().toISOString() }
    await _setSessionCookie(session)
    return session
}

export async function updateSessionCtx(payload: SessionPayload): Promise<void> {
    await _setSessionCookie(payload)
}

// Raw request-based helpers for server.handlers (no AsyncLocalStorage context)

export async function readSession(request: Request): Promise<SessionPayload | null> {
    const token = _parseCookies(request.headers.get('cookie'))[COOKIE_NAME]
    if (!token) return null
    return verifyToken(token)
}

export async function getOrCreateSession(
    request: Request,
): Promise<{ session: SessionPayload; setCookie: string | null }> {
    const existing = await readSession(request)
    if (existing) return { session: existing, setCookie: null }
    const session: SessionPayload = { sessionId: crypto.randomUUID(), createdAt: new Date().toISOString() }
    const token = await signToken(session)
    return { session, setCookie: _buildSetCookieHeader(token) }
}

export async function updateSession(payload: SessionPayload): Promise<string> {
    return _buildSetCookieHeader(await signToken(payload))
}

export async function signToken(payload: SessionPayload): Promise<string> {
    const encoded = _b64uEncode(new TextEncoder().encode(JSON.stringify(payload)).buffer as ArrayBuffer)
    const sig = await crypto.subtle.sign('HMAC', await _getKey(), new TextEncoder().encode(encoded))
    return `${encoded}.${_b64uEncode(sig)}`
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
    const parts = token.split('.')
    if (parts.length !== 2) return null
    const [encoded, sigStr] = parts
    try {
        const valid = await crypto.subtle.verify(
            'HMAC',
            await _getKey(),
            _b64uDecode(sigStr),
            new TextEncoder().encode(encoded),
        )
        if (!valid) return null
        return JSON.parse(new TextDecoder().decode(_b64uDecode(encoded))) as SessionPayload
    } catch {
        return null
    }
}

// --- Internals ---

const COOKIE_NAME = 'nff_session'
const SECRET = process.env['SESSION_SECRET'] ?? 'dev-secret-please-change-in-production-min32'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30

function _b64uEncode(data: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(data)))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
}

function _b64uDecode(str: string): Uint8Array {
    const padded = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(str.length + ((4 - (str.length % 4)) % 4), '=')
    return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}

async function _getKey(): Promise<CryptoKey> {
    return crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

async function _setSessionCookie(payload: SessionPayload): Promise<void> {
    setCookie(COOKIE_NAME, await signToken(payload), {
        maxAge: COOKIE_MAX_AGE,
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env['NODE_ENV'] === 'production',
    })
}

function _parseCookies(header: string | null): Record<string, string> {
    if (!header) return {}
    return Object.fromEntries(
        header.split(';').map((part) => {
            const idx = part.indexOf('=')
            if (idx === -1) return [part.trim(), '']
            return [part.slice(0, idx).trim(), decodeURIComponent(part.slice(idx + 1).trim())]
        }),
    )
}

function _buildSetCookieHeader(token: string): string {
    const parts = [`${COOKIE_NAME}=${encodeURIComponent(token)}`, `Max-Age=${COOKIE_MAX_AGE}`, 'Path=/', 'HttpOnly', 'SameSite=Lax']
    if (process.env['NODE_ENV'] === 'production') parts.push('Secure')
    return parts.join('; ')
}
