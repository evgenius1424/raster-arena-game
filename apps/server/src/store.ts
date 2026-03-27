export type Player = {
    sessionId: string
    nickname?: string
    joinedAt: number
}

export type Room = {
    id: string
    createdAt: number
    players: Player[]
    status: 'lobby' | 'in-game'
}

export type PublicRoom = {
    id: string
    createdAt: number
    playerCount: number
    maxPlayers: number
    status: 'lobby' | 'in-game'
    isHost: boolean
    players: Array<{ nickname?: string; joinedAt: number; isCurrentPlayer: boolean }>
}

// Subscriber receives (event, data) and writes to an SSE response
type Subscriber = (event: string, data: unknown) => void

const MAX_PLAYERS = parseInt(process.env['MAX_PLAYERS_PER_ROOM'] ?? '4', 10)
const LOBBY_STALE_MS = 30 * 60 * 1000
const IN_GAME_STALE_MS = 2 * 60 * 60 * 1000

const rooms = new Map<string, Room>()
const lobbySubscribers = new Set<Subscriber>()
const roomSubscribers = new Map<string, Map<Subscriber, string>>()

// --- Public API ---

export function toPublicRoom(room: Room, viewerSessionId?: string): PublicRoom {
    return {
        id: room.id,
        createdAt: room.createdAt,
        playerCount: room.players.length,
        maxPlayers: MAX_PLAYERS,
        status: room.status,
        isHost: !!viewerSessionId && room.players[0]?.sessionId === viewerSessionId,
        players: room.players.map((p) => ({
            nickname: p.nickname,
            joinedAt: p.joinedAt,
            isCurrentPlayer: p.sessionId === viewerSessionId,
        })),
    }
}

export function listRooms(): Room[] {
    return Array.from(rooms.values())
}

export function getRoom(roomId: string): Room | undefined {
    return rooms.get(roomId)
}

export function findSessionRoom(sessionId: string): Room | undefined {
    for (const room of rooms.values()) {
        if (room.players.some((p) => p.sessionId === sessionId)) return room
    }
    return undefined
}

export function createRoom(host: Player): Room {
    const room: Room = { id: crypto.randomUUID(), createdAt: Date.now(), players: [host], status: 'lobby' }
    rooms.set(room.id, room)
    broadcastLobby()
    return room
}

export function joinRoom(roomId: string, player: Player): Room | { error: string } {
    const room = rooms.get(roomId)
    if (!room) return { error: 'Room not found' }
    if (room.status !== 'lobby') return { error: 'Game already started' }
    if (room.players.length >= MAX_PLAYERS) return { error: 'Room is full' }
    const existing = findSessionRoom(player.sessionId)
    if (existing) {
        if (existing.id === roomId) return room
        return { error: 'Already in another room' }
    }
    room.players.push(player)
    broadcastRoom(roomId)
    broadcastLobby()
    return room
}

export function leaveRoom(roomId: string, sessionId: string): void {
    const room = rooms.get(roomId)
    if (!room) return
    room.players = room.players.filter((p) => p.sessionId !== sessionId)
    if (room.players.length === 0) {
        rooms.delete(roomId)
        broadcastRoom(roomId)
        roomSubscribers.delete(roomId)
        broadcastLobby()
    } else {
        broadcastRoom(roomId)
        broadcastLobby()
    }
}

export function startRoom(roomId: string, sessionId: string): Room | { error: string } {
    const room = rooms.get(roomId)
    if (!room) return { error: 'Room not found' }
    if (room.players[0]?.sessionId !== sessionId) return { error: 'Only the host can start the game' }
    if (room.status === 'in-game') return room
    room.status = 'in-game'
    broadcastRoom(roomId)
    broadcastLobby()
    return room
}

export function subscribeLobby(fn: Subscriber): () => void {
    lobbySubscribers.add(fn)
    return () => lobbySubscribers.delete(fn)
}

export function subscribeRoom(roomId: string, fn: Subscriber, sessionId: string): () => void {
    if (!roomSubscribers.has(roomId)) roomSubscribers.set(roomId, new Map())
    roomSubscribers.get(roomId)!.set(fn, sessionId)
    return () => roomSubscribers.get(roomId)?.delete(fn)
}

// --- Internals ---

function broadcastLobby(): void {
    const data = { rooms: listRooms().map((r) => toPublicRoom(r)) }
    for (const fn of lobbySubscribers) {
        try { fn('rooms:update', data) } catch { lobbySubscribers.delete(fn) }
    }
}

function broadcastRoom(roomId: string): void {
    const room = rooms.get(roomId)
    const subs = roomSubscribers.get(roomId)
    if (!subs) return
    for (const [fn, sessionId] of subs) {
        try { fn('room:update', { room: room ? toPublicRoom(room, sessionId) : null }) } catch { subs.delete(fn) }
    }
}

setInterval(() => {
    const now = Date.now()
    let changed = false
    for (const [roomId, room] of rooms) {
        const age = now - room.createdAt
        if (
            (room.status === 'lobby' && age > LOBBY_STALE_MS) ||
            (room.status === 'in-game' && age > IN_GAME_STALE_MS)
        ) {
            rooms.delete(roomId)
            broadcastRoom(roomId)
            roomSubscribers.delete(roomId)
            changed = true
        }
    }
    if (changed) broadcastLobby()
}, 60_000)
