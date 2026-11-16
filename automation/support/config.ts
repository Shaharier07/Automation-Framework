/**
 * Central configuration: loads .env once, exposes typed readers and project paths.
 */
import path from 'path';
import dotenv from 'dotenv';

export const ROOT = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT, '.env'), quiet: true });

/**
 * TEST_ENV selects the environment (skill: secrets-and-env-handling). Every variable can be overridden per
 * environment with a suffix: BASE_URL_STAGING > BASE_URL when TEST_ENV=staging.
 */
export const TEST_ENV = (process.env.TEST_ENV ?? 'local').trim() || 'local';

const lookup = (key: string): string | undefined => {
  const scoped = key === 'TEST_ENV' ? undefined : process.env[`${key}_${TEST_ENV.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`];
  const v = scoped !== undefined && scoped.trim() !== '' ? scoped : process.env[key];
  return v === undefined ? undefined : v.trim();
};

export const env = {
  str(key: string, fallback = ''): string {
    const v = lookup(key);
    return v === undefined || v === '' ? fallback : v;
  },
  /** Fails fast naming the missing variable — never guess a value. */
  required(key: string, purpose: string): string {
    const v = lookup(key);
    if (!v) {
      throw new Error(
        `BLOCKED: Missing required variable ${key} (or ${key}_${TEST_ENV.toUpperCase()}) in .env — needed for ${purpose}. ` +
          'Ask the user for the value; see .env.example.',
      );
    }
    return v;
  },
  bool(key: string, fallback = false): boolean {
    return ['true', '1', 'yes'].includes(env.str(key, String(fallback)).toLowerCase());
  },
  num(key: string, fallback: number): number {
    const n = Number(env.str(key, String(fallback)));
    return Number.isFinite(n) ? n : fallback;
  },
};

export type ExecutionType = 'web' | 'mobile' | 'api';
export const EXECUTION_TYPES: ExecutionType[] = ['web', 'mobile', 'api'];

export const paths = {
  root: ROOT,
  source: path.join(ROOT, 'source'),
  reports: path.join(ROOT, 'reports'),
  /** Isolated re-runs (AUTOMATION_RERUN=1) write to allure-results-rerun so the original run's results stay intact. */
  allureResults: (type: ExecutionType) =>
    path.join(ROOT, 'reports', process.env.AUTOMATION_RERUN === '1' ? 'allure-results-rerun' : 'allure-results', type),
  allureReport: (name: ExecutionType | 'all') => path.join(ROOT, 'reports', 'allure-report', name),
  excelOutput: path.join(ROOT, 'reports', 'excel'),
  screenshots: path.join(ROOT, 'screenshots'),
  testData: path.join(ROOT, 'test-data'),
  lastRun: path.join(ROOT, 'reports', 'last-run.json'),
};

export const settings = {
  defaultTimeoutMs: env.num('DEFAULT_TIMEOUT_MS', 60000),
  logLevel: env.str('LOG_LEVEL', 'info'),
};
