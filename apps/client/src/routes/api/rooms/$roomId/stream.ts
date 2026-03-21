import { createFileRoute } from '@tanstack/react-router'
import { readSession } from '../../../../lib/session.server'
import { encodeSSE, getRoom, subscribeRoom, toPublicRoom } from '../../../../lib/store.server'

export const Route = createFileRoute('/api/rooms/$roomId/stream')({
    server: {
        handlers: {
            GET: async ({ request, params }) => {
                const session = await readSession(request)
                if (!session) return new Response('Unauthorized', { status: 401 })

                const room = getRoom(params.roomId)
                if (!room) return new Response('Not Found', { status: 404 })

                const roomId = params.roomId

                const stream = new ReadableStream<Uint8Array>({
                    start(controller) {
                        controller.enqueue(encodeSSE('room:update', { room: toPublicRoom(room) }))
                        const unsub = subscribeRoom(roomId, controller)
                        request.signal.addEventListener('abort', () => unsub())
                    },
                })

                return new Response(stream, {
                    headers: {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive',
                        'X-Accel-Buffering': 'no',
                    },
                })
            },
        },
    },
})
