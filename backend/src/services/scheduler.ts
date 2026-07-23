import { PrismaClient } from '@prisma/client';
import { getSocket } from './bot.js';
import { logger } from './logger.js';

const prisma = new PrismaClient();
let intervalId: NodeJS.Timeout | null = null;

// Helper delay to mimic human behavior & prevent ban
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Ultra Anti-Ban Jitter Delay: 15s to 35s between broadcast messages
const getUltraAntiBanDelay = () => Math.floor(Math.random() * (35000 - 15000 + 1)) + 15000;

// Track total sent messages per session per hour to enforce strict safety cap (Max 30 messages/hour)
const sessionHourlyCounter = new Map<string, { count: number; resetAt: number }>();

function checkAndIncrementHourlyCap(sessionId: string): boolean {
  const now = Date.now();
  const state = sessionHourlyCounter.get(sessionId) || { count: 0, resetAt: now + 3600000 };

  if (now > state.resetAt) {
    state.count = 0;
    state.resetAt = now + 3600000;
  }

  if (state.count >= 30) {
    return false; // Safety Cap Exceeded (Max 30 messages/hour)
  }

  state.count += 1;
  sessionHourlyCounter.set(sessionId, state);
  return true;
}

export function initScheduler() {
  if (intervalId) return;

  intervalId = setInterval(async () => {
    try {
      const now = new Date();
      const messages = await prisma.scheduledMessage.findMany({
        where: {
          status: 'Pending',
          scheduledTime: { lte: now }
        },
        take: 2 // Take max 2 messages per batch to prevent burst flags
      });

      for (const msg of messages) {
        const sock = getSocket(msg.sessionId);
        if (!sock) {
          logger.warn(msg.sessionId, `Skipping scheduled message: Socket not active for session.`);
          continue;
        }

        // Anti-Ban 1: Enforce Strict Hourly Rate Cap
        if (!checkAndIncrementHourlyCap(msg.sessionId)) {
          logger.warn(msg.sessionId, `[ULTRA ANTI-BAN SHIELD] Hourly limit of 30 messages reached. Delaying next message for safety.`);
          break;
        }

        try {
          // Format recipient
          let recipientJid = msg.recipient.replace(/[^0-9]/g, '');
          if (!recipientJid.includes('@')) {
            recipientJid = recipientJid.length > 15 ? `${recipientJid}@g.us` : `${recipientJid}@s.whatsapp.net`;
          }

          // Anti-Ban 2: Read status simulation (Mark chat as read first)
          try {
            await sock.readMessages([{ remoteJid: recipientJid, id: msg.id.toString(), fromMe: false }]);
            await sleep(1500);
          } catch (e) {}

          // Anti-Ban 3: Simulate realistic human typing delay (3s - 7s)
          try {
            await sock.sendPresenceUpdate('composing', recipientJid);
            await sleep(Math.floor(Math.random() * (7000 - 3000 + 1)) + 3000);
            await sock.sendPresenceUpdate('paused', recipientJid);
          } catch (e) {}

          await sock.sendMessage(recipientJid, { text: msg.message });
          await prisma.scheduledMessage.update({
            where: { id: msg.id },
            data: { status: 'Sent' }
          });
          logger.info(msg.sessionId, `[ULTRA ANTI-BAN] Safe Dispatch to ${recipientJid}`);

          // Anti-Ban 4: Extended randomized delay (15s to 35s) between consecutive messages
          const delayMs = getUltraAntiBanDelay();
          logger.info(msg.sessionId, `[ULTRA ANTI-BAN] Waiting ${Math.round(delayMs / 1000)}s before next broadcast to mimic human behavior...`);
          await sleep(delayMs);

        } catch (err: any) {
          logger.error(msg.sessionId, `Failed to dispatch scheduled message to ${msg.recipient}`, err);
          await prisma.scheduledMessage.update({
            where: { id: msg.id },
            data: { status: 'Failed' }
          });
        }
      }
    } catch (err) {
      console.error('Scheduler iteration error:', err);
    }
  }, 15000); // Poll every 15 seconds
}
