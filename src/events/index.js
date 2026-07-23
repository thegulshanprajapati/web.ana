import { logEvents } from '../utils/logger.js';
import { handleJoinRequest, handleReplyMessage } from '../handlers/joinRequest.js';

/**
 * Registers all Baileys event listeners on the socket.
 *
 * Keeping event wiring in one place makes it obvious what the bot reacts to.
 * Each handler is isolated and receives exactly the data it needs.
 *
 * Events handled:
 *  - messages.upsert        : incoming messages (for collecting user details)
 *  - groups.upsert          : group metadata updates
 *  - group-participants.update : join/leave/promote events
 *  - group.join-request     : someone requested to join an approval-required group
 *
 * @param {import('@whiskeysockets/baileys').WASocket} sock
 */
export function registerEventHandlers(sock) {
  /* ---- Incoming messages -------------------------------------------------- */
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    // Only handle real-time 'notify' messages; 'append' are historical sync.
    if (type !== 'notify') return;
    for (const msg of messages) {
      try {
        await handleReplyMessage(sock, msg);
      } catch (err) {
        logEvents.error({ err, key: msg.key }, 'failed to handle message');
      }
    }
  });

  /* ---- Group metadata ------------------------------------------------------ */
  sock.ev.on('groups.upsert', (groups) => {
    for (const g of groups) {
      logEvents.info({ id: g.id, subject: g.subject }, 'group upsert');
    }
  });

  /* ---- Group participant changes (join/leave/promote/demote) -------------- */
  sock.ev.on('group-participants.update', ({ id, participants, action }) => {
    logEvents.info(
      { groupId: id, action, count: participants?.length },
      'group participants updated',
    );
  });

  /* ---- Group join requests (approval-required groups) -------------------- */
  sock.ev.on('group.join-request', async (data) => {
    try {
      await handleJoinRequest(sock, data);
    } catch (err) {
      logEvents.error({ err, data }, 'failed to handle join request');
    }
  });

  logEvents.info('event handlers registered');
}
