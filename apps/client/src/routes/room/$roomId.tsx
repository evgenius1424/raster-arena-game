import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { getRoom, getSession, leaveBeacon, leaveRoom as apiLeaveRoom, roomEventSource, startRoom as apiStartRoom } from '../../lib/api'
import type { PublicRoom } from '../../lib/api'

export const Route = createFileRoute('/room/$roomId')({
    loader: async ({ params }) => {
        const session = await getSession()
        let room: PublicRoom | null = null
        try { room = await getRoom(params.roomId) } catch { /* room may not exist yet if navigated optimistically */ }
        return { sessionId: session.sessionId, room }
    },
    component: RoomPage,
})

function RoomPage() {
    const { params } = Route.useMatch()
    const { sessionId, room: initialRoom } = Route.useLoaderData()
    const navigate = useNavigate()
    const [room, setRoom] = useState<PublicRoom | null>(initialRoom)
    const [error, setError] = useState<string | null>(null)
    const navigatedRef = useRef(false)

    useEffect(() => {
        const es = roomEventSource(params.roomId)

        es.addEventListener('room:update', (e) => {
            const data = JSON.parse((e as MessageEvent<string>).data) as { room: PublicRoom | null }
            if (data.room === null) {
                navigate({ to: '/lobby' })
                return
            }
            setRoom(data.room)
            if (data.room.status === 'in-game' && !navigatedRef.current) {
                navigatedRef.current = true
                navigate({ to: '/game', search: { roomId: params.roomId } })
            }
        })

        return () => es.close()
    }, [params.roomId])

    useEffect(() => {
        const handleUnload = () => leaveBeacon(params.roomId)
        window.addEventListener('beforeunload', handleUnload)
        return () => window.removeEventListener('beforeunload', handleUnload)
    }, [params.roomId])

    async function startGame() {
        setError(null)
        try {
            await apiStartRoom(params.roomId)
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to start game')
        }
    }

    async function leaveRoom() {
        try { await apiLeaveRoom(params.roomId) } catch { /* ignore */ }
        navigate({ to: '/lobby' })
    }

    if (!room) {
        return (
            <div className="min-h-screen bg-black text-white flex items-center justify-center">
                <p className="text-gray-500 text-sm uppercase tracking-widest animate-pulse">Creating room…</p>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center py-16 px-4">
            <h1 className="text-4xl font-bold tracking-widest uppercase mb-2">Room</h1>
            <p className="text-gray-600 font-mono text-xs mb-10">{params.roomId}</p>

            <div className="w-full max-w-md mb-8">
                <div className="flex justify-between text-xs uppercase tracking-widest text-gray-500 border-b border-gray-800 pb-2 mb-4">
                    <span>Players ({room.playerCount}/{room.maxPlayers})</span>
                    <span className={room.status === 'in-game' ? 'text-yellow-500' : 'text-green-500'}>
                        {room.status}
                    </span>
                </div>

                <ul className="space-y-2">
                    {room.players.map((player, i) => (
                        <li key={player.joinedAt} className="flex items-center gap-3 py-2 border-b border-gray-900">
                            <span className="w-10 text-xs">
                                {i === 0 && <span className="text-yellow-500 uppercase tracking-widest">Host</span>}
                            </span>
                            <span className={`text-sm ${player.isCurrentPlayer ? 'text-white' : 'text-gray-400'}`}>
                                {player.nickname ?? <span className="text-gray-600">Anonymous</span>}
                            </span>
                        </li>
                    ))}
                </ul>
            </div>

            {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

            <div className="flex gap-4">
                {room.isHost && room.status === 'lobby' && (
                    <button
                        onClick={startGame}
                        className="px-10 py-3 border-2 border-white text-white uppercase tracking-widest font-bold hover:bg-white hover:text-black transition-colors cursor-pointer"
                    >
                        Start Game
                    </button>
                )}
                <button
                    onClick={leaveRoom}
                    className="border border-gray-600 px-8 py-3 text-sm uppercase tracking-widest text-gray-400 hover:border-white hover:text-white transition-colors cursor-pointer"
                >
                    Leave
                </button>
            </div>

            <p className="mt-12 text-gray-700 text-xs font-mono">session: {sessionId.slice(0, 8)}</p>
        </div>
    )
}
