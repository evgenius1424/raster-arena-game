import { WebSocketServer } from 'ws';
import type { Server } from 'http';
import { parse as parseCookie } from 'cookie';
import { wsClientMessageSchema } from '@nff/shared';
import type { RoomService } from '../services/roomService.js';
import type { PlayerSessionRepository } from '../repositories/interfaces.js';
import type { SessionTokenService } from '../auth/sessionToken.js';

export const startWs = (server: Server, roomService: RoomService, sessions: PlayerSessionRepository, tokenSvc: SessionTokenService) => {
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (socket, req) => {
    const url = new URL(req.url ?? '', 'http://localhost');
    const roomCode = url.searchParams.get('roomCode') ?? '';
    const token = parseCookie(req.headers.cookie ?? '').nff_session;
    if (!token) return socket.close(1008, 'Unauthorized');
    const parsed = await tokenSvc.verify(token);
    if (!parsed) return socket.close(1008, 'Unauthorized');
    const session = await sessions.findBySessionId(parsed.sid);
    if (!session || session.roomCode !== roomCode) return socket.close(1008, 'Unauthorized');
    try {
      await roomService.resolveMember(roomCode, session.playerId);
      socket.send(JSON.stringify({ type: 'room.snapshot', payload: await roomService.getSnapshot(roomCode) }));
    } catch {
      return socket.close(1008, 'Unauthorized');
    }

    socket.on('message', async (data) => {
      const parsedMsg = wsClientMessageSchema.safeParse(JSON.parse(data.toString()));
      if (!parsedMsg.success) return socket.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
      if (parsedMsg.data.type === 'room.subscribe' && parsedMsg.data.roomCode !== roomCode) return socket.send(JSON.stringify({ type: 'error', message: 'Room mismatch' }));
      if (parsedMsg.data.type === 'ping') socket.send(JSON.stringify({ type: 'room.updated', payload: await roomService.getSnapshot(roomCode) }));
    });
  });

  return {
    broadcastRoom: async (roomCode: string, type: 'room.updated' | 'room.started' = 'room.updated') => {
      const payload = await roomService.getSnapshot(roomCode);
      for (const client of wss.clients) {
        if (client.readyState === 1) client.send(JSON.stringify({ type, payload }));
      }
    },
  };
};
