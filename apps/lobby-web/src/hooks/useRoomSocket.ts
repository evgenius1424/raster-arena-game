import { useEffect } from 'react';
import type { RoomSnapshot } from '../types';

export const useRoomSocket = (roomCode: string, onSnapshot: (room: RoomSnapshot) => void, onError: (message: string) => void) => {
  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:3000/ws?roomCode=${roomCode}`);
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'error') onError(msg.message);
      if (msg.payload) onSnapshot(msg.payload);
    };
    ws.onopen = () => ws.send(JSON.stringify({ type: 'room.subscribe', roomCode }));
    ws.onclose = () => onError('Disconnected from room updates');
    return () => ws.close();
  }, [roomCode, onSnapshot, onError]);
};
