import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load .env once at module import. Missing file is fine — we fall back to defaults.
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Project root = two levels up from src/config/
const ROOT_DIR = path.resolve(__dirname, '..', '..');

/**
 * Centralized, validated configuration.
 * Every value comes from the environment (or a safe default) — nothing is hardcoded.
 */
export const config = {
  rootDir: ROOT_DIR,

  // Unique session identifier. Enables multiple accounts later by switching this.
  sessionId: process.env.SESSION_ID || 'default',

  // Directory layout — kept in one place so paths stay consistent across modules.
  dirs: {
    sessions: path.resolve(ROOT_DIR, 'sessions'),
    logs: path.resolve(ROOT_DIR, 'logs'),
    database: path.resolve(ROOT_DIR, 'database'),
  },

  // SQLite database file location.
  dbPath: process.env.DB_PATH
    ? path.resolve(ROOT_DIR, process.env.DB_PATH)
    : path.resolve(ROOT_DIR, 'database', 'bot.db'),

  // Pino log level.
  logLevel: process.env.LOG_LEVEL || 'info',

  // Optional WhatsApp Web overrides (empty string => library default).
  waVersion: process.env.WA_VERSION || '',
  userAgent: process.env.USER_AGENT || '',
};

/**
 * Full path for a given account's auth state directory.
 * Used by the auth module so multiple accounts can coexist under sessions/.
 */
export function sessionDir(sessionId = config.sessionId) {
  return path.resolve(config.dirs.sessions, sessionId);
}
