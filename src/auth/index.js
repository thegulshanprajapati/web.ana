import { useMultiFileAuthState } from '@whiskeysockets/baileys';
import fs from 'node:fs';
import qrcode from 'qrcode-terminal';
import { sessionDir } from '../config/index.js';
import { logAuth } from '../utils/logger.js';
import { setStatus, STATUS } from '../utils/status.js';

/**
 * Sets up Baileys multi-file auth state for a given account.
 *
 * useMultiFileAuthState stores each credential piece as a separate JSON file
 * inside <sessions>/<sessionId>/creds.json + app-state-sync files. This is the
 * recommended approach: it survives restarts, supports incremental saves, and
 * lets multiple accounts coexist in the same sessions/ directory.
 *
 * @param {string} sessionId - account identifier (defaults to config.sessionId)
 * @returns {Promise<{ state: object, saveCreds: () => Promise<void>, clearSession: () => Promise<void> }>}
 */
export async function initAuth(sessionId) {
  const dir = sessionDir(sessionId);
  fs.mkdirSync(dir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(dir);
  logAuth.info({ dir, sessionId }, 'auth state initialized');

  return {
    state,
    saveCreds,
    /** Removes the session directory — used when the session is irrecoverably invalid. */
    async clearSession() {
      fs.rmSync(dir, { recursive: true, force: true });
      logAuth.warn({ dir }, 'session directory cleared');
    },
  };
}

/**
 * Renders a QR code in the terminal for first-time login.
 * Called from the connection.update event when a new QR is generated.
 *
 * @param {string} qr - the QR string from Baileys
 * @param {string} sessionId - the session ID
 */
export function displayQr(qr, sessionId = 'default') {
  setStatus(sessionId, STATUS.QR, { qr });
  logAuth.info({ sessionId }, 'QR code generated — scan it on the web dashboard to log in');
}
