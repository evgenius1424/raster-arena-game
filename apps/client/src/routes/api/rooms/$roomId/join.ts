import { createFileRoute } from '@tanstack/react-router'
import { readSession } from '../../../../lib/session.server'
import { joinRoom, toPublicRoom } from '../../../../lib/store.server'

export const Route = createFileRoute('/api/rooms/$roomId/join')({
    server: {
        handlers: {
            POST: async ({ request, params }) => {
                const session = await readSession(request)
                if (!session) return new Response('Unauthorized', { status: 401 })

                const result = joinRoom(params.roomId, {
                    sessionId: session.sessionId,
                    nickname: session.nickname,
                    joinedAt: Date.now(),
                })

                if ('error' in result) {
                    return Response.json({ error: result.error }, { status: 400 })
                }

                return Response.json({ room: toPublicRoom(result) })
            },
        },
    },
})
