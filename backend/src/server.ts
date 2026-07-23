import express from 'express';
import { createServer } from 'http';
import path from 'node:path';
import fs from 'node:fs';
import bcryptjs from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { initSocketServer } from './services/socket.js';
import { logger } from './services/logger.js';
import { startBot, cleanSession, cleanAllSessions, getSocket, getLiveStatus, getAllLiveStatuses, deleteFromCloudinary } from './services/bot.js';
import { initScheduler } from './services/scheduler.js';
import { runExecution } from './services/workflowEngine.js';

const app = express();
const httpServer = createServer(app);
const prisma = new PrismaClient();

// Setup socket.io server
initSocketServer(httpServer);

// Body parers
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ limit: '5mb', extended: true }));

// CORS headers
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Setup logs directory
fs.mkdirSync(path.resolve('logs'), { recursive: true });

/* ---- AUTHENTICATION SYSTEM (DATABASE-BASED) ----------------------------------------------------- */

// Generate simple token
function generateToken(userId: string): string {
  return Buffer.from(`${userId}:${Date.now()}`).toString('base64');
}

// Verify token
function verifyToken(token: string): string | null {
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const [userId, timestamp] = decoded.split(':');
    // Token valid for 30 days
    if (Date.now() - parseInt(timestamp) > 30 * 24 * 60 * 60 * 1000) {
      return null;
    }
    return userId;
  } catch (e) {
    return null;
  }
}

// Hash password
async function hashPassword(password: string): Promise<string> {
  return bcryptjs.hash(password, 10);
}

// Compare password
async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcryptjs.compare(password, hash);
}

// Auth middleware
const authMiddleware = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    const userId = req.headers['x-user-id'];
    if (!userId || !req.headers['x-session-id']) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    req.userId = userId;
    return next();
  }
  
  const userId = verifyToken(token);
  if (!userId) {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
  req.userId = userId;
  next();
};

// Login endpoint (Database-based)
app.post('/api/auth/login', async (req, res) => {
  const { userId, password } = req.body;
  
  if (!userId || !password) {
    return res.status(400).json({ success: false, error: 'Missing credentials' });
  }

  try {
    // Find user in database
    const user = await prisma.user.findUnique({
      where: { userId }
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ 
        success: false, 
        error: 'Invalid user ID or password' 
      });
    }

    // Compare password with hash
    const passwordMatch = await comparePassword(password, user.password);
    
    if (passwordMatch) {
      const token = generateToken(user.userId);
      res.json({ 
        success: true, 
        token,
        userId: user.userId,
        fullName: user.fullName,
        message: 'Login successful'
      });
    } else {
      res.status(401).json({ 
        success: false, 
        error: 'Invalid user ID or password' 
      });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Login error: ' + err.message });
  }
});

// Register endpoint (Create new user)
app.post('/api/auth/register', async (req, res) => {
  const { userId, password, fullName, email } = req.body;
  
  if (!userId || !password) {
    return res.status(400).json({ success: false, error: 'Missing userId or password' });
  }

  try {
    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { userId }
    });

    if (existingUser) {
      return res.status(400).json({ success: false, error: 'User ID already exists' });
    }

    // Hash password
    const hashedPassword = await hashPassword(password);

    // Create user
    const newUser = await prisma.user.create({
      data: {
        userId,
        password: hashedPassword,
        fullName: fullName || userId,
        email
      }
    });

    res.json({ 
      success: true, 
      message: 'User created successfully',
      user: {
        id: newUser.id,
        userId: newUser.userId,
        fullName: newUser.fullName,
        email: newUser.email
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Registration error: ' + err.message });
  }
});

// Get all users (Admin only)
app.get('/api/auth/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        userId: true,
        fullName: true,
        email: true,
        isActive: true,
        createdAt: true
      }
    });
    res.json({ success: true, users });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Update user
