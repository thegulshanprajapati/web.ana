import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  useMultiFileAuthState,
  makeCacheableSignalKeyStore,
  Browsers,
  downloadContentFromMessage
} from '@whiskeysockets/baileys';
import { PrismaClient } from '@prisma/client';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { logger } from './logger.js';
import { broadcastEvent } from './socket.js';
import { generateAiResponse } from './ai.js';
import { triggerWorkflows } from './workflowEngine.js';

const prisma = new PrismaClient();

// Media cache helper for anti-delete logger
async function cacheMediaMessage(msgId: string, messageContent: any, type: 'image' | 'video' | 'document') {
  try {
    const stream = await downloadContentFromMessage(messageContent, type);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) {
      buffer = Buffer.concat([buffer, chunk]);
    }
    const dir = path.resolve('logs/media_cache');
    fs.mkdirSync(dir, { recursive: true });
    const tempPath = path.join(dir, `${msgId}.jpg`);
    fs.writeFileSync(tempPath, buffer);
    return tempPath;
  } catch (err) {
    console.error('Failed to cache media message:', err);
    return null;
  }
}

// Cloudinary signed upload
export async function uploadToCloudinary(filePath: string): Promise<{ secure_url: string; public_id: string } | null> {
  const config = await prisma.cloudinaryConfig.findFirst({ where: { id: 1 } });
  if (!config || !config.cloudName || !config.apiKey || !config.apiSecret) {
    console.error('Cloudinary config is missing.');
    return null;
  }
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signatureStr = `timestamp=${timestamp}${config.apiSecret}`;
    const signature = crypto.createHash('sha1').update(signatureStr).digest('hex');
    
    const formData = new URLSearchParams();
    formData.append('file', `data:image/jpeg;base64,${fileBuffer.toString('base64')}`);
    formData.append('api_key', config.apiKey);
    formData.append('timestamp', timestamp);
    formData.append('signature', signature);
    
    const url = `https://api.cloudinary.com/v1_1/${config.cloudName}/image/upload`;
    const res = await fetch(url, {
      method: 'POST',
      body: formData
    });
    const data = (await res.json()) as any;
    if (data.secure_url) {
      return { secure_url: data.secure_url, public_id: data.public_id };
    } else {
      console.error('Cloudinary upload response error:', data);
      return null;
    }
  } catch (err) {
    console.error('Cloudinary upload failed:', err);
    return null;
  }
}

// Cloudinary delete asset
export async function deleteFromCloudinary(publicId: string): Promise<boolean> {
  const config = await prisma.cloudinaryConfig.findFirst({ where: { id: 1 } });
  if (!config || !config.cloudName || !config.apiKey || !config.apiSecret) return false;
  try {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signatureStr = `public_id=${publicId}&timestamp=${timestamp}${config.apiSecret}`;
    const signature = crypto.createHash('sha1').update(signatureStr).digest('hex');
    
    const formData = new URLSearchParams();
    formData.append('public_id', publicId);
    formData.append('api_key', config.apiKey);
    formData.append('timestamp', timestamp);
    formData.append('signature', signature);
    
    const url = `https://api.cloudinary.com/v1_1/${config.cloudName}/image/destroy`;
    const res = await fetch(url, {
      method: 'POST',
      body: formData
    });
    const data = (await res.json()) as any;
    return data.result === 'ok';
  } catch (err) {
    console.error('Cloudinary delete failed:', err);
    return false;
  }
}
const sessions = new Map<string, {
  sock: any | null;
  connecting: boolean;
  reconnectAttempts: number;
  isClosedManually: boolean;
  usePairingCode: boolean;
}>();

// In-memory live status store — persists QR/code across socket reconnects
const liveStatus = new Map<string, {
  status: string;
  qr?: string;
  code?: string;
  phone?: string;
  name?: string;
}>();

export function getLiveStatus(sessionId: string) {
  return liveStatus.get(sessionId) || { status: 'disconnected' };
}

export function getAllLiveStatuses() {
  const result: any[] = [];
  for (const [id, status] of liveStatus.entries()) {
    result.push({ id, ...status });
  }
  return result;
}

const MAX_RECONNECTS = 10;

