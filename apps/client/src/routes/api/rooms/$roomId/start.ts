import { createFileRoute } from '@tanstack/react-router'
import { readSession } from '../../../../lib/session.server'
import { startRoom, toPublicRoom } from '../../../../lib/store.server'

export const Route = createFileRoute('/api/rooms/$roomId/start')({
    server: {
        handlers: {
            POST: async ({ request, params }) => {
                const session = await readSession(request)
                if (!session) return new Response('Unauthorized', { status: 401 })

                const result = startRoom(params.roomId, session.sessionId)

                if ('error' in result) {
                    const status = result.error === 'Only the host can start the game' ? 403 : 400
                    return Response.json({ error: result.error }, { status })
                }

                return Response.json({ room: toPublicRoom(result) })
            },
        },
    },
})
