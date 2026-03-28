import type { Request } from 'express'

export type SessionPayload = {
    sessionId: string
    createdAt: string
    nickname?: string
}

export type SessionData = {
    sessionId: string
    nickname?: string
    token: string
}

const SECRET = process.env['SESSION_SECRET'] ?? 'dev-secret-please-change-in-production-min32'
const GAME_SECRET = process.env['GAME_SECRET'] ?? ''

/** Read session from Authorization header or ?token= query param (for SSE / sendBeacon). */
export async function readSession(req: Request): Promise<SessionPayload | null> {
    const auth = req.headers['authorization']
    const headerToken = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined
    const queryToken = typeof req.query['token'] === 'string' ? req.query['token'] : undefined
    const token = headerToken ?? queryToken
    if (!token) return null
    return verifyToken(token)
}

/** Get existing session or create a new one. Returns the session data plus signed token. */
export async function getOrCreateSession(req: Request): Promise<SessionData> {
    const existing = await readSession(req)
    if (existing) {
        return { sessionId: existing.sessionId, nickname: existing.nickname, token: await signToken(existing) }
    }
    const payload: SessionPayload = { sessionId: crypto.randomUUID(), createdAt: new Date().toISOString() }
    return { sessionId: payload.sessionId, token: await signToken(payload) }
}

/** Sign an updated payload and return the new token. */
export async function signUpdatedSession(payload: SessionPayload): Promise<string> {
    return signToken(payload)
}

export async function signTicket(roomId: string, sessionId: string): Promise<string> {
    if (!GAME_SECRET) throw new Error('GAME_SECRET not configured')
    const exp = Date.now() + 60_000 // 1 minute TTL
    const payload = { roomId, sessionId, exp }
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const sig = await crypto.subtle.sign('HMAC', await getGameKey(), new TextEncoder().encode(encoded))
    return `${encoded}.${Buffer.from(sig).toString('base64url')}`
}

async function getGameKey(): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(GAME_SECRET),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
    )
}

export async function signToken(payload: SessionPayload): Promise<string> {
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const sig = await crypto.subtle.sign('HMAC', await getKey(), new TextEncoder().encode(encoded))
    return `${encoded}.${Buffer.from(sig).toString('base64url')}`
}

async function verifyToken(token: string): Promise<SessionPayload | null> {
    const parts = token.split('.')
    if (parts.length !== 2) return null
    const [encoded, sigStr] = parts
    try {
        const valid = await crypto.subtle.verify(
            'HMAC',
            await getKey(),
            Buffer.from(sigStr, 'base64url'),
            new TextEncoder().encode(encoded),
        )
        if (!valid) return null
        return JSON.parse(Buffer.from(encoded, 'base64url').toString()) as SessionPayload
    } catch {
        return null
    }
}

async function getKey(): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(SECRET),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify'],
    )
}
