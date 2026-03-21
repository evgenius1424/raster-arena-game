import { createServerFn } from '@tanstack/react-start'
import { getOrCreateSessionCtx, readSessionCtx } from './session.server'
import {
    createRoom,
    getRoom,
    joinRoom,
    leaveRoom,
    listRooms,
    startRoom,
    toPublicRoom,
} from './store.server'

export const $getSession = createServerFn({ method: 'GET' }).handler(async () => {
    const session = await getOrCreateSessionCtx()
    return { sessionId: session.sessionId, nickname: session.nickname }
})

export const $listRooms = createServerFn({ method: 'GET' }).handler(async () => {
    const session = await readSessionCtx()
    if (!session) throw new Error('Unauthorized')
    return { rooms: listRooms().map(toPublicRoom) }
})

export const $getRoom = createServerFn({ method: 'GET' })
    .inputValidator((roomId: string) => roomId)
    .handler(async ({ data: roomId }) => {
        const session = await readSessionCtx()
        if (!session) throw new Error('Unauthorized')
        const room = getRoom(roomId)
        if (!room) throw new Error('Room not found')
        return {
            room: toPublicRoom(room),
            isHost: room.players[0]?.sessionId === session.sessionId,
        }
    })

export const $createRoom = createServerFn({ method: 'POST' }).handler(async () => {
    const session = await readSessionCtx()
    if (!session) throw new Error('Unauthorized')
    const room = createRoom({
        sessionId: session.sessionId,
        nickname: session.nickname,
        joinedAt: Date.now(),
    })
    return { room: toPublicRoom(room) }
})

export const $joinRoom = createServerFn({ method: 'POST' })
    .inputValidator((roomId: string) => roomId)
    .handler(async ({ data: roomId }) => {
        const session = await readSessionCtx()
        if (!session) throw new Error('Unauthorized')
        const result = joinRoom(roomId, {
            sessionId: session.sessionId,
            nickname: session.nickname,
            joinedAt: Date.now(),
        })
        if ('error' in result) throw new Error(result.error)
        return { room: toPublicRoom(result) }
    })

export const $leaveRoom = createServerFn({ method: 'POST' })
    .inputValidator((roomId: string) => roomId)
    .handler(async ({ data: roomId }) => {
        const session = await readSessionCtx()
        if (!session) throw new Error('Unauthorized')
        leaveRoom(roomId, session.sessionId)
        return {}
    })

export const $startRoom = createServerFn({ method: 'POST' })
    .inputValidator((roomId: string) => roomId)
    .handler(async ({ data: roomId }) => {
        const session = await readSessionCtx()
        if (!session) throw new Error('Unauthorized')
        const result = startRoom(roomId, session.sessionId)
        if ('error' in result) throw new Error(result.error)
        return { room: toPublicRoom(result) }
    })
