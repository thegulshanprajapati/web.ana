import pino from 'pino';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config/index.js';

// Ensure the logs directory exists before pino tries to write to it.
fs.mkdirSync(config.dirs.logs, { recursive: true });

/**
 * Application-wide logger built on pino.
 *
 * - Pretty, colorized output to the terminal for human-friendly dev logs.
 * - Structured JSON to a rotating daily file for production auditing.
 *
 * Levels: trace < debug < info < warn < error < fatal
 * Controlled by LOG_LEVEL in .env.
 */
export const logListeners = [];
const broadcastStream = {
  write(chunk) {
    const logStr = chunk.toString();
    for (const listener of logListeners) {
      try { listener(logStr); } catch (e) {}
    }
  }
};

export const logger = pino(
  {
    level: config.logLevel,
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.multistream([
    {
      level: 'warn', // Keep terminal clean: only warnings and errors are logged here
      stream: pino.transport({
        target: 'pino-pretty',
        options: {
          colorize: true,
          ignore: 'pid,hostname',
          translateTime: 'SYS:standard',
          singleLine: false,
        },
      }),
    },
    {
      level: config.logLevel,
      stream: fs.createWriteStream(
        path.resolve(config.dirs.logs, `bot-${new Date().toISOString().slice(0, 10)}.log`),
        { flags: 'a' },
      ),
    },
    {
      level: config.logLevel,
      stream: broadcastStream
    }
  ]),
);

/**
 * Convenience child loggers for each subsystem.
 * Using child loggers attaches a `module` field to every log line, making it
 * trivial to filter logs by component during debugging.
 */
export const logAuth = logger.child({ module: 'auth' });
export const logDb = logger.child({ module: 'db' });
export const logEvents = logger.child({ module: 'events' });
export const logHandlers = logger.child({ module: 'handlers' });
export const logBot = logger.child({ module: 'bot' });
