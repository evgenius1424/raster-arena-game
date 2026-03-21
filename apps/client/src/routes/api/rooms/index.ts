import { createFileRoute } from '@tanstack/react-router'
import { readSession } from '../../../lib/session.server'
import { createRoom, listRooms, toPublicRoom } from '../../../lib/store.server'

export const Route = createFileRoute('/api/rooms/')({
    server: {
        handlers: {
            GET: async ({ request }) => {
                const session = await readSession(request)
                if (!session) return new Response('Unauthorized', { status: 401 })
                return Response.json({ rooms: listRooms().map(toPublicRoom) })
            },

            POST: async ({ request }) => {
                const session = await readSession(request)
                if (!session) return new Response('Unauthorized', { status: 401 })
                const room = createRoom({
                    sessionId: session.sessionId,
                    nickname: session.nickname,
                    joinedAt: Date.now(),
                })
                return Response.json({ room: toPublicRoom(room) }, { status: 201 })
            },
        },
    },
})
