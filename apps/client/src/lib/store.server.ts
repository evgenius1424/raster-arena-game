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
    players: Array<{ nickname?: string; joinedAt: number }>
}

const MAX_PLAYERS = parseInt(process.env['MAX_PLAYERS_PER_ROOM'] ?? '4', 10)

// Data store
const rooms = new Map<string, Room>()

// SSE subscribers
type Controller = ReadableStreamDefaultController<Uint8Array>
const lobbySubscribers = new Set<Controller>()
const roomSubscribers = new Map<string, Set<Controller>>()

// --- SSE encoding ---

export function encodeSSE(event: string, data: unknown): Uint8Array {
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
    return new TextEncoder().encode(frame)
}

// --- Broadcasts ---

function broadcastLobby(): void {
    const payload = encodeSSE('rooms:update', { rooms: listRooms().map(toPublicRoom) })
    for (const ctrl of lobbySubscribers) {
        try {
            ctrl.enqueue(payload)
        } catch {
            lobbySubscribers.delete(ctrl)
        }
    }
}

function broadcastRoom(roomId: string): void {
    const room = rooms.get(roomId)
    const subs = roomSubscribers.get(roomId)
    if (!subs) return
    const payload = encodeSSE('room:update', { room: room ? toPublicRoom(room) : null })
    for (const ctrl of subs) {
        try {
            ctrl.enqueue(payload)
        } catch {
            subs.delete(ctrl)
        }
    }
}

// --- Public helpers ---

export function toPublicRoom(room: Room): PublicRoom {
    return {
        id: room.id,
        createdAt: room.createdAt,
        playerCount: room.players.length,
        maxPlayers: MAX_PLAYERS,
        status: room.status,
        players: room.players.map((p) => ({ nickname: p.nickname, joinedAt: p.joinedAt })),
    }
}

// --- Read ---

export function listRooms(): Room[] {
    return Array.from(rooms.values())
}

export function getRoom(roomId: string): Room | undefined {
    return rooms.get(roomId)
}

// Find which room a session is in (if any)
export function findSessionRoom(sessionId: string): Room | undefined {
    for (const room of rooms.values()) {
        if (room.players.some((p) => p.sessionId === sessionId)) return room
    }
    return undefined
}

// --- Write ---

export function createRoom(host: Player): Room {
    const room: Room = {
        id: crypto.randomUUID(),
        createdAt: Date.now(),
        players: [host],
        status: 'lobby',
    }
    rooms.set(room.id, room)
    broadcastLobby()
    return room
}

export function joinRoom(
    roomId: string,
    player: Player,
): Room | { error: string } {
    const room = rooms.get(roomId)
    if (!room) return { error: 'Room not found' }
    if (room.status !== 'lobby') return { error: 'Game already started' }
    if (room.players.length >= MAX_PLAYERS) return { error: 'Room is full' }

    // Prevent joining a second room
    const existing = findSessionRoom(player.sessionId)
    if (existing) {
        if (existing.id === roomId) return room // already in this room — idempotent
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
        // Notify room subscribers that the room is gone, then clean up
        broadcastRoom(roomId)
        roomSubscribers.delete(roomId)
        broadcastLobby()
    } else {
        broadcastRoom(roomId)
        broadcastLobby()
    }
}

export function startRoom(
    roomId: string,
    sessionId: string,
): Room | { error: string } {
    const room = rooms.get(roomId)
    if (!room) return { error: 'Room not found' }
    if (room.players[0]?.sessionId !== sessionId) return { error: 'Only the host can start the game' }
    if (room.status === 'in-game') return room // idempotent

    room.status = 'in-game'
    broadcastRoom(roomId)
    broadcastLobby()
    return room
}

// --- SSE subscriptions ---

export function subscribeLobby(ctrl: Controller): () => void {
    lobbySubscribers.add(ctrl)
    return () => {
        lobbySubscribers.delete(ctrl)
        try { ctrl.close() } catch { /* already closed */ }
    }
}

export function subscribeRoom(roomId: string, ctrl: Controller): () => void {
    if (!roomSubscribers.has(roomId)) {
        roomSubscribers.set(roomId, new Set())
    }
    roomSubscribers.get(roomId)!.add(ctrl)
    return () => {
        const subs = roomSubscribers.get(roomId)
        subs?.delete(ctrl)
        try { ctrl.close() } catch { /* already closed */ }
    }
}
