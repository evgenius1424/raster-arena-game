import { createFileRoute } from '@tanstack/react-router'
import { readSession } from '../../../../lib/session.server'
import { getRoom, toPublicRoom } from '../../../../lib/store.server'

export const Route = createFileRoute('/api/rooms/$roomId/')({
    server: {
        handlers: {
            GET: async ({ request, params }) => {
                const session = await readSession(request)
                if (!session) return new Response('Unauthorized', { status: 401 })

                const room = getRoom(params.roomId)
                if (!room) return new Response('Not Found', { status: 404 })

                const isHost = room.players[0]?.sessionId === session.sessionId

                return Response.json({ room: toPublicRoom(room), isHost })
            },
        },
    },
})
