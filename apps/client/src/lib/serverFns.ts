import { createServerFn } from '@tanstack/react-start'
import { getOrCreateSessionCtx, readSessionCtx, updateSessionCtx } from './session.server'
import { createRoom, getRoom, joinRoom, leaveRoom, listRooms, startRoom, toPublicRoom } from './store.server'

function assertRoomId(value: unknown): string {
    if (typeof value !== 'string' || value.trim() === '') throw new Error('roomId must be a non-empty string')
    return value
}

export const $getSession = createServerFn({ method: 'GET' }).handler(async () => {
    const session = await getOrCreateSessionCtx()
    return { sessionId: session.sessionId, nickname: session.nickname }
})

export const $updateNickname = createServerFn({ method: 'POST' })
    .inputValidator((value: unknown) => {
        if (typeof value !== 'string') throw new Error('nickname must be a string')
        return value.trim().slice(0, 24)
    })
    .handler(async ({ data: nickname }) => {
        const session = await getOrCreateSessionCtx()
        await updateSessionCtx({ ...session, nickname: nickname || undefined })
        return { nickname: nickname || undefined }
    })

export const $listRooms = createServerFn({ method: 'GET' }).handler(async () => {
    const session = await readSessionCtx()
    if (!session) throw new Error('Unauthorized')
    return { rooms: listRooms().map((r) => toPublicRoom(r)) }
})

export const $getRoom = createServerFn({ method: 'GET' })
    .inputValidator((value: unknown) => assertRoomId(value))
    .handler(async ({ data: roomId }) => {
        const session = await readSessionCtx()
        if (!session) throw new Error('Unauthorized')
        const room = getRoom(roomId)
        if (!room) throw new Error('Room not found')
        return { room: toPublicRoom(room, session.sessionId) }
    })

export const $createRoom = createServerFn({ method: 'POST' }).handler(async () => {
    const session = await readSessionCtx()
    if (!session) throw new Error('Unauthorized')
    const room = createRoom({ sessionId: session.sessionId, nickname: session.nickname, joinedAt: Date.now() })
    return { room: toPublicRoom(room, session.sessionId) }
})

export const $joinRoom = createServerFn({ method: 'POST' })
    .inputValidator((value: unknown) => assertRoomId(value))
    .handler(async ({ data: roomId }) => {
        const session = await readSessionCtx()
        if (!session) throw new Error('Unauthorized')
        const result = joinRoom(roomId, { sessionId: session.sessionId, nickname: session.nickname, joinedAt: Date.now() })
        if ('error' in result) throw new Error(result.error)
        return { room: toPublicRoom(result, session.sessionId) }
    })

export const $leaveRoom = createServerFn({ method: 'POST' })
    .inputValidator((value: unknown) => assertRoomId(value))
    .handler(async ({ data: roomId }) => {
        const session = await readSessionCtx()
        if (!session) throw new Error('Unauthorized')
        leaveRoom(roomId, session.sessionId)
        return {}
    })

export const $startRoom = createServerFn({ method: 'POST' })
    .inputValidator((value: unknown) => assertRoomId(value))
    .handler(async ({ data: roomId }) => {
        const session = await readSessionCtx()
        if (!session) throw new Error('Unauthorized')
        const result = startRoom(roomId, session.sessionId)
        if ('error' in result) throw new Error(result.error)
        return { room: toPublicRoom(result, session.sessionId) }
    })
