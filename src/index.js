import { config } from './config/index.js';
import { logger } from './utils/logger.js';
import { initDatabase, closeDatabase } from './database/index.js';
import { startAllBots } from './services/bot.js';
import { onStatusChange, STATUS } from './utils/status.js';
import { startDashboard } from './services/dashboard.js';
import { startScheduler, stopScheduler } from './services/scheduler.js';

/**
 * Application entry point.
 *
 * Boot sequence:
 *  1. Initialize SQLite (creates schema if needed).
 *  2. Start the web dashboard (serves UI & WebSocket).
 *  3. Start the WhatsApp bots (loads session, shows QR if required).
 *  4. Wire graceful shutdown for SIGINT / SIGTERM.
 *
 * Everything below is intentionally side-effect driven; this is a long-running
 * daemon, so there is no "result" to return.
 */
async function main() {
  logger.info('starting WhatsApp SBTE bot system');

  initDatabase();
  startDashboard();
  startScheduler();

  // Pretty status line in the terminal whenever the connection state changes.
  onStatusChange((sessionId, status, previous, extra) => {
    const prefix = `[status:${sessionId}]`;
    switch (status) {
      case STATUS.CONNECTING:
        console.log(`${prefix} Connecting to WhatsApp...`);
        break;
      case STATUS.QR:
        console.log(`${prefix} QR code generated — scan to log in`);
        break;
      case STATUS.CONNECTED:
        console.log(`${prefix} Connected and ready.`);
        break;
      case STATUS.DISCONNECTED:
        console.log(`${prefix} Disconnected${extra?.statusCode ? ` (code ${extra.statusCode})` : ''}.`);
        break;
      case STATUS.RECONNECTING:
        console.log(`${prefix} Reconnecting (attempt ${extra?.attempt ?? '?'})...`);
        break;
    }
  });

  await startAllBots();

  // Graceful shutdown — close the DB and exit promptly.
  const shutdown = async (signal) => {
    logger.info({ signal }, 'shutting down');
    stopScheduler();
    closeDatabase();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'fatal startup error');
  stopScheduler();
  closeDatabase();
  process.exit(1);
});
