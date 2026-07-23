import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'node:path';
import fs from 'node:fs';
import { getStatus, getCurrentExtra, onStatusChange } from '../utils/status.js';
import { logListeners } from '../utils/logger.js';
import { listJoinRequests, createScheduledMessage, listScheduledMessages, deleteScheduledMessage } from '../database/index.js';
import { handleManualRequestAction, startBot, getBotSocket, listActiveSessions, forceStartBot, cleanSession, cleanAllSessions } from './bot.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

const logDashboard = logger.child({ module: 'dashboard' });

const LOG_BACKLOG_SIZE = 100;
const logBacklog = [];

// Intercept logs for the UI backlog with parsed session context
logListeners.push((logLine) => {
  let session = 'default';
  try {
    const parsed = JSON.parse(logLine);
    if (parsed.sessionId) {
      session = parsed.sessionId;
    }
  } catch (e) {}
  logBacklog.push({ session, line: logLine });
  if (logBacklog.length > LOG_BACKLOG_SIZE) {
    logBacklog.shift();
  }
});

/**
 * Initializes and starts the web dashboard server.
 *
 * Runs Express on port 3000 (or config port if specified) and binds a WebSocket server
 * to stream bot status updates, logs, and database events.
 */
export function startDashboard() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });

  wss.on('error', (err) => {
    logDashboard.debug({ err }, 'websocket server error');
  });

  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ limit: '5mb', extended: true }));
  
  // Serve static files from public
  const publicDir = path.resolve('public');
  app.use(express.static(publicDir));

  // Admin Page route
  app.get('/admin', (req, res) => {
    res.sendFile(path.resolve('public', 'admin.html'));
  });

  // Admin API: List all directories in sessions/
  app.get('/api/admin/sessions', (req, res) => {
    try {
      const sessionsDir = path.resolve('sessions');
      let directories = [];
      if (fs.existsSync(sessionsDir)) {
        directories = fs.readdirSync(sessionsDir).filter(file => {
          return fs.statSync(path.join(sessionsDir, file)).isDirectory();
        });
      }
      res.json({ success: true, sessions: directories });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Admin API: Clear all WhatsApp sessions
  app.post('/api/admin/sessions/clean', async (req, res) => {
    try {
      await cleanAllSessions();
      // Broadcast sessions update to UIs
      broadcast({
        type: 'sessions_update',
        sessions: listActiveSessions(),
      });
      res.json({ success: true, message: 'All WhatsApp sessions have been cleaned successfully.' });
    } catch (err) {
      logDashboard.error({ err }, 'failed to clean all sessions');
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Admin API: Delete a specific session
  app.delete('/api/admin/sessions/:sessionId', async (req, res) => {
    const { sessionId } = req.params;
    try {
      await cleanSession(sessionId);
      // Broadcast sessions update
      broadcast({
        type: 'sessions_update',
        sessions: listActiveSessions(),
      });
      res.json({ success: true, message: `Session "${sessionId}" has been deleted.` });
    } catch (err) {
      logDashboard.error({ err, sessionId }, 'failed to delete session');
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Initialize DP directory
  const dpsDir = path.resolve(publicDir, 'dps');
  fs.mkdirSync(dpsDir, { recursive: true });

  /* ---- API Endpoints ----------------------------------------------------- */

  // Upload Profile Picture (DP) for a session
  app.post('/api/sessions/:sessionId/dp', (req, res) => {
    const { sessionId } = req.params;
    const { image } = req.body;
    if (!image) {
      return res.status(400).json({ success: false, error: 'No image data provided.' });
    }
    try {
      const matches = image.match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
      if (!matches || matches.length !== 3) {
        return res.status(400).json({ success: false, error: 'Invalid image format.' });
      }
      const dataBuffer = Buffer.from(matches[2], 'base64');
      fs.writeFileSync(path.join(dpsDir, `${sessionId}.png`), dataBuffer);
      res.json({ success: true, message: 'Profile picture updated successfully!' });
    } catch (err) {
      logDashboard.error({ err, sessionId }, 'failed to save profile image');
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get list of active sessions
  app.get('/api/sessions', (req, res) => {
    res.json({
      success: true,
      sessions: listActiveSessions(),
    });
  });

  // Create and initialize a new WhatsApp session
  app.post('/api/sessions', async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId || !/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
      return res.status(400).json({ success: false, error: 'Invalid Session ID. Use only alphanumeric characters, underscores, or dashes.' });
    }

    try {
      await startBot({ sessionId });
      
      // Broadcast sessions update to sync UIs
      broadcast({
        type: 'sessions_update',
        sessions: listActiveSessions(),
      });

      res.json({
        success: true,
        message: `Session "${sessionId}" initialized successfully!`,
        status: getStatus(sessionId),
      });
    } catch (err) {
      logDashboard.error({ err, sessionId }, 'failed to initialize new session');
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get current bot status for a session
  app.get('/api/status', (req, res) => {
    const session = req.query.session || 'default';
    res.json({
      status: getStatus(session),
      extra: getCurrentExtra(session),
      session,
    });
  });

  // Get list of groups the bot is participating in for a session
  app.get('/api/groups', async (req, res) => {
    const session = req.query.session || 'default';
    try {
      const sock = getBotSocket(session);
      if (!sock) {
        return res.json({ success: true, groups: [] });
      }
      const groups = await sock.groupFetchAllParticipating();
      const list = Object.values(groups).map(g => ({
        id: g.id,
        subject: g.subject,
        memberCount: g.participants ? g.participants.length : 0,
        joinApprovalMode: !!g.joinApprovalMode,
      }));
      res.json({ success: true, groups: list });
    } catch (err) {
      logDashboard.error({ err, session }, 'failed to fetch WhatsApp groups');
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get all join requests for a session
  app.get('/api/requests', (req, res) => {
    const session = req.query.session || 'default';
    try {
      const requests = listJoinRequests({ sessionId: session });
      res.json({ success: true, requests });
    } catch (err) {
      logDashboard.error({ err, session }, 'failed to list requests');
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Handle manual accept / reject actions
  app.post('/api/requests/:id/action', async (req, res) => {
    const { id } = req.params;
    const { action } = req.body; // 'approve' | 'reject'

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, error: 'Invalid action.' });
    }

    try {
      const result = await handleManualRequestAction(Number(id), action);
      
      // Broadcast update to all websocket clients to sync listings
      broadcast({
        type: 'request_update',
        requestId: id,
        status: result.status,
      });

      res.json({ success: true, ...result });
    } catch (err) {
      logDashboard.error({ err, id, action }, 'failed to execute manual action');
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Trigger manual logout / session clearance for a session
  app.post('/api/bot/logout', async (req, res) => {
    const session = req.body.session || 'default';
    try {
      const sock = getBotSocket(session);
      if (sock) {
        await sock.logout();
      }
      res.json({ success: true, message: `Session "${session}" logged out. Relog with new QR code.` });
    } catch (err) {
      logDashboard.error({ err, session }, 'logout failed');
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Trigger manual reconnect / socket refresh for a session
  app.post('/api/bot/reconnect', async (req, res) => {
    const session = req.body.session || 'default';
    try {
      await forceStartBot(session);
      res.json({ success: true, message: `Reconnection initiated for session "${session}".` });
    } catch (err) {
      logDashboard.error({ err, session }, 'reconnect failed');
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Direct messenger - Send immediate WhatsApp message
  app.post('/api/messages/send', async (req, res) => {
    const { recipient, message, session } = req.body;
    const activeSession = session || 'default';
    if (!recipient || !message) {
      return res.status(400).json({ success: false, error: 'Recipient JID and message text are required.' });
    }

    try {
      const sock = getBotSocket(activeSession);
      if (!sock) {
        throw new Error(`WhatsApp bot for session "${activeSession}" is not connected. Connect the bot first.`);
      }

      let jid = recipient.trim();
      if (!jid.includes('@')) {
        jid = jid.endsWith('-') || jid.length > 15 ? `${jid}@g.us` : `${jid}@s.whatsapp.net`;
      }

      await sock.sendMessage(jid, { text: message });
      res.json({ success: true, message: 'Message dispatched successfully!' });
    } catch (err) {
      logDashboard.error({ err, recipient, activeSession }, 'failed to send manual message');
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Scheduler - List all scheduled messages for a session
  app.get('/api/scheduler', (req, res) => {
    const session = req.query.session || 'default';
    try {
      const messages = listScheduledMessages(session);
      res.json({ success: true, messages });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Scheduler - Schedule a new message
  app.post('/api/scheduler', (req, res) => {
    const { recipient, message, scheduledTime, session } = req.body;
    const activeSession = session || 'default';
    if (!recipient || !message || !scheduledTime) {
      return res.status(400).json({ success: false, error: 'Recipient, message, and scheduledTime are required.' });
    }

    try {
      const id = createScheduledMessage({ recipient, message, scheduledTime, sessionId: activeSession });
      res.json({ success: true, id, message: 'Message scheduled successfully!' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Scheduler - Cancel/Delete a scheduled message
  app.delete('/api/scheduler/:id', (req, res) => {
    const { id } = req.params;
    try {
      deleteScheduledMessage(Number(id));
      res.json({ success: true, message: 'Scheduled message cancelled.' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Fallback to serving index.html for UI routing
  app.get('*all', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  /* ---- WebSocket Live Communication -------------------------------------- */

  const clients = new Set();

  function broadcast(data) {
    const payload = JSON.stringify(data);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  // Subscribe to status changes to broadcast them instantly
  onStatusChange((sessionId, status, previous, extra) => {
    broadcast({
      type: 'status',
      session: sessionId,
      status,
      extra,
    });
  });

  // Subscribe to logs to stream them with parsed session
  logListeners.push((logLine) => {
    let session = 'default';
    try {
      const parsed = JSON.parse(logLine);
      if (parsed.sessionId) {
        session = parsed.sessionId;
      }
    } catch (e) {}
    broadcast({
      type: 'log',
      session,
      line: logLine,
    });
  });

  wss.on('connection', (ws) => {
    clients.add(ws);
    logDashboard.debug('websocket client connected');

    // Send initial active sessions list and backlog
    ws.send(
      JSON.stringify({
        type: 'init',
        sessions: listActiveSessions(),
        backlog: logBacklog,
      })
    );

    ws.on('close', () => {
      clients.delete(ws);
      logDashboard.debug('websocket client disconnected');
    });
  });

  let port = Number(process.env.PORT || 3000);
  
  function startListening() {
    server.listen(port, () => {
      logDashboard.info(`dashboard server running at http://localhost:${port}`);
    });
  }

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      logDashboard.warn(`port ${port} is in use, trying next port ${port + 1}...`);
      port += 1;
      startListening();
    } else {
      logDashboard.error({ err }, 'server startup error');
    }
  });

  startListening();
}
