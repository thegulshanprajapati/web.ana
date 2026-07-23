import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
} from '@whiskeysockets/baileys';
import { initAuth, displayQr } from '../auth/index.js';
import { registerEventHandlers } from '../events/index.js';
import { logBot } from '../utils/logger.js';
import fs from 'node:fs';
import path from 'node:path';
import { setStatus, STATUS, getStatus, getCurrentExtra, clearAllStatuses } from '../utils/status.js';
import { config } from '../config/index.js';
import { getJoinRequest, updateJoinRequestField, clearPendingReply } from '../database/index.js';

const activeSessions = new Map();
const MAX_RECONNECT_ATTEMPTS = 10;

function getSessionState(sessionId) {
  if (!activeSessions.has(sessionId)) {
    activeSessions.set(sessionId, {
      sock: null,
      connecting: false,
      reconnectAttempts: 0,
    });
  }
  return activeSessions.get(sessionId);
}

/**
 * Creates and connects a Baileys socket for a specific session.
 *
 * @param {{ sessionId?: string, isReconnect?: boolean }} [opts]
 */
export async function startBot(opts = {}) {
  const sessionId = opts.sessionId || config.sessionId;
  const state = getSessionState(sessionId);

  if (state.connecting) {
    logBot.warn({ sessionId }, 'startBot called while already connecting — ignoring duplicate');
    return state.sock;
  }
  state.connecting = true;

  try {
    setStatus(sessionId, STATUS.CONNECTING, { sessionId, reconnect: !!opts.isReconnect });

    // Auth state — restored from disk so we don't need a new QR on restart.
    const { state: authState, saveCreds, clearSession } = await initAuth(sessionId);

    // Use the latest WA web version; fall back to a pinned default if fetch fails.
    let version;
    let versionInfo;
    try {
      versionInfo = await fetchLatestBaileysVersion();
      version = [versionInfo.version.major, versionInfo.version.minor, versionInfo.version.patch];
      logBot.info({ sessionId, version: versionInfo.version }, 'using latest WA web version');
    } catch (err) {
      logBot.warn({ sessionId, err }, 'could not fetch latest WA version, using default');
      version = [2, 3000, 1035194821];
    }

    const sock = makeWASocket({
      auth: authState,
      version,
      // Quiet Baileys' internal logger; route through our pino instead.
      logger: logBot.child({ module: 'baileys', sessionId }),
    });

    // Attach sessionId directly to the socket object so event handlers can reference it.
    sock.sessionId = sessionId;

    /* ---- Save credentials whenever they change --------------------------- */
    sock.ev.on('creds.update', saveCreds);

    /* ---- Connection lifecycle -------------------------------------------- */
    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        displayQr(qr, sessionId);
      }

      if (connection === 'open') {
        // Fully authenticated and connected.
        state.reconnectAttempts = 0;
        state.sock = sock;
        const phone = sock.user?.id ? sock.user.id.split(':')[0].split('@')[0] : 'Unknown';
        const name = sock.user?.name || 'WA Account';
        setStatus(sessionId, STATUS.CONNECTED, { phone, name });
        logBot.info({ sessionId, phone, name }, 'WhatsApp connected — bot is live');
      } else if (connection === 'connecting') {
        setStatus(sessionId, STATUS.CONNECTING);
      } else if (connection === 'close') {
        state.sock = null;
        if (state.isClosedManually) {
          state.isClosedManually = false;
          state.connecting = false;
          setStatus(sessionId, STATUS.DISCONNECTED);
          return;
        }
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = shouldReconnectOnClose(statusCode);

        setStatus(sessionId, STATUS.DISCONNECTED, { statusCode });

        if (statusCode === DisconnectReason.loggedOut || statusCode === 405 || statusCode === DisconnectReason.badSession) {
          // Session is irrecoverably invalid — clear it so a fresh QR is shown.
          logBot.error({ sessionId, statusCode }, 'logged out or bad session — clearing session, a new QR scan will be required');
          await cleanSession(sessionId);
          return;
        }

        if (!shouldReconnect) {
          logBot.error({ sessionId, statusCode }, 'connection closed permanently — not reconnecting');
          state.connecting = false;
          return;
        }

        // Exponential backoff reconnect.
        state.reconnectAttempts += 1;
        if (state.reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
          logBot.fatal({ sessionId, reconnectAttempts: state.reconnectAttempts }, 'exceeded max reconnect attempts — giving up');
          state.connecting = false;
          return;
        }

        const delay = Math.min(1000 * 2 ** state.reconnectAttempts, 30000);
        setStatus(sessionId, STATUS.RECONNECTING, { attempt: state.reconnectAttempts, delay });
        logBot.warn({ sessionId, statusCode, delay, attempt: state.reconnectAttempts }, 'reconnecting after close');
        state.connecting = false;
        setTimeout(() => startBot({ sessionId, isReconnect: true }).catch((err) => onFatal(err, sessionId)), delay);
      }
    });

    /* ---- App-level event handlers ---------------------------------------- */
    registerEventHandlers(sock);

    state.sock = sock;
    state.connecting = false;
    return sock;
  } catch (err) {
    state.sock = null;
    state.connecting = false;
    logBot.error({ sessionId, err }, 'startBot failed');
    throw err;
  }
}

