import { pino } from 'pino';
import { broadcastEvent } from './socket.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const isVercel = !!process.env.VERCEL;

const baseLogger = pino(
  isVercel
    ? { level: 'info' }
    : {
        level: 'info',
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'yyyy-mm-dd HH:MM:ss.l o'
          }
        }
      }
);

export const logger = {
  info: (sessionId: string, msg: string, meta?: any) => {
    baseLogger.info({ sessionId, ...meta }, msg);
    broadcastLog(sessionId, 'info', msg, meta);
  },
  warn: (sessionId: string, msg: string, meta?: any) => {
    baseLogger.warn({ sessionId, ...meta }, msg);
    broadcastLog(sessionId, 'warn', msg, meta);
  },
  error: (sessionId: string, msg: string, meta?: any) => {
    baseLogger.error({ sessionId, ...meta }, meta instanceof Error ? meta.message : msg);
    broadcastLog(sessionId, 'error', msg, meta);
  }
};

async function broadcastLog(sessionId: string, level: string, message: string, meta?: any) {
  broadcastEvent('log', { session: sessionId, level, message, timestamp: new Date(), meta });
  try {
    await prisma.systemLog.create({
      data: {
        sessionId,
        level,
        message: message + (meta ? ` ${JSON.stringify(meta)}` : '')
      }
    });
  } catch (err) {}
}
