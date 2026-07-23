import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config/index.js';
import { logDb } from '../utils/logger.js';

let db = null;

/**
 * Opens (or creates) the SQLite database and ensures the schema exists.
 * Called once at startup; the single connection is reused for the app lifetime.
 *
 * better-sqlite3 is synchronous and fast — no promise plumbing needed.
 */
export function initDatabase() {
  fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

  db = new Database(config.dbPath, { fileMustExist: false });
  // WAL mode gives better concurrency for the mix of reads/writes we do.
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  createSchema();
  logDb.info({ path: config.dbPath }, 'sqlite database initialized');
  return db;
}

/**
 * Returns the shared database handle.
 * Throws if initDatabase() hasn't been called yet — fail fast on misuse.
 */
export function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

/** Closes the database cleanly on shutdown. */
export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    logDb.info('database closed');
  }
}

/**
 * Creates the join_requests table if it doesn't exist.
 *
 * Fields:
 *  id           - auto-increment primary key
 *  jid          - WhatsApp JID of the requester (e.g. 91xxx@s.whatsapp.net)
 *  name         - submitted name
 *  college      - submitted college
 *  branch       - submitted branch
 *  semester     - submitted semester
 *  group_id     - the group the request was for (e.g. <id>@g.us)
 *  request_time - ISO timestamp of the original join request
 *  status       - Pending | Approved | Rejected
 *
 * We also track the conversation stage so we know which field to collect next
 * when the user replies with their details.
 */
function createSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS join_requests (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      jid           TEXT    NOT NULL,
      name          TEXT,
      college       TEXT,
      branch        TEXT,
      semester      TEXT,
      group_id      TEXT    NOT NULL,
      request_time  TEXT    NOT NULL,
      status        TEXT    NOT NULL DEFAULT 'Pending',
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      session_id    TEXT    NOT NULL DEFAULT 'default'
    );

    -- Speed up lookups by requester and by group.
    CREATE INDEX IF NOT EXISTS idx_join_requests_jid      ON join_requests(jid);
    CREATE INDEX IF NOT EXISTS idx_join_requests_group    ON join_requests(group_id);
    CREATE INDEX IF NOT EXISTS idx_join_requests_status   ON join_requests(status);

    -- Tracks which field we are waiting for from a given user, so the
    -- message handler can collect Name -> College -> Branch -> Semester
    -- across multiple messages.
    CREATE TABLE IF NOT EXISTS pending_replies (
      jid           TEXT PRIMARY KEY,
      request_id    INTEGER NOT NULL,
      next_field    TEXT    NOT NULL,
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      session_id    TEXT    NOT NULL DEFAULT 'default',
      FOREIGN KEY (request_id) REFERENCES join_requests(id) ON DELETE CASCADE
    );

    -- For scheduling messages to groups or private chats
    CREATE TABLE IF NOT EXISTS scheduled_messages (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient      TEXT    NOT NULL,
      message        TEXT    NOT NULL,
      scheduled_time TEXT    NOT NULL,
      status         TEXT    NOT NULL DEFAULT 'Pending',
      created_at     TEXT    NOT NULL DEFAULT (datetime('now')),
      session_id     TEXT    NOT NULL DEFAULT 'default'
    );

    CREATE INDEX IF NOT EXISTS idx_scheduled_messages_status ON scheduled_messages(status);
  `);

  // Migrate tables that might exist without session_id
  const tables = ['join_requests', 'pending_replies', 'scheduled_messages'];
  for (const table of tables) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.some(col => col.name === 'session_id')) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN session_id TEXT NOT NULL DEFAULT 'default'`);
    }
  }
}

/* -------------------------------------------------------------------------- */
/* join_requests CRUD                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Inserts a new join request (status Pending) and returns the row id.
 * Called when a group.join-request event fires.
 */
