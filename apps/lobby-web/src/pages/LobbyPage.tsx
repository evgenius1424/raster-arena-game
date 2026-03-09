import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { displayNameSchema } from '@nff/shared';
import { api } from '../api/client';
import type { RoomListItem } from '../types';
import { ErrorBanner, LoadingState } from '../components/UI';
import { RoomCard } from '../components/RoomCard';

export const LobbyPage = () => {
  const [displayName, setDisplayName] = useState('');
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => { (async () => { await api.bootstrapCsrf(); const r = await api.listRooms(); setRooms(r.rooms); setLoading(false); })().catch((e) => { setError(e.message); setLoading(false); }); }, []);

  const validName = displayNameSchema.safeParse(displayName).success;
  const withAction = async (action: () => Promise<{ room: { roomCode: string } }>) => {
    if (!validName) return setError('Please enter a valid display name');
    try { setSubmitting(true); setError(''); const r = await action(); navigate(`/room/${r.room.roomCode}`); } catch (e) { setError((e as Error).message); } finally { setSubmitting(false); }
  };

  return <main className="container"><h1>Need For Fun Lobby</h1><p>Join or create a room</p>
    <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" />
    <button disabled={!validName || submitting} onClick={() => withAction(() => api.createRoom(displayName))}>Create room</button>
    {error && <ErrorBanner>{error}</ErrorBanner>}
    <h2>Public rooms</h2>{loading ? <LoadingState>Loading rooms...</LoadingState> : rooms.length === 0 ? <p>No rooms yet.</p> : <ul>{rooms.map((room) => <RoomCard key={room.roomCode} room={room} disabled={!validName || submitting} onJoin={() => withAction(() => api.joinRoom(room.roomCode, displayName))} />)}</ul>}
  </main>;
};