app.put('/api/auth/users/:userId', async (req, res) => {
  const { userId } = req.params;
  const { fullName, email, isActive, password } = req.body;

  try {
    const updateData: any = {};
    if (fullName) updateData.fullName = fullName;
    if (email) updateData.email = email;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (password) updateData.password = await hashPassword(password);

    const updatedUser = await prisma.user.update({
      where: { userId },
      data: updateData,
      select: {
        id: true,
        userId: true,
        fullName: true,
        email: true,
        isActive: true
      }
    });

    res.json({ success: true, user: updatedUser });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete user
app.delete('/api/auth/users/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    await prisma.user.delete({
      where: { userId }
    });
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Verify token endpoint
app.post('/api/auth/verify', (req, res) => {
  const { token } = req.body;
  const userId = verifyToken(token);
  
  if (userId) {
    res.json({ success: true, userId });
  } else {
    res.status(401).json({ success: false, error: 'Invalid token' });
  }
});

/* ---- API ENDPOINTS ----------------------------------------------------- */

// Live in-memory session statuses (includes QR, pairing codes, phone, name)
app.get('/api/sessions/live', (req, res) => {
  res.json({ success: true, sessions: getAllLiveStatuses() });
});

app.get('/api/sessions/:sessionId/live', (req, res) => {
  const { sessionId } = req.params;
  res.json({ success: true, status: getLiveStatus(sessionId) });
});

// Sessions APIs (Prisma DB records)
app.get('/api/sessions', async (req, res) => {
  try {
    const list = await prisma.session.findMany();
    res.json({ success: true, sessions: list });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/sessions/start', async (req, res) => {
  const { sessionId, phoneNumber, usePairingCode } = req.body;
  if (!sessionId) return res.status(400).json({ success: false, error: 'Session ID is required.' });

  try {
    // Start bot async
    startBot({ sessionId, phoneNumber, usePairingCode });
    res.json({ success: true, message: `Boot sequence triggered for session: ${sessionId}` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/sessions/:sessionId/reconnect', async (req, res) => {
  const { sessionId } = req.params;
  try {
    await cleanSession(sessionId);
    res.json({ success: true, message: `Reconnect triggered for: ${sessionId}` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/sessions/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  try {
    await cleanSession(sessionId);
    await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
    res.json({ success: true, message: `Wiped session: ${sessionId}` });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/sessions/clean', async (req, res) => {
  try {
    await cleanAllSessions();
    res.json({ success: true, message: 'All active sessions and files wiped.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Logs API
app.get('/api/logs', async (req, res) => {
  try {
    const list = await prisma.systemLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 200
    });
    res.json({ success: true, logs: list.reverse() });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Groups Loader API
app.get('/api/groups/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  const sock = getSocket(sessionId);
  if (!sock) return res.status(400).json({ success: false, error: 'WhatsApp session not connected.' });

  try {
    // Queries group chat states from Baileys
    const groupsList = await sock.groupFetchAllParticipating();
    const formatted = Object.values(groupsList).map((g: any) => ({
      id: g.id,
      subject: g.subject,
      desc: g.desc || '',
      size: g.participants?.length || 0,
      participants: g.participants || [],
      admins: g.participants?.filter((p: any) => p.admin).map((p: any) => p.id) || []
    }));
    res.json({ success: true, groups: formatted });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Join Request Approvals APIs
app.get('/api/join-requests/:sessionId', async (req, res) => {
  const { sessionId } = req.params;
  try {
    const list = await prisma.joinRequest.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ success: true, requests: list });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/join-requests/:sessionId/:requestId/approve', async (req, res) => {
  const { sessionId, requestId } = req.params;
  const { action } = req.body; // "approve" or "reject"
  const sock = getSocket(sessionId);

  if (!sock) return res.status(400).json({ success: false, error: 'WhatsApp session not connected.' });

  try {
    const request = await prisma.joinRequest.findUnique({ where: { id: parseInt(requestId) } });
    if (!request) return res.status(404).json({ success: false, error: 'Request not found.' });

    if (action === 'approve') {
      // In Baileys: groupRequestApproval(groupId, [jid], 'approve')
      await sock.groupRequestApproval(request.groupId, [request.jid], 'approve');
      await prisma.joinRequest.update({ where: { id: request.id }, data: { status: 'Approved' } });
      logger.info(sessionId, `Manually approved join request for ${request.jid} inside ${request.groupId}`);
    } else {
      await sock.groupRequestApproval(request.groupId, [request.jid], 'reject');
      await prisma.joinRequest.update({ where: { id: request.id }, data: { status: 'Rejected' } });
      logger.info(sessionId, `Manually rejected join request for ${request.jid} inside ${request.groupId}`);
    }

    res.json({ success: true, status: action === 'approve' ? 'Approved' : 'Rejected' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Broadcaster Scheduler APIs
app.get('/api/scheduler', async (req, res) => {
  try {
    const list = await prisma.scheduledMessage.findMany({ orderBy: { scheduledTime: 'asc' } });
    res.json({ success: true, scheduler: list });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/scheduler', async (req, res) => {
  const { sessionId, recipient, message, scheduledTime } = req.body;
  if (!sessionId || !recipient || !message || !scheduledTime) {
    return res.status(400).json({ success: false, error: 'Missing required parameters.' });
  }

  try {
    const record = await prisma.scheduledMessage.create({
      data: {
        sessionId,
        recipient,
        message,
        scheduledTime: new Date(scheduledTime),
        status: 'Pending'
      }
    });
    res.json({ success: true, scheduled: record });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/scheduler/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.scheduledMessage.delete({ where: { id: parseInt(id) } });
    res.json({ success: true, message: 'Scheduled message cancelled.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Auto Replies APIs
app.get('/api/auto-replies', async (req, res) => {
  try {
    const list = await prisma.autoReply.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ success: true, rules: list });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/auto-replies', async (req, res) => {
  const { sessionId, type, keyword, replyText, personality, customTone, matchType, useAi } = req.body;
  if (!sessionId || !type || (!replyText && !useAi)) {
    return res.status(400).json({ success: false, error: 'Missing parameters.' });
  }

  try {
    const rule = await prisma.autoReply.create({
      data: {
        sessionId,
        type,
        keyword: (type === 'keyword' || type === 'command') ? keyword : null,
        replyText: replyText || (useAi ? '[AI Response]' : ''),
        personality: personality || 'friendly',
        customTone: customTone || null,
        matchType: matchType || 'contains',
        useAi: !!useAi,
        isActive: true
      }
    });
    res.json({ success: true, rule });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/auto-replies/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.autoReply.delete({ where: { id: parseInt(id) } });
    res.json({ success: true, message: 'Auto reply rule removed.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// AI Configuration APIs
app.get('/api/ai-config', async (req, res) => {
  try {
    let config = await prisma.aiConfig.findFirst();
    if (!config) {
      config = await prisma.aiConfig.create({
        data: {
          provider: 'pollinations',
          systemPrompt: 'You are Ana, a smart and friendly WhatsApp AI assistant. Give concise, helpful responses suited for WhatsApp messaging.',
          isEnabled: true
        }
      });
    }
    res.json({ success: true, config });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/ai-config', async (req, res) => {
  const { provider, apiKey, modelName, systemPrompt, dailyLimit, isEnabled } = req.body;
  try {
    const updated = await prisma.aiConfig.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        provider: provider || 'pollinations',
        apiKey: apiKey || null,
        modelName: modelName || 'gpt-4o-mini',
        systemPrompt: systemPrompt || 'You are Ana, a smart and friendly WhatsApp AI assistant.',
        dailyLimit: dailyLimit ? parseInt(dailyLimit) : 500,
        isEnabled: isEnabled !== undefined ? isEnabled : true
      },
      update: {
        provider,
        apiKey: apiKey || null,
        modelName,
        systemPrompt,
        dailyLimit: dailyLimit ? parseInt(dailyLimit) : 500,
        isEnabled
      }
    });
    res.json({ success: true, config: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// AI Usage Stats & Chat Logs APIs
app.get('/api/ai-logs', async (req, res) => {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const logs = await prisma.aiChatLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    const todayCount = await prisma.aiChatLog.count({
      where: { createdAt: { gte: startOfDay } }
    });

    const totalCount = await prisma.aiChatLog.count();

    res.json({
      success: true,
      logs,
      stats: {
        todayCount,
        totalCount
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---- ENTERPRISE WORKFLOW AUTOMATION APIS ---------------------------------- //

// Get all workflows for a session
app.get('/api/workflows', async (req, res) => {
  const sessionId = (req.query.sessionId as string) || 'default';
  try {
    const list = await prisma.workflow.findMany({
      where: { sessionId },
      include: { nodes: true, connections: true },
      orderBy: { updatedAt: 'desc' }
    });
    res.json({ success: true, workflows: list });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create or Save Workflow with Nodes & Connections (Auto-Save & Version History)
app.post('/api/workflows', async (req, res) => {
  const { id, name, description, sessionId, isActive, nodes, connections } = req.body;
  const targetSessionId = sessionId || 'default';

  try {
    let workflow;
    if (id) {
      // Delete existing nodes and connections, then recreate (upsert nodes/edges)
      await prisma.workflowNode.deleteMany({ where: { workflowId: id } });
      await prisma.workflowConnection.deleteMany({ where: { workflowId: id } });

      workflow = await prisma.workflow.update({
        where: { id },
        data: {
          name: name || 'Untitled Workflow',
          description,
          isActive: isActive !== undefined ? isActive : true,
          version: { increment: 1 },
          nodes: {
            create: (nodes || []).map((n: any) => ({
              nodeId: n.id,
              type: n.type || 'action',
              subtype: n.data?.subtype || 'send_message',
              label: n.data?.label || 'Node',
              positionX: n.position.x,
              positionY: n.position.y,
              configJson: JSON.stringify(n.data?.config || {})
            }))
          },
          connections: {
            create: (connections || []).map((c: any) => ({
              edgeId: c.id,
              sourceNodeId: c.source,
              targetNodeId: c.target,
              sourceHandle: c.sourceHandle || null,
              targetHandle: c.targetHandle || null
            }))
          }
        },
        include: { nodes: true, connections: true }
      });
    } else {
      workflow = await prisma.workflow.create({
        data: {
          name: name || 'New Enterprise Workflow',
          description,
          sessionId: targetSessionId,
          isActive: true,
          nodes: {
            create: (nodes || []).map((n: any) => ({
              nodeId: n.id,
              type: n.type || 'action',
              subtype: n.data?.subtype || 'send_message',
              label: n.data?.label || 'Node',
              positionX: n.position.x,
              positionY: n.position.y,
              configJson: JSON.stringify(n.data?.config || {})
            }))
          },
          connections: {
            create: (connections || []).map((c: any) => ({
              edgeId: c.id,
              sourceNodeId: c.source,
              targetNodeId: c.target,
              sourceHandle: c.sourceHandle || null,
              targetHandle: c.targetHandle || null
            }))
          }
        },
        include: { nodes: true, connections: true }
      });
    }

    res.json({ success: true, workflow });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete Workflow
app.delete('/api/workflows/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.workflow.delete({ where: { id } });
    res.json({ success: true, message: 'Workflow deleted successfully.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Get Execution History & Logs for a Workflow
app.get('/api/workflows/:id/executions', async (req, res) => {
  const { id } = req.params;
  try {
    const executions = await prisma.workflowExecution.findMany({
      where: { workflowId: id },
      include: { logs: { orderBy: { timestamp: 'asc' } } },
      orderBy: { startedAt: 'desc' },
      take: 50
    });
    res.json({ success: true, executions });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Resume or Retry Failed Execution
app.post('/api/workflows/executions/:executionId/retry', async (req, res) => {
  const { executionId } = req.params;
  try {
    await prisma.workflowExecution.update({
      where: { id: executionId },
      data: { status: 'running', retryCount: { increment: 1 } }
    });
    runExecution(executionId);
    res.json({ success: true, message: 'Workflow execution retried!' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// WhatsApp Profile Picture Update API
app.post('/api/sessions/:sessionId/update-dp', async (req, res) => {
  const { sessionId } = req.params;
  const { imageUrl } = req.body; // Image URL or Base64 string
  const sock = getSocket(sessionId);

  if (!sock) return res.status(400).json({ success: false, error: 'WhatsApp session not connected.' });
  if (!imageUrl) return res.status(400).json({ success: false, error: 'Image URL or base64 data required.' });

  try {
    let imgBuffer: Buffer;
    if (imageUrl.startsWith('data:image')) {
      const base64Data = imageUrl.split(',')[1];
      imgBuffer = Buffer.from(base64Data, 'base64');
    } else {
      const fetchRes = await fetch(imageUrl);
      const arrayBuf = await fetchRes.arrayBuffer();
      imgBuffer = Buffer.from(arrayBuf);
    }

    const userJid = sock.user?.id.split(':')[0] + '@s.whatsapp.net';
    await sock.updateProfilePicture(userJid, imgBuffer);

    logger.info(sessionId, `Profile picture updated successfully for ${userJid}`);
    res.json({ success: true, message: 'WhatsApp Profile Picture updated successfully!' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Profile Settings Endpoint (Updates Name, About status, and DP from Base64 upload)
app.post('/api/sessions/:sessionId/profile', async (req, res) => {
  const { sessionId } = req.params;
  const { name, about, photo } = req.body; // photo is optional Base64 dataURL
  const sock = getSocket(sessionId);

  if (!sock) return res.status(400).json({ success: false, error: 'WhatsApp session not connected.' });

  try {
    // 1. Update Name if provided
    if (name && name.trim()) {
      await sock.updateProfileName(name.trim());
      logger.info(sessionId, `Profile Name updated to: ${name}`);
    }

    // 2. Update About status if provided
    if (about && about.trim()) {
      await sock.updateProfileStatus(about.trim());
      logger.info(sessionId, `Profile About status updated to: ${about}`);
    }

    // 3. Update Profile Picture if base64 photo is provided
    if (photo && photo.startsWith('data:image')) {
      const base64Data = photo.split(',')[1];
      const imgBuffer = Buffer.from(base64Data, 'base64');
      const userJid = sock.user?.id.split(':')[0] + '@s.whatsapp.net';
      await sock.updateProfilePicture(userJid, imgBuffer);
      logger.info(sessionId, `Profile Picture updated for ${userJid}`);
    }

    res.json({ success: true, message: 'WhatsApp Profile Settings updated successfully!' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cloudinary Configuration GET/POST APIs
app.get('/api/cloudinary-config', async (req, res) => {
  try {
    const config = await prisma.cloudinaryConfig.findFirst({ where: { id: 1 } });
    res.json({ success: true, config });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/cloudinary-config', async (req, res) => {
  const { cloudName, apiKey, apiSecret } = req.body;
  try {
    const config = await prisma.cloudinaryConfig.upsert({
      where: { id: 1 },
      create: { id: 1, cloudName, apiKey, apiSecret },
      update: { cloudName, apiKey, apiSecret }
    });
    res.json({ success: true, config });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Supervision Targets Management
app.get('/api/supervision', async (req, res) => {
  try {
    const targets = await prisma.supervisionTarget.findMany();
    res.json({ success: true, targets });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/supervision', async (req, res) => {
  const { sessionId, jid, name } = req.body;
  if (!jid || !name) return res.status(400).json({ success: false, error: 'JID and Name are required.' });
  
  try {
    // Normalize JID (remove suffix @s.whatsapp.net if supplied)
    const cleanJid = jid.split('@')[0];
    
    const target = await prisma.supervisionTarget.create({
      data: {
        sessionId: sessionId || 'default',
        jid: cleanJid,
        name
      }
    });

    // If socket is running, immediately subscribe to presence
    const sock = getSocket(sessionId || 'default');
    if (sock) {
      await sock.subscribePresence(cleanJid + '@s.whatsapp.net');
    }

    res.json({ success: true, target });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/supervision/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.supervisionTarget.delete({ where: { id: parseInt(id) } });
    res.json({ success: true, message: 'Supervision target removed.' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Supervision Statistics Reports
app.get('/api/supervision/stats', async (req, res) => {
  try {
    const logs = await prisma.supervisionLog.findMany({
      orderBy: { startedAt: 'desc' }
    });
    
    const targets = await prisma.supervisionTarget.findMany();
    
    // Compute stats grouped by targetJid
    const stats: Record<string, any> = {};
    
    targets.forEach(t => {
      stats[t.jid] = {
        jid: t.jid,
        name: t.name,
        isActive: t.isActive,
        totalDuration: 0,
        sessionsCount: 0,
        lastSeen: null
      };
    });

    logs.forEach(log => {
      if (stats[log.targetJid]) {
        stats[log.targetJid].totalDuration += log.duration;
        stats[log.targetJid].sessionsCount++;
        
        // Track the most recent active time
        const logDate = log.endedAt || log.startedAt;
        if (!stats[log.targetJid].lastSeen || logDate.getTime() > stats[log.targetJid].lastSeen.getTime()) {
          stats[log.targetJid].lastSeen = logDate;
        }
      }
    });

    res.json({ success: true, stats: Object.values(stats), logs: logs.slice(0, 100) });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Deleted Messages Console (Anti-Delete) Log APIs
app.get('/api/deleted-messages', async (req, res) => {
  try {
    const list = await prisma.deletedMessage.findMany({
      orderBy: { deletedAt: 'desc' }
    });
    res.json({ success: true, messages: list });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/deleted-messages', async (req, res) => {
  try {
    // Fetch all logs to delete their Cloudinary media
    const logs = await prisma.deletedMessage.findMany({
      where: { cloudinaryPublicId: { not: null } }
    });

    for (const log of logs) {
      if (log.cloudinaryPublicId) {
        await deleteFromCloudinary(log.cloudinaryPublicId);
      }
    }

    await prisma.deletedMessage.deleteMany({});
    res.json({ success: true, message: 'Deleted message logs cleared successfully (including Cloudinary assets).' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Backend status & health check endpoint
app.get('/api/status', async (req, res) => {
  let dbStatus = 'OK';
  let dbError = '';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (err: any) {
    dbStatus = 'FAILED';
    dbError = err.message || String(err);
  }

  const envVars = {
    DATABASE_URL: !!process.env.DATABASE_URL,
    SESSION_ID: !!process.env.SESSION_ID,
    LOG_LEVEL: !!process.env.LOG_LEVEL,
  };
  const missingVars = Object.entries(envVars)
    .filter(([_, exists]) => !exists)
    .map(([name]) => name);
  const envStatus = missingVars.length === 0 ? 'OK' : 'MISSING';

  const isHealthy = dbStatus === 'OK' && envStatus === 'OK';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Backend Deployment Status</title>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-gradient: radial-gradient(circle at top, #1a1a2e 0%, #0d0d15 100%);
      --card-bg: rgba(255, 255, 255, 0.02);
      --card-border: rgba(255, 255, 255, 0.08);
      --text-primary: #ffffff;
      --text-secondary: #94a3b8;
      --success: #10b981;
      --error: #ef4444;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: 'Outfit', sans-serif;
      background: var(--bg-gradient);
      color: var(--text-primary);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .container {
      max-width: 500px;
      width: 90%;
      padding: 3rem 2rem;
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 24px;
      backdrop-filter: blur(16px);
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      text-align: center;
      box-sizing: border-box;
    }
    .status-icon-wrapper {
      width: 100px;
      height: 100px;
      margin: 0 auto 2rem auto;
      position: relative;
    }
    .status-icon {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.03);
      border: 3px solid;
    }
    .status-icon.success {
      border-color: var(--success);
      color: var(--success);
      box-shadow: 0 0 20px rgba(16, 185, 129, 0.2);
    }
    .status-icon.error {
      border-color: var(--error);
      color: var(--error);
      box-shadow: 0 0 20px rgba(239, 68, 68, 0.2);
    }
    h1 {
      font-size: 1.8rem;
      margin: 0 0 0.5rem 0;
      font-weight: 700;
    }
    .subtitle {
      color: var(--text-secondary);
      font-size: 0.95rem;
      margin-bottom: 2rem;
    }
    .check-list {
      text-align: left;
      margin-bottom: 1.5rem;
    }
    .check-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.9rem 1.2rem;
      background: rgba(255, 255, 255, 0.015);
      border: 1px solid rgba(255, 255, 255, 0.04);
      border-radius: 14px;
      margin-bottom: 0.8rem;
      transition: all 0.2s ease;
    }
    .check-item:hover {
      background: rgba(255, 255, 255, 0.03);
      transform: translateX(4px);
    }
    .check-name {
      font-weight: 500;
      font-size: 0.95rem;
    }
    .badge {
      font-size: 0.8rem;
      font-weight: 600;
      padding: 0.25rem 0.65rem;
      border-radius: 6px;
      text-transform: uppercase;
    }
    .badge.success {
      background: rgba(16, 185, 129, 0.15);
      color: var(--success);
    }
    .badge.error {
      background: rgba(239, 68, 68, 0.15);
      color: var(--error);
    }
    .error-console {
      background: rgba(239, 68, 68, 0.07);
      border: 1px solid rgba(239, 68, 68, 0.2);
      border-radius: 12px;
      padding: 1rem;
      text-align: left;
      margin-top: 1.5rem;
      max-height: 180px;
      overflow-y: auto;
    }
    .error-console-title {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--error);
      margin: 0 0 0.5rem 0;
    }
    .error-details {
      font-family: monospace;
      font-size: 0.78rem;
      color: #fca5a5;
      margin: 0;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .footer {
      margin-top: 2rem;
      font-size: 0.8rem;
      color: var(--text-secondary);
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="status-icon-wrapper">
      <div class="status-icon ${isHealthy ? 'success' : 'error'}">
        ${isHealthy ? `
          <!-- Green Tick SVG -->
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ` : `
          <!-- Red Cross SVG -->
          <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        `}
      </div>
    </div>
    
    <h1>${isHealthy ? 'System Online' : 'System Issues Detected'}</h1>
    <div class="subtitle">Backend Environment Health Report</div>

    <div class="check-list">
      <div class="check-item">
        <span class="check-name">Database Connection</span>
        <span class="badge ${dbStatus === 'OK' ? 'success' : 'error'}">${dbStatus}</span>
      </div>
      <div class="check-item">
        <span class="check-name">Environment Configuration</span>
        <span class="badge ${envStatus === 'OK' ? 'success' : 'error'}">${envStatus}</span>
      </div>
    </div>

    ${!isHealthy ? `
      <div class="error-console">
        <div class="error-console-title">Error Details & Diagnostics:</div>
        <p class="error-details">${
          [
            dbError ? `Database Connection Error:\n${dbError}` : '',
            missingVars.length > 0 ? `Missing Env Variables:\n- ${missingVars.join('\n- ')}` : ''
          ].filter(Boolean).join('\n\n')
        }</p>
      </div>
    ` : ''}

    <div class="footer">
      Server Time: ${new Date().toLocaleString()} | Vercel Deployment
    </div>
  </div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

// Serve static frontend assets in production mode
const frontendDist = path.resolve('../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => res.sendFile(path.join(frontendDist, 'index.html')));
} else {
  app.get('/', (req, res) => {
    res.send('WhatsApp Automation backend is running in Dev mode.');
  });
}

// Start auto scheduler
initScheduler();

// Port allocation
const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, async () => {
  console.log(`WA Automate Server running on http://localhost:${PORT}`);

  // Auto boot default session on startup
  try {
    logger.info('default', 'Triggering auto-boot for default session.');
    await startBot({ sessionId: 'default' });
  } catch (e) {
    console.error('Failed to auto-boot default session:', e);
  }
});