function getSessionState(sessionId: string) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, {
      sock: null,
      connecting: false,
      reconnectAttempts: 0,
      isClosedManually: false,
      usePairingCode: false
    });
  }
  return sessions.get(sessionId)!;
}

export async function startBot(opts: { sessionId: string; phoneNumber?: string; usePairingCode?: boolean }) {
  const { sessionId } = opts;
  const state = getSessionState(sessionId);

  if (state.connecting) {
    logger.warn(sessionId, 'Session connection attempt already active.');
    return;
  }
  state.connecting = true;
  state.usePairingCode = !!opts.usePairingCode;

  const sessionDir = path.resolve('sessions', sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });

  try {
    const { state: authState, saveCreds } = await useMultiFileAuthState(sessionDir);

    let version: any = [2, 3000, 10159];
    try {
      const verInfo = await fetchLatestBaileysVersion();
      version = verInfo.version;
    } catch (e) {
      logger.warn(sessionId, 'Could not fetch latest WA version, using default fallback.');
    }

    const sock = makeWASocket({
      auth: {
        creds: authState.creds,
        keys: makeCacheableSignalKeyStore(authState.keys, logger as any)
      },
      printQRInTerminal: !opts.usePairingCode,
      version,
      browser: Browsers.macOS('Desktop')
    });

    state.sock = sock;

    // Handle Pairing Code Authentication
    if (opts.usePairingCode && opts.phoneNumber && !sock.authState.creds.registered) {
      setTimeout(async () => {
        try {
          const cleanPhone = opts.phoneNumber!.replace(/[^0-9]/g, '');
          const code = await sock.requestPairingCode(cleanPhone);
          liveStatus.set(sessionId, { status: 'qr', code });
          broadcastEvent('pairing_code', { session: sessionId, code });
          logger.info(sessionId, `Pairing code generated: ${code}`);
        } catch (err: any) {
          logger.error(sessionId, 'Failed to request pairing code', err);
        }
      }, 3000);
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr && !state.usePairingCode) {
        liveStatus.set(sessionId, { status: 'qr', qr });
        broadcastEvent('qr', { session: sessionId, qr });
        logger.info(sessionId, 'New QR Code generated.');
        await prisma.session.upsert({
          where: { id: sessionId },
          create: { id: sessionId, status: 'qr' },
          update: { status: 'qr' }
        });
      }

      if (connection === 'connecting') {
        liveStatus.set(sessionId, { status: 'connecting' });
        broadcastEvent('status', { session: sessionId, status: 'connecting' });
        await prisma.session.upsert({
          where: { id: sessionId },
          create: { id: sessionId, status: 'connecting' },
          update: { status: 'connecting' }
        });
      } else if (connection === 'open') {
        state.reconnectAttempts = 0;
        const phone = sock.user?.id.split(':')[0];
        const name = sock.user?.name || 'WhatsApp Account';

        liveStatus.set(sessionId, { status: 'connected', phone, name });
        logger.info(sessionId, 'WhatsApp connection is live!', { phone, name });
        broadcastEvent('status', { session: sessionId, status: 'connected', phone, name });

        await prisma.session.upsert({
          where: { id: sessionId },
          create: { id: sessionId, status: 'connected', phone, name },
          update: { status: 'connected', phone, name }
        });

        // Subscribe to active supervision targets
        try {
          const activeTargets = await prisma.supervisionTarget.findMany({
            where: { sessionId, isActive: true }
          });
          for (const target of activeTargets) {
            await (sock as any).subscribePresence(target.jid + '@s.whatsapp.net');
            logger.info(sessionId, `Subscribed presence for target: ${target.name} (${target.jid})`);
          }
        } catch (e) {
          logger.error(sessionId, 'Error subscribing to supervision presence targets', e);
        }
      } else if (connection === 'close') {
        state.sock = null;
        if (state.isClosedManually) {
          state.isClosedManually = false;
          state.connecting = false;
          liveStatus.set(sessionId, { status: 'disconnected' });
          broadcastEvent('status', { session: sessionId, status: 'disconnected' });
          await prisma.session.update({ where: { id: sessionId }, data: { status: 'disconnected' } });
          return;
        }

        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        logger.warn(sessionId, `Socket connection closed with code: ${statusCode}`);

        // Handle logged out or bad session
        if (
          statusCode === DisconnectReason.loggedOut ||
          statusCode === 405 ||
          statusCode === DisconnectReason.badSession
        ) {
          logger.error(sessionId, 'Credentials invalid or logged out. Cleaning session files.');
          await cleanSession(sessionId);
          return;
        }

        state.reconnectAttempts++;
        if (state.reconnectAttempts > MAX_RECONNECTS) {
          logger.error(sessionId, 'Exceeded max reconnect limits. Giving up.');
          state.connecting = false;
          broadcastEvent('status', { session: sessionId, status: 'disconnected' });
          await prisma.session.update({ where: { id: sessionId }, data: { status: 'disconnected' } });
          return;
        }

        const backoffDelay = Math.min(1000 * 2 ** state.reconnectAttempts, 30000);
        broadcastEvent('status', { session: sessionId, status: 'reconnecting', attempt: state.reconnectAttempts, delay: backoffDelay });
        state.connecting = false;
        setTimeout(() => startBot({ sessionId }).catch(() => {}), backoffDelay);
      }
    });

    sock.ev.on('presence.update', async (update: any) => {
      try {
        const id = update.id;
        const cleanJid = id.split('@')[0];
        const presence = update.presences?.[id] || Object.values(update.presences || {})[0];
        if (!presence) return;
        const status = presence.lastKnownPresence; // "available" | "unavailable" | "composing" etc.
        
        // Find if this target is registered in our supervision list
        const target = await prisma.supervisionTarget.findFirst({
          where: { jid: cleanJid, sessionId, isActive: true }
        });
        
        if (target) {
          if (status === 'available') {
            // User came online: verify if there is an unclosed session (shouldn't be, but close it if so)
            const openLog = await prisma.supervisionLog.findFirst({
              where: { targetJid: cleanJid, endedAt: null },
              orderBy: { startedAt: 'desc' }
            });
            if (!openLog) {
              await prisma.supervisionLog.create({
                data: {
                  targetJid: cleanJid,
                  startedAt: new Date()
                }
              });
              broadcastEvent('presence_update', { session: sessionId, jid: cleanJid, status: 'online' });
            }
          } else if (status === 'unavailable') {
            // User went offline: close the session
            const openLog = await prisma.supervisionLog.findFirst({
              where: { targetJid: cleanJid, endedAt: null },
              orderBy: { startedAt: 'desc' }
            });
            if (openLog) {
              const now = new Date();
              const duration = Math.max(0, Math.floor((now.getTime() - openLog.startedAt.getTime()) / 1000));
              await prisma.supervisionLog.update({
                where: { id: openLog.id },
                data: {
                  endedAt: now,
                  duration
                }
              });
              broadcastEvent('presence_update', { session: sessionId, jid: cleanJid, status: 'offline', duration });
            }
          }
        }
      } catch (err) {
        console.error('Error handling presence update:', err);
      }
    });

    // Message Engine & Auto-Replies
    sock.ev.on('messages.upsert', async (chat) => {
      const msg = chat.messages[0];
      if (!msg.message) return;

      const senderJid = msg.key.remoteJid || '';

      // Handle Revoke (Anti-Delete) Protocol Messages
      if (msg.message.protocolMessage && ((msg.message.protocolMessage.type as any) === 3 || (msg.message.protocolMessage.type as any) === 'REVOKE')) {
        const deletedKey = msg.message.protocolMessage.key;
        if (deletedKey && deletedKey.id) {
          const cached = await prisma.messageCache.findUnique({ where: { id: deletedKey.id } });
          if (cached) {
            let cloudinaryUrl: string | null = null;
            let cloudinaryPublicId: string | null = null;

            if (cached.mediaType === 'image' && cached.tempPath && fs.existsSync(cached.tempPath)) {
              // Upload to Cloudinary since it was deleted
              const uploadRes = await uploadToCloudinary(cached.tempPath);
              if (uploadRes) {
                cloudinaryUrl = uploadRes.secure_url;
                cloudinaryPublicId = uploadRes.public_id;
              }
              // Remove local temp file
              try { fs.unlinkSync(cached.tempPath); } catch (e) {}
            }

            await prisma.deletedMessage.create({
              data: {
                sessionId,
                messageId: cached.id,
                senderJid: cached.senderJid,
                senderName: cached.senderName,
                text: cached.text,
                mediaType: cached.mediaType,
                cloudinaryUrl,
                cloudinaryPublicId
              }
            });

            broadcastEvent('message_deleted', {
              session: sessionId,
              messageId: cached.id,
              senderJid: cached.senderJid,
              senderName: cached.senderName,
              text: cached.text,
              mediaType: cached.mediaType,
              cloudinaryUrl
            });
          }
        }
        return;
      }

      if (msg.key.fromMe) return;

      const text = msg.message.conversation || msg.message.extendedTextMessage?.text || msg.message.imageMessage?.caption || '';

      // Cache the incoming message for potential delete retrieval
      try {
        let mediaType: string | null = null;
        let tempPath: string | null = null;

        if (msg.message.imageMessage) {
          mediaType = 'image';
          tempPath = await cacheMediaMessage(msg.key.id!, msg.message.imageMessage, 'image');
        }

        await prisma.messageCache.upsert({
          where: { id: msg.key.id! },
          create: {
            id: msg.key.id!,
            sessionId,
            senderJid: senderJid.split('@')[0],
            senderName: msg.pushName || null,
            text: text || null,
            mediaType,
            tempPath
          },
          update: {}
        });
      } catch (err) {
        console.error('Error caching message:', err);
      }

      broadcastEvent('message_received', { session: sessionId, sender: senderJid, text });

      // Trigger Workflow Engine for incoming WhatsApp message
      triggerWorkflows('whatsapp_message', { sender: senderJid, text, msgKey: msg.key }, sessionId);
      const rules = await prisma.autoReply.findMany({ where: { sessionId, isActive: true } });
      const lowerText = text.trim().toLowerCase();
      const tokens = lowerText.split(/\s+/);
      const isStartTrigger = lowerText === '@start-ana' || lowerText === 'ana' || lowerText === 'start' || lowerText === 'startana' ||
                            tokens.includes('@start-ana') || tokens.includes('ana') || tokens.includes('start') || tokens.includes('startana');

      for (const rule of rules) {
        let matched = false;

        // Apply personality tone formatting if specified
        let replyContent = rule.replyText;
        if (rule.personality === 'professional') {
          replyContent = `[Ana Bot - Official]\n${replyContent}`;
        } else if (rule.personality === 'assistant') {
          replyContent = `🤖 Ana Assistant: ${replyContent}\n\nType 'help' for options.`;
        } else if (rule.personality === 'funny') {
          replyContent = `🤪 ${replyContent} (beep boop!)`;
        }

        if (rule.type === 'start-ana') {
          if (isStartTrigger) {
            matched = true;
          }
        } else if (rule.type === 'command' && rule.keyword) {
          const cmd = rule.keyword.trim().toLowerCase();
          const prefixCmd = cmd.startsWith('/') || cmd.startsWith('!') || cmd.startsWith('.') ? cmd : `/${cmd}`;
          if (lowerText === cmd || lowerText === prefixCmd || tokens[0] === cmd || tokens[0] === prefixCmd) {
            matched = true;
          }
        } else if (rule.type === 'keyword' && rule.keyword) {
          const kw = rule.keyword.toLowerCase();
          const matchType = (rule as any).matchType || 'contains';
          if (matchType === 'exact') {
            matched = lowerText === kw;
          } else if (matchType === 'starts_with') {
            matched = lowerText.startsWith(kw);
          } else {
            matched = lowerText.includes(kw);
          }
        }

        if (matched) {
          const userMention = `@${senderJid.split('@')[0]}`;
          let formattedReply = replyContent.replace(/{user}/g, userMention);

          if ((rule as any).useAi || rule.type === 'ai') {
            const aiPrompt = text.replace(/@start-ana|ana|startana|start/gi, '').trim() || text;
            const aiGenerated = await generateAiResponse(aiPrompt, rule.personality, (rule as any).customTone, senderJid, sessionId);
            formattedReply = `${userMention} ${aiGenerated}`;
          }

          // Anti-Ban Protection: Simulate human typing indicator before replying
          try {
            await sock.sendPresenceUpdate('composing', senderJid);
            await new Promise(r => setTimeout(r, Math.floor(Math.random() * 2000) + 1500));
            await sock.sendPresenceUpdate('paused', senderJid);
          } catch (e) {}

          await sock.sendMessage(senderJid, { text: formattedReply, mentions: [senderJid] });
          logger.info(sessionId, `Auto reply rule matched (${rule.type}, AI: ${!!(rule as any).useAi}). Reply sent to ${senderJid}.`);
        }
      }

      // Default Built-in AI trigger fallback if no user rule configured for start-ana
      if (isStartTrigger) {
        const hasCustomStartRule = rules.some(r => r.type === 'start-ana' || r.type === 'ai');
        if (!hasCustomStartRule) {
          const cleanPrompt = text.replace(/@start-ana|ana|startana|start/gi, '').trim();
          let defaultReply = "";
          if (cleanPrompt) {
            const aiResponseText = await generateAiResponse(cleanPrompt, 'friendly', null, senderJid, sessionId);
            defaultReply = `@${senderJid.split('@')[0]} ${aiResponseText}`;
          } else {
            defaultReply = `Hello @${senderJid.split('@')[0]}! 👋 I am Ana, your AI automated WhatsApp assistant.\nHow can I help you today? Ask me anything!`;
          }

          try {
            await sock.sendPresenceUpdate('composing', senderJid);
            await new Promise(r => setTimeout(r, 1500));
            await sock.sendPresenceUpdate('paused', senderJid);
          } catch (e) {}
          await sock.sendMessage(senderJid, { text: defaultReply, mentions: [senderJid] });
          logger.info(sessionId, `Default start-ana AI auto reply triggered for ${senderJid}.`);
        }
      }
    });

    // Auto-boot Welcome reply on new member joins
    sock.ev.on('group-participants.update', async (update) => {
      if (update.action === 'add') {
        const rules = await prisma.autoReply.findMany({ where: { sessionId, type: 'welcome', isActive: true } });
        for (const rule of rules) {
          for (const newParticipant of update.participants) {
            await sock.sendMessage(update.id, { text: rule.replyText.replace('{user}', `@${newParticipant.split('@')[0]}`), mentions: [newParticipant] });
            logger.info(sessionId, `Welcome auto reply sent to newly joined user ${newParticipant}`);
          }
        }
      }
    });

    state.connecting = false;
  } catch (err: any) {
    state.connecting = false;
    logger.error(sessionId, 'Failed to boot WhatsApp instance', err);
  }
}

