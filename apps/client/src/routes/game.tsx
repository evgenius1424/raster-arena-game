import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'

export const Route = createFileRoute('/game')({
    component: GamePage,
})

function GamePage() {
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
