import { logBot } from './logger.js';

/**
 * Maps Baileys connection states to a small, stable set of status strings
 * that the rest of the app (and the user) can rely on:
 *
 *   connecting   - socket is opening
 *   qr           - QR code has been generated, waiting for scan
 *   connected    - fully authenticated and ready
 *   disconnected - connection dropped (will attempt reconnect)
 *   reconnecting - actively retrying after a disconnect
 */
export const STATUS = Object.freeze({
  CONNECTING: 'connecting',
  QR: 'qr',
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  RECONNECTING: 'reconnecting',
});

let sessionStatuses = new Map();
const listeners = new Set();

/**
 * Returns the current connection status for a session.
 * @param {string} sessionId
 * @returns {string} one of the STATUS values
 */
export function getStatus(sessionId = 'default') {
  return sessionStatuses.get(sessionId)?.status || STATUS.CONNECTING;
}

/**
 * Returns the current status extra data (e.g. qr code string) for a session.
 * @param {string} sessionId
 */
export function getCurrentExtra(sessionId = 'default') {
  return sessionStatuses.get(sessionId)?.extra || {};
}

/**
 * Updates the connection status and notifies every registered listener.
 * Centralizing this here means the UI / health endpoint / logs all stay in sync.
 *
 * @param {string} sessionId - the session ID
 * @param {string} status - one of STATUS values
 * @param {object} [extra] - optional context (e.g. qr code, error) passed to listeners
 */
export function setStatus(sessionId, status, extra = {}) {
  const previousState = sessionStatuses.get(sessionId);
  const previous = previousState?.status || STATUS.CONNECTING;
  
  sessionStatuses.set(sessionId, { status, extra });
  
  logBot.info({ sessionId, status, previous }, 'connection status changed');
  for (const fn of listeners) {
    try {
      fn(sessionId, status, previous, extra);
    } catch (err) {
      logBot.error({ err }, 'status listener threw');
    }
  }
}

/**
 * Subscribe to status changes. Returns an unsubscribe function.
 *
 * @param {(sessionId: string, status: string, previous: string, extra: object) => void} fn
 * @returns {() => void}
 */
export function onStatusChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Clears all status records (used when cleaning sessions).
 */
export function clearAllStatuses() {
  sessionStatuses.clear();
}