export async function cleanSession(sessionId: string) {
  const state = getSessionState(sessionId);
  if (state.sock) {
    state.isClosedManually = true;
    try {
      state.sock.end();
    } catch (e) {}
    state.sock = null;
  }

  // Windows lock safety
  await new Promise(r => setTimeout(r, 1500));

  sessions.delete(sessionId);
  const sessionDir = path.resolve('sessions', sessionId);
  if (fs.existsSync(sessionDir)) {
    try {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    } catch (e) {}
  }

  broadcastEvent('status', { session: sessionId, status: 'disconnected' });
  await prisma.session.upsert({
    where: { id: sessionId },
    create: { id: sessionId, status: 'disconnected' },
    update: { status: 'disconnected' }
  });

  if (sessionId === 'default') {
    await startBot({ sessionId: 'default' });
  }
}

export async function cleanAllSessions() {
  for (const [id, state] of sessions.entries()) {
    if (state.sock) {
      state.isClosedManually = true;
      try {
        state.sock.end();
      } catch (e) {}
    }
  }
  sessions.clear();

  await new Promise(r => setTimeout(r, 1500));

  const sessionsDir = path.resolve('sessions');
  if (fs.existsSync(sessionsDir)) {
    try {
      fs.rmSync(sessionsDir, { recursive: true, force: true });
    } catch (e) {}
  }
  fs.mkdirSync(sessionsDir, { recursive: true });

  await prisma.session.deleteMany();
  await startBot({ sessionId: 'default' });
}

export function getSocket(sessionId: string) {
  return getSessionState(sessionId).sock;
}
