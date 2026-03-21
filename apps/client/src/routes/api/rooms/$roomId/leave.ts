import { createFileRoute } from '@tanstack/react-router'
import { readSession } from '../../../../lib/session.server'
import { leaveRoom } from '../../../../lib/store.server'

export const Route = createFileRoute('/api/rooms/$roomId/leave')({
    server: {
        handlers: {
            POST: async ({ request, params }) => {
                const session = await readSession(request)
                if (!session) return new Response('Unauthorized', { status: 401 })

                leaveRoom(params.roomId, session.sessionId)

                return new Response(null, { status: 204 })
            },
        },
    },
})
