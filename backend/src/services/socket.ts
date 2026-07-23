import { Server } from 'socket.io';
import { Server as HttpServer } from 'http';

let io: Server | null = null;

export function initSocketServer(server: HttpServer) {
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  io.on('connection', (socket) => {
    // Clients can join specific session rooms to avoid spamming
    socket.on('join_session', (sessionId: string) => {
      socket.join(sessionId);
    });
  });

  return io;
}

export function broadcastEvent(type: string, data: any) {
  if (io) {
    io.emit('telemetry', { type, ...data });
    if (data.session) {
      io.to(data.session).emit('session_telemetry', { type, ...data });
    }
  }
}
