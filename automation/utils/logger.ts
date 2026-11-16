/** Minimal levelled logger (LOG_LEVEL=debug|info|warn|error). */
import { settings } from '../support/config';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
type Level = keyof typeof LEVELS;
const threshold = LEVELS[(settings.logLevel as Level)] ?? LEVELS.info;

const write = (level: Level) => (...args: unknown[]) => {
  if (LEVELS[level] < threshold) return;
  const out = level === 'warn' || level === 'error' ? console.error : console.log;
  out(`[${new Date().toISOString()}] [${level.toUpperCase()}]`, ...args);
};

export const logger = { debug: write('debug'), info: write('info'), warn: write('warn'), error: write('error') };
