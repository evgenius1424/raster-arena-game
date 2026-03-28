import express from 'express'
import { getOrCreateSession, readSession, signTicket, signToken } from './session.js'
import {
    createRoom,
    getRoom,
    joinRoom,
    leaveRoom,
    listRooms,
    startRoom,
    subscribeLobby,
    subscribeRoom,
    toPublicRoom,
} from './store.js'

const app = express()
const PORT = parseInt(process.env['PORT'] ?? '3002', 10)

// CORS is handled by Caddy in production. In dev, Vite proxies /api so no CORS needed.
app.use(express.json())

// --- Session ---

app.get('/api/session', async (req, res) => {
    const session = await getOrCreateSession(req)
    res.json(session)
})

app.post('/api/session/nickname', async (req, res) => {
    const session = await readSession(req)
    if (!session) { res.status(401).send('Unauthorized'); return }

    const nickname = typeof req.body?.nickname === 'string' ? req.body.nickname.trim().slice(0, 24) : undefined
    const updated = { ...session, nickname: nickname || undefined }
    const token = await signToken(updated)
    res.json({ token, nickname: updated.nickname })
})

// --- SSE helpers ---

function sseHeaders(res: express.Response): void {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()
}

function sseSend(res: express.Response): (event: string, data: unknown) => void {
    return (event, data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }
}

// --- Lobby SSE (must come before /api/rooms/:roomId) ---

app.get('/api/rooms/stream', async (req, res) => {
    const session = await readSession(req)
    if (!session) { res.status(401).send('Unauthorized'); return }

    sseHeaders(res)
    const send = sseSend(res)
    send('rooms:update', { rooms: listRooms().map((r) => toPublicRoom(r)) })

    const unsub = subscribeLobby(send)
    req.on('close', unsub)
})

// --- Rooms REST ---

app.get('/api/rooms', async (req, res) => {
    const session = await readSession(req)
    if (!session) { res.status(401).send('Unauthorized'); return }
    res.json({ rooms: listRooms().map((r) => toPublicRoom(r, session.sessionId)) })
})

app.post('/api/rooms', async (req, res) => {
    const session = await readSession(req)
    if (!session) { res.status(401).send('Unauthorized'); return }
    const room = createRoom({ sessionId: session.sessionId, nickname: session.nickname, joinedAt: Date.now() })
    res.status(201).json({ room: toPublicRoom(room, session.sessionId) })
})

app.get('/api/rooms/:roomId', async (req, res) => {
    const session = await readSession(req)
    if (!session) { res.status(401).send('Unauthorized'); return }
    const room = getRoom(req.params.roomId)
    if (!room) { res.status(404).send('Room not found'); return }
    res.json({ room: toPublicRoom(room, session.sessionId) })
})

app.post('/api/rooms/:roomId/join', async (req, res) => {
    const session = await readSession(req)
    if (!session) { res.status(401).send('Unauthorized'); return }
    const result = joinRoom(req.params.roomId, { sessionId: session.sessionId, nickname: session.nickname, joinedAt: Date.now() })
    if ('error' in result) { res.status(400).send(result.error); return }
    res.json({ room: toPublicRoom(result, session.sessionId) })
})

app.post('/api/rooms/:roomId/leave', async (req, res) => {
    const session = await readSession(req)
    if (!session) { res.status(401).send('Unauthorized'); return }
    leaveRoom(req.params.roomId, session.sessionId)
    res.status(204).send()
})

app.get('/api/rooms/:roomId/ticket', async (req, res) => {
    const session = await readSession(req)
    if (!session) { res.status(401).send('Unauthorized'); return }

    const room = getRoom(req.params.roomId)
    if (!room) { res.status(404).send('Room not found'); return }

    const isInRoom = room.players.some((p) => p.sessionId === session.sessionId)
    if (!isInRoom) { res.status(403).send('Not in this room'); return }

    try {
        const ticket = await signTicket(req.params.roomId, session.sessionId)
        res.json({ ticket })
    } catch {
        // No GAME_SECRET configured (local dev) — return null ticket so the client
        // can still connect; the game server also accepts ticketless connections
        // when GAME_SECRET is not set.
        res.json({ ticket: null })
    }
})

app.post('/api/rooms/:roomId/start', async (req, res) => {
    const session = await readSession(req)
    if (!session) { res.status(401).send('Unauthorized'); return }
    const result = startRoom(req.params.roomId, session.sessionId)
    if ('error' in result) { res.status(400).send(result.error); return }
    res.json({ room: toPublicRoom(result, session.sessionId) })
})

// --- Room SSE ---

app.get('/api/rooms/:roomId/stream', async (req, res) => {
    const session = await readSession(req)
    if (!session) { res.status(401).send('Unauthorized'); return }

    const { roomId } = req.params
    const room = getRoom(roomId)
    if (!room) { res.status(404).send('Room not found'); return }

    sseHeaders(res)
    const send = sseSend(res)
    send('room:update', { room: toPublicRoom(room, session.sessionId) })

    const unsub = subscribeRoom(roomId, send, session.sessionId)
    req.on('close', unsub)
})

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`)
    console.log(`Port: ${PORT}`)
})
