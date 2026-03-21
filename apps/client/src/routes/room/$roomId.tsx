import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { $getRoom, $getSession, $leaveRoom, $startRoom } from '../../lib/serverFns'
import type { PublicRoom } from '../../lib/store.server'

export const Route = createFileRoute('/room/$roomId')({
    loader: async ({ params }) => {
        const [sessionData, roomData] = await Promise.all([
            $getSession(),
            $getRoom({ data: params.roomId }),
        ])
        return { sessionId: sessionData.sessionId, room: roomData.room, isHost: roomData.isHost }
    },
    component: RoomPage,
})

function RoomPage() {
    const { params } = Route.useMatch()
    const { sessionId, room: initialRoom, isHost } = Route.useLoaderData()
    const navigate = useNavigate()
    const [room, setRoom] = useState<PublicRoom>(initialRoom)
    const [error, setError] = useState<string | null>(null)
    const navigatedRef = useRef(false)

    useEffect(() => {
        const es = new EventSource(`/api/rooms/${params.roomId}/stream`)

        es.addEventListener('room:update', (e) => {
            const data = JSON.parse(e.data)
            if (data.room === null) {
                navigate({ to: '/lobby' })
                return
            }
            const updatedRoom: PublicRoom = data.room
            setRoom(updatedRoom)

            if (updatedRoom.status === 'in-game' && !navigatedRef.current) {
                navigatedRef.current = true
                navigate({ to: '/game', search: { roomId: params.roomId } })
            }
        })

        return () => es.close()
    }, [params.roomId])

    async function startGame() {
        setError(null)
        try {
            await $startRoom({ data: params.roomId })
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to start game')
        }
        // Navigation happens via SSE room:update
    }

    async function leaveRoom() {
        try {
            await $leaveRoom({ data: params.roomId })
        } catch {
            // ignore — navigate anyway
        }
        navigate({ to: '/lobby' })
    }

    return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center py-16 px-4">
            <h1 className="text-4xl font-bold tracking-widest uppercase mb-2">Room</h1>
            <p className="text-gray-600 font-mono text-xs mb-10">{params.roomId}</p>

            <div className="w-full max-w-md mb-8">
                <div className="flex justify-between text-xs uppercase tracking-widest text-gray-500 border-b border-gray-800 pb-2 mb-4">
                    <span>
                        Players ({room.playerCount}/{room.maxPlayers})
                    </span>
                    <span className={room.status === 'in-game' ? 'text-yellow-500' : 'text-green-500'}>
                        {room.status}
                    </span>
                </div>

                <ul className="space-y-2">
                    {room.players.map((player, i) => (
                        <li
                            key={player.joinedAt}
                            className="flex items-center gap-3 py-2 border-b border-gray-900"
                        >
                            <span className="w-10 text-xs">
                                {i === 0 ? (
                                    <span className="text-yellow-500 uppercase tracking-widest">Host</span>
                                ) : null}
                            </span>
                            <span className="text-sm">
                                {player.nickname ?? (
                                    <span className="text-gray-600">Anonymous</span>
                                )}
                            </span>
                        </li>
                    ))}
                </ul>
            </div>

            {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

            <div className="flex gap-4">
                {isHost && room.status === 'lobby' && (
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
