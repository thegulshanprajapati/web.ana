import { listPendingScheduledMessagesBefore, updateScheduledMessageStatus } from '../database/index.js';
import { getBotSocket } from './bot.js';
import { logger } from '../utils/logger.js';

const logScheduler = logger.child({ module: 'scheduler' });
let schedulerInterval = null;

/**
 * Starts the scheduled message dispatcher.
 * Checks the database every 15 seconds for pending messages due for delivery.
 */
export function startScheduler() {
  if (schedulerInterval) return;

  logScheduler.info('scheduled message worker started');

  schedulerInterval = setInterval(async () => {
    try {
      const now = new Date().toISOString();
      const pending = listPendingScheduledMessagesBefore(now);
      
      if (pending.length === 0) return;

      logScheduler.info({ count: pending.length }, 'processing due scheduled messages');

      for (const msg of pending) {
        const sessionId = msg.session_id || 'default';
        const sock = getBotSocket(sessionId);
        if (!sock) {
          logScheduler.warn({ id: msg.id, sessionId }, 'skipped scheduled message: bot session is not connected');
          continue;
        }

        try {
          // Normalize WhatsApp JID if missing suffix
          let jid = msg.recipient.trim();
          if (!jid.includes('@')) {
            // Assume group if requested, else user JID
            jid = jid.endsWith('-') || jid.length > 15 ? `${jid}@g.us` : `${jid}@s.whatsapp.net`;
          }

          logScheduler.info({ id: msg.id, to: jid, sessionId }, 'dispatching scheduled message');
          
          await sock.sendMessage(jid, { text: msg.message });
          updateScheduledMessageStatus(msg.id, 'Sent');
          
          logScheduler.info({ id: msg.id, sessionId }, 'scheduled message sent successfully');
        } catch (sendErr) {
          logScheduler.error({ id: msg.id, sessionId, err: sendErr.message }, 'failed to send scheduled message');
          updateScheduledMessageStatus(msg.id, 'Failed');
        }
      }
    } catch (err) {
      logScheduler.error({ err }, 'error in scheduler loop');
    }
  }, 15000); // Check every 15 seconds
}

/** Stops the scheduler loop (used on shutdown). */
export function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    logScheduler.info('scheduled message worker stopped');
  }
}
