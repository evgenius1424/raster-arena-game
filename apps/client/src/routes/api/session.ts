import { createFileRoute } from '@tanstack/react-router'
import { getOrCreateSession, readSession, updateSession } from '../../lib/session.server'

export const Route = createFileRoute('/api/session')({
    server: {
        handlers: {
            GET: async ({ request }) => {
                const { session, setCookie } = await getOrCreateSession(request)
                const headers = new Headers({ 'Content-Type': 'application/json' })
                if (setCookie) headers.set('Set-Cookie', setCookie)
                return new Response(
                    JSON.stringify({ sessionId: session.sessionId, nickname: session.nickname }),
                    { headers },
                )
            },

            POST: async ({ request }) => {
                const session = await readSession(request)
                if (!session) return new Response('Unauthorized', { status: 401 })

                let body: { nickname?: string }
                try {
                    body = await request.json()
                } catch {
                    return new Response('Bad Request', { status: 400 })
                }

                const updated = { ...session, nickname: body.nickname?.trim() || undefined }
                const setCookie = await updateSession(updated)
                const headers = new Headers({
                    'Content-Type': 'application/json',
                    'Set-Cookie': setCookie,
                })
                return new Response(
                    JSON.stringify({ sessionId: updated.sessionId, nickname: updated.nickname }),
                    { headers },
                )
            },
        },
    },
})
