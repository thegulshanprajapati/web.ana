import {
  createJoinRequest,
  setPendingReply,
  getPendingReply,
  updateJoinRequestField,
  clearPendingReply,
} from '../database/index.js';
import { logHandlers } from '../utils/logger.js';

/**
 * The message we auto-send when someone requests to join the group.
 * Kept here (not in DB) because it's a fixed workflow prompt, not user data.
 */
export const JOIN_REQUEST_PROMPT = `Request aaya hai aapka SBTE Private Group me add hone ka.
Please reply with:
Name:
College:
Branch:
Semester:`;

/**
 * The order in which we collect the user's details across their replies.
 * The pending_replies table tracks which field we're waiting for next.
 */
const FIELD_ORDER = ['name', 'college', 'branch', 'semester'];

/**
 * Handles a group.join-request event.
 *
 * Baileys fires `group.join-request` with `{ id, participant, action }`
 * when a user taps "Join" on a group that requires admin approval.
 *
 * We:
 *  1. Persist a Pending join_request row (requester JID, group id, timestamp).
 *  2. Send the prompt message to the requester's DM.
 *  3. Record that we're now waiting for their "name" reply.
 *
 * @param {import('@whiskeysockets/baileys').WASocket} sock
 * @param {{ id: string, participant: string, action: string, requestTime?: string }} data
 */
export async function handleJoinRequest(sock, { id, participant, action, requestTime }) {
  // action is typically 'request' (vs 'approve'/'reject' for admin actions).
  if (action && action !== 'request') return;

  const groupId = id;
  const jid = participant;
  const timestamp = requestTime || new Date().toISOString();
  const sessionId = sock.sessionId || 'default';

  logHandlers.info({ groupId, jid, action, sessionId }, 'join request received');

  const requestId = createJoinRequest({ jid, groupId, requestTime: timestamp, sessionId });

  // Send the prompt to the requester's private JID (not the group).
  await sock.sendMessage(jid, { text: JOIN_REQUEST_PROMPT });

  // Begin collecting details — first field we expect is "name".
  setPendingReply(jid, requestId, 'name', sessionId);
  logHandlers.info({ jid, requestId, sessionId }, 'prompt sent, awaiting name');
}

/**
 * Processes an incoming DM from a user we're collecting details from.
 *
 * The conversation is state-machine driven by the pending_replies table:
 *   name -> college -> branch -> semester -> (complete)
 *
 * Each reply advances to the next field. Once all four are collected we
 * clear the pending state and confirm receipt to the user.
 *
 * @param {import('@whiskeysockets/baileys').WASocket} sock
 * @param {{ key: { remoteJid: string, fromMe: boolean }, message: object }} msg
 */
export async function handleReplyMessage(sock, msg) {
  const jid = msg.key.remoteJid;
  const sessionId = sock.sessionId || 'default';

  // Only handle private chats (DMs), never group messages, and never our own.
  if (jid.endsWith('@g.us') || msg.key.fromMe) return;

  const pending = getPendingReply(jid, sessionId);
  if (!pending) return; // Not currently collecting details for this user.

  const text = extractText(msg.message);
  if (!text) return;

  const field = pending.next_field;
  const value = text.trim();
  if (!value) return;

  logHandlers.info({ jid, field, sessionId }, 'collecting reply field');

  updateJoinRequestField(pending.request_id, field, value);

  const currentIndex = FIELD_ORDER.indexOf(field);
  const nextField = FIELD_ORDER[currentIndex + 1];

  if (nextField) {
    // Still more fields to collect — ask for the next one.
    setPendingReply(jid, pending.request_id, nextField, sessionId);
    await sock.sendMessage(jid, {
      text: `Got your ${field}: ${value}\nNow please reply with your ${capitalize(nextField)}:`,
    });
  } else {
    // All fields collected — finalize the conversation.
    clearPendingReply(jid, sessionId);
    await sock.sendMessage(jid, {
      text: `Thank you! Your details have been submitted:\n\nWe'll review and add you to the SBTE Private Group soon.`,
    });
    logHandlers.info({ jid, requestId: pending.request_id, sessionId }, 'all details collected');
  }
}

/**
 * Extracts the body text from a WhatsApp message object, handling the common
 * message types (conversation, extendedText, image with caption, etc.).
 */
function extractText(message) {
  if (!message) return '';
  if (message.conversation) return message.conversation;
  if (message.extendedTextMessage?.text) return message.extendedTextMessage.text;
  if (message.imageMessage?.caption) return message.imageMessage.caption;
  if (message.videoMessage?.caption) return message.videoMessage.caption;
  return '';
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
