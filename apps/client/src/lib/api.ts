const API_URL = (import.meta.env['VITE_API_URL'] as string | undefined) ?? ''

export type PublicRoom = {
    id: string
    createdAt: number
    playerCount: number
    maxPlayers: number
    status: 'lobby' | 'in-game'
    isHost: boolean
    players: Array<{ nickname?: string; joinedAt: number; isCurrentPlayer: boolean }>
}

export type SessionData = {
    sessionId: string
    nickname?: string
    token: string
}

const TOKEN_KEY = 'nff_token'

export function getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY)
}

function saveToken(token: string): void {
    localStorage.setItem(TOKEN_KEY, token)
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
    const token = getToken()
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(options?.headers as Record<string, string> | undefined),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }
    const res = await fetch(`${API_URL}${path}`, { ...options, headers })
    if (!res.ok) {
        const text = await res.text()
        throw new Error(text || res.statusText)
    }
    return res.json() as Promise<T>
}

export async function getSession(): Promise<SessionData> {
    const data = await apiFetch<SessionData>('/api/session')
    saveToken(data.token)
    return data
}

export async function updateNickname(nickname: string): Promise<void> {
    const data = await apiFetch<{ token: string }>('/api/session/nickname', {
        method: 'POST',
        body: JSON.stringify({ nickname }),
    })
    saveToken(data.token)
}

export async function getRoom(roomId: string): Promise<PublicRoom> {
    const { room } = await apiFetch<{ room: PublicRoom }>(`/api/rooms/${roomId}`)
    return room
}

export async function createRoom(id: string): Promise<PublicRoom> {
    const { room } = await apiFetch<{ room: PublicRoom }>('/api/rooms', { method: 'POST', body: JSON.stringify({ id }) })
    return room
}

export async function joinRoom(roomId: string): Promise<PublicRoom> {
    const { room } = await apiFetch<{ room: PublicRoom }>(`/api/rooms/${roomId}/join`, { method: 'POST' })
    return room
}

export async function leaveRoom(roomId: string): Promise<void> {
    await apiFetch(`/api/rooms/${roomId}/leave`, { method: 'POST' })
}

export async function startRoom(roomId: string): Promise<PublicRoom> {
    const { room } = await apiFetch<{ room: PublicRoom }>(`/api/rooms/${roomId}/start`, { method: 'POST' })
    return room
}

export async function getGameTicket(roomId: string): Promise<string> {
    const { ticket } = await apiFetch<{ ticket: string }>(`/api/rooms/${roomId}/ticket`)
    return ticket
}

// EventSource doesn't support custom headers — token goes in query string
export function lobbyEventSource(): EventSource {
    const token = getToken()
    const qs = token ? `?token=${encodeURIComponent(token)}` : ''
    return new EventSource(`${API_URL}/api/rooms/stream${qs}`)
}

export function roomEventSource(roomId: string): EventSource {
    const token = getToken()
    const qs = token ? `?token=${encodeURIComponent(token)}` : ''
    return new EventSource(`${API_URL}/api/rooms/${roomId}/stream${qs}`)
}

// sendBeacon doesn't support custom headers either
export function leaveBeacon(roomId: string): void {
    const token = getToken()
    const qs = token ? `?token=${encodeURIComponent(token)}` : ''
    navigator.sendBeacon(`${API_URL}/api/rooms/${roomId}/leave${qs}`)
}
