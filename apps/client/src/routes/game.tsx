import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { getSession } from '../lib/api'

export const Route = createFileRoute('/game')({
    validateSearch: (search: Record<string, unknown>) => ({
        roomId: typeof search.roomId === 'string' ? search.roomId : undefined,
        bots: typeof search.bots === 'number' ? Math.max(0, Math.floor(search.bots)) : undefined,
    }),
    loader: async () => getSession(),
    component: GamePage,
})

function GamePage() {
    const { roomId, bots } = Route.useSearch()
    const { sessionId, nickname } = Route.useLoaderData()
    const bootstrapped = useRef(false)

    useEffect(() => {
        document.body.classList.add('game-active')
        return () => {
            document.body.classList.remove('game-active')
        }
    }, [])

    useEffect(() => {
        if (bootstrapped.current) return
        bootstrapped.current = true

        // Expose room/session config to the imperative game code before bootstrap runs
        if (roomId) window.__NFF_ROOM_ID = roomId
        if (sessionId) window.__NFF_SESSION_ID = sessionId
        if (nickname) window.__NFF_NICKNAME = nickname
        if (bots) window.__NFF_BOTS = bots

        import('../app/bootstrap.js').catch(console.error)
    }, [])

    return (
        <div style={{ width: '100vw', height: '100vh', background: '#000', overflow: 'hidden' }}>
            <div id="game" style={{ width: '100%', height: '100%' }} />
            <div id="console">
                <div id="console-content">
                    NFF-WEB
                    <br />
                    Press <strong>~</strong> to toggle console. Type{' '}
                    <strong>help</strong> for commands.
                </div>
                <input id="console-input" placeholder="Enter command..." />
            </div>
        </div>
    )
}
