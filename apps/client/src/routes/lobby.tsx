import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
    createRoom as apiCreateRoom,
    getSession,
    joinRoom as apiJoinRoom,
    lobbyEventSource,
    updateNickname as apiUpdateNickname,
} from '../lib/api'
import type { PublicRoom } from '../lib/api'

export const Route = createFileRoute('/lobby')({
    loader: async () => getSession(),
    component: LobbyPage,
})

function LobbyPage() {
    const { sessionId, nickname: initialNickname } = Route.useLoaderData()
    const navigate = useNavigate()
    const [rooms, setRooms] = useState<PublicRoom[]>([])
    const [nickname, setNickname] = useState(initialNickname ?? '')
    const [nicknameSaved, setNicknameSaved] = useState(!!initialNickname)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const es = lobbyEventSource()
        es.addEventListener('rooms:update', (e) => {
            const data = JSON.parse((e as MessageEvent<string>).data) as { rooms: PublicRoom[] }
            setRooms(data.rooms)
        })
        return () => es.close()
    }, [])

    async function saveNickname() {
        await apiUpdateNickname(nickname)
        setNicknameSaved(true)
    }

    async function createRoom() {
        setError(null)
        try {
            const room = await apiCreateRoom()
            navigate({ to: '/room/$roomId', params: { roomId: room.id } })
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to create room')
        }
    }

    async function joinRoom(roomId: string) {
        setError(null)
        try {
            await apiJoinRoom(roomId)
            navigate({ to: '/room/$roomId', params: { roomId } })
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to join room')
        }
    }

    return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center py-16 px-4">
            <h1 className="text-4xl font-bold tracking-widest uppercase mb-2">Lobby</h1>
            <p className="text-gray-500 text-xs tracking-widest uppercase mb-10">2D Arena Deathmatch</p>

            {/* Nickname */}
            <div className="flex gap-2 mb-10">
                <input
                    type="text"
                    value={nickname}
                    onChange={(e) => {
                        setNickname(e.target.value)
                        setNicknameSaved(false)
                    }}
                    placeholder="Enter nickname…"
                    maxLength={24}
                    className="bg-transparent border border-gray-600 text-white px-4 py-2 text-sm tracking-widest focus:outline-none focus:border-white w-56"
                />
                <button
                    onClick={saveNickname}
                    disabled={nicknameSaved || !nickname.trim()}
                    className="border border-white px-4 py-2 text-sm uppercase tracking-widest hover:bg-white hover:text-black transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                    {nicknameSaved ? 'Saved' : 'Save'}
                </button>
            </div>

            {/* Create room */}
            <button
                onClick={createRoom}
                className="mb-8 px-10 py-3 border-2 border-white text-white uppercase tracking-widest font-bold hover:bg-white hover:text-black transition-colors cursor-pointer"
            >
                Create Room
            </button>

            {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

            {/* Room list */}
            <div className="w-full max-w-xl">
                {rooms.length === 0 ? (
                    <p className="text-gray-600 text-center text-sm tracking-widest uppercase">No rooms yet</p>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-gray-500 uppercase tracking-widest text-xs border-b border-gray-800">
                                <th className="text-left py-2 font-normal">Room</th>
                                <th className="text-left py-2 font-normal">Players</th>
                                <th className="py-2" />
                            </tr>
                        </thead>
                        <tbody>
                            {rooms.map((room) => (
                                <tr key={room.id} className="border-b border-gray-900">
                                    <td className="py-3 font-mono text-xs text-gray-400">
                                        {room.id.slice(0, 8)}
                                    </td>
                                    <td className="py-3">
                                        {room.playerCount}/{room.maxPlayers}
                                    </td>
                                    <td className="py-3 text-right">
                                        {room.playerCount < room.maxPlayers ? (
                                            <button
                                                onClick={() => joinRoom(room.id)}
                                                className="border border-white px-4 py-1 text-xs uppercase tracking-widest hover:bg-white hover:text-black transition-colors cursor-pointer"
                                            >
                                                Join
                                            </button>
                                        ) : null}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <p className="mt-12 text-gray-700 text-xs font-mono">session: {sessionId.slice(0, 8)}</p>
        </div>
    )
}