export function createJoinRequest({ jid, groupId, requestTime, sessionId = 'default' }) {
  const stmt = getDb().prepare(`
    INSERT INTO join_requests (jid, group_id, request_time, status, session_id)
    VALUES (?, ?, ?, 'Pending', ?)
  `);
  const info = stmt.run(jid, groupId, requestTime, sessionId);
  return info.lastInsertRowid;
}

/** Fetch a single join request by id. */
export function getJoinRequest(id) {
  return getDb().prepare('SELECT * FROM join_requests WHERE id = ?').get(id);
}

/** Update one of the detail fields (name/college/branch/semester). */
export function updateJoinRequestField(id, field, value) {
  const allowed = new Set(['name', 'college', 'branch', 'semester', 'status']);
  if (!allowed.has(field)) throw new Error(`Invalid field: ${field}`);
  const stmt = getDb().prepare(`
    UPDATE join_requests
       SET ${field} = ?, updated_at = datetime('now')
     WHERE id = ?
  `);
  return stmt.run(value, id);
}

/** List all requests, newest first (used by an admin command / future dashboard). */
export function listJoinRequests({ status, sessionId = 'default' } = {}) {
  if (status) {
    return getDb().prepare('SELECT * FROM join_requests WHERE status = ? AND session_id = ? ORDER BY id DESC').all(status, sessionId);
  }
  return getDb().prepare('SELECT * FROM join_requests WHERE session_id = ? ORDER BY id DESC').all(sessionId);
}

/* -------------------------------------------------------------------------- */
/* pending_replies (conversation state)                                       */
/* -------------------------------------------------------------------------- */

/**
 * Marks that we are waiting for a specific field from a user.
 * `nextField` is one of: name, college, branch, semester
 */
export function setPendingReply(jid, requestId, nextField, sessionId = 'default') {
  getDb().prepare(`
    INSERT INTO pending_replies (jid, request_id, next_field, session_id, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(jid) DO UPDATE SET
      request_id = excluded.request_id,
      next_field = excluded.next_field,
      session_id = excluded.session_id,
      updated_at = datetime('now')
  `).run(jid, requestId, nextField, sessionId);
}

/** Returns the pending reply state for a user, or undefined if none. */
export function getPendingReply(jid, sessionId = 'default') {
  return getDb().prepare('SELECT * FROM pending_replies WHERE jid = ? AND session_id = ?').get(jid, sessionId);
}

/** Clears the pending state once we've collected all fields. */
export function clearPendingReply(jid, sessionId = 'default') {
  getDb().prepare('DELETE FROM pending_replies WHERE jid = ? AND session_id = ?').run(jid, sessionId);
}

/* -------------------------------------------------------------------------- */
/* scheduled_messages CRUD                                                    */
/* -------------------------------------------------------------------------- */

export function createScheduledMessage({ recipient, message, scheduledTime, sessionId = 'default' }) {
  const stmt = getDb().prepare(`
    INSERT INTO scheduled_messages (recipient, message, scheduled_time, status, session_id)
    VALUES (?, ?, ?, 'Pending', ?)
  `);
  const info = stmt.run(recipient, message, scheduledTime, sessionId);
  return info.lastInsertRowid;
}

export function listScheduledMessages(sessionId = 'default') {
  return getDb().prepare('SELECT * FROM scheduled_messages WHERE session_id = ? ORDER BY id DESC').all(sessionId);
}

export function listPendingScheduledMessagesBefore(isoTime) {
  return getDb().prepare(`
    SELECT * FROM scheduled_messages 
     WHERE status = 'Pending' AND scheduled_time <= ?
  `).all(isoTime);
}

export function updateScheduledMessageStatus(id, status) {
  return getDb().prepare(`
    UPDATE scheduled_messages 
       SET status = ? 
     WHERE id = ?
  `).run(status, id);
}

export function deleteScheduledMessage(id) {
  return getDb().prepare('DELETE FROM scheduled_messages WHERE id = ?').run(id);
}
