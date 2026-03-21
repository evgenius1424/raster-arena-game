import { createFileRoute } from '@tanstack/react-router'
import { readSession } from '../../../lib/session.server'
import { encodeSSE, listRooms, subscribeLobby, toPublicRoom } from '../../../lib/store.server'

export const Route = createFileRoute('/api/rooms/stream')({
    server: {
        handlers: {
            GET: async ({ request }) => {
                const session = await readSession(request)
                if (!session) return new Response('Unauthorized', { status: 401 })

                const stream = new ReadableStream<Uint8Array>({
                    start(controller) {
                        controller.enqueue(
                            encodeSSE('rooms:update', { rooms: listRooms().map(toPublicRoom) }),
                        )
                        const unsub = subscribeLobby(controller)
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