export async function startAllBots() {
  const sessionsDir = config.dirs.sessions;
  fs.mkdirSync(sessionsDir, { recursive: true });

  const files = fs.readdirSync(sessionsDir);
  const sessionIds = new Set(['default']); // Always guarantee the default session starts
  for (const file of files) {
    const fullPath = path.join(sessionsDir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      sessionIds.add(file);
    }
  }

  for (const sessionId of sessionIds) {
    try {
      logBot.info({ sessionId }, 'Auto-booting WhatsApp session');
      await startBot({ sessionId });
    } catch (err) {
      logBot.error({ sessionId, err }, 'Failed to auto-boot WhatsApp session');
    }
  }
}

/**
 * Decides whether a given close status code is recoverable.
 * Anything except an explicit "do not reconnect" code triggers a retry.
 */
function shouldReconnectOnClose(statusCode) {
  if (statusCode === undefined) return true;
  // 515 / 428 are transient; loggedOut (401) is handled separately by the caller.
  return statusCode !== DisconnectReason.badSession;
}

function onFatal(err, sessionId) {
  logBot.fatal({ sessionId, err }, 'unrecoverable error during reconnect');
  setStatus(sessionId, STATUS.DISCONNECTED, { fatal: true });
}

export function getBotSocket(sessionId = 'default') {
  return activeSessions.get(sessionId)?.sock || null;
}

/**
 * Returns a list of all active session configurations and statuses.
 */
export function listActiveSessions() {
  const list = [];
  const sessionsDir = config.dirs.sessions;
  fs.mkdirSync(sessionsDir, { recursive: true });
  
  const files = fs.readdirSync(sessionsDir);
  const sessionIds = new Set(['default']);
  for (const file of files) {
    const fullPath = path.join(sessionsDir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      sessionIds.add(file);
    }
  }

  // Also include any sessions in memory that may not have files yet
  for (const id of activeSessions.keys()) {
    sessionIds.add(id);
  }

  for (const id of sessionIds) {
    list.push({
      id,
      status: getStatus(id),
      extra: getCurrentExtra(id),
    });
  }
  return list;
}

/**
 * Handles a manual Approve or Reject action from the web dashboard.
 *
 * @param {number} requestId - ID of the request in the join_requests table
 * @param {'approve' | 'reject'} action - the decision ('approve' or 'reject')
 */
export async function handleManualRequestAction(requestId, action) {
  const request = getJoinRequest(requestId);
  if (!request) {
    throw new Error('Request not found.');
  }

  if (request.status !== 'Pending') {
    throw new Error(`Request has already been ${request.status.toLowerCase()}.`);
  }

  const sessionId = request.session_id || 'default';
  const sock = getBotSocket(sessionId);
  if (!sock) {
    throw new Error(`WhatsApp bot for session "${sessionId}" is not connected. Connect the bot first.`);
  }

  logBot.info({ requestId, jid: request.jid, action, sessionId }, 'executing manual request action');

  // Call Baileys to update the participant status in the group
  await sock.groupRequestParticipantsUpdate(
    request.group_id,
    [request.jid],
    action
  );

  // Update status in the database
  const statusValue = action === 'approve' ? 'Approved' : 'Rejected';
  updateJoinRequestField(requestId, 'status', statusValue);

  // Clear any conversation state if we're done
  clearPendingReply(request.jid, sessionId);

  return { success: true, status: statusValue };
}

/**
 * Force starts/reconnects a WhatsApp session, resetting connection state and dropping any active socket.
 */
export async function forceStartBot(sessionId) {
  const state = getSessionState(sessionId);
  state.connecting = false;
  state.reconnectAttempts = 0;
  if (state.sock) {
    try {
      state.sock.end();
    } catch (e) {}
    state.sock = null;
  }
  return startBot({ sessionId });
}

/**
 * Cleans / deletes a single session directory and drops its socket connection.
 */
export async function cleanSession(sessionId) {
  const state = getSessionState(sessionId);
  if (state.sock) {
    state.isClosedManually = true;
    try {
      state.sock.end();
    } catch (e) {}
    state.sock = null;
  }

  // Wait 1.5 seconds for socket shutdown and Windows file locks release
  await new Promise(resolve => setTimeout(resolve, 1500));

  activeSessions.delete(sessionId);

  const sessionDir = path.resolve('sessions', sessionId);
  if (fs.existsSync(sessionDir)) {
    try {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    } catch (err) {
      logBot.error({ sessionId, err }, 'failed to delete session directory due to locked files');
    }
  }

  setStatus(sessionId, STATUS.DISCONNECTED);

  if (sessionId === 'default') {
    await startBot({ sessionId: 'default' });
  }
}

/**
 * Cleans / deletes ALL session directories and drops all active socket connections.
 */
export async function cleanAllSessions() {
  for (const [sessionId, state] of activeSessions.entries()) {
    if (state.sock) {
      state.isClosedManually = true;
      try {
        state.sock.end();
      } catch (e) {}
      state.sock = null;
    }
  }
  activeSessions.clear();

  // Wait 1.5 seconds for sockets to shut down and Windows file locks release
  await new Promise(resolve => setTimeout(resolve, 1500));

  const sessionsDir = path.resolve('sessions');
  if (fs.existsSync(sessionsDir)) {
    try {
      fs.rmSync(sessionsDir, { recursive: true, force: true });
    } catch (err) {
      logBot.error({ err }, 'failed to delete sessions directory due to locked files');
    }
  }
  fs.mkdirSync(sessionsDir, { recursive: true });

  clearAllStatuses();

  await startBot({ sessionId: 'default' });
}
