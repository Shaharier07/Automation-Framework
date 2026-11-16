/**
 * Playwright (web) configuration, built from .env.
 */
import type { LaunchOptions, BrowserContextOptions } from 'playwright';
import { env } from '../support/config';

export const SUPPORTED_BROWSERS = ['chromium', 'firefox', 'webkit'] as const;
export type BrowserName = (typeof SUPPORTED_BROWSERS)[number];

export interface WebConfig {
  browser: BrowserName;
  launchOptions: LaunchOptions;
  contextOptions: BrowserContextOptions;
  recordVideo: boolean;
  trace: boolean;
  /** Default wait for actions and element conditions (skill: wait-and-sync-rules). */
  timeoutMs: number;
  navigationTimeoutMs: number;
}

export function getWebConfig(): WebConfig {
  const browser = env.str('BROWSER', 'chromium').toLowerCase() as BrowserName;
  if (!SUPPORTED_BROWSERS.includes(browser)) {
    throw new Error(`Unsupported BROWSER "${browser}". Use: ${SUPPORTED_BROWSERS.join(', ')}`);
  }
  return {
    browser,
    launchOptions: {
      headless: env.bool('HEADLESS', true),
      slowMo: env.num('SLOW_MO_MS', 0),
    },
    contextOptions: {
      baseURL: env.required('BASE_URL', 'web tests (the application URL)'),
      viewport: { width: env.num('VIEWPORT_WIDTH', 1366), height: env.num('VIEWPORT_HEIGHT', 768) },
      ignoreHTTPSErrors: env.bool('IGNORE_HTTPS_ERRORS', false),
    },
    recordVideo: env.bool('RECORD_VIDEO', false),
    trace: env.bool('TRACE', false),
    timeoutMs: env.num('WEB_TIMEOUT_MS', 10000),
    navigationTimeoutMs: env.num('WEB_NAVIGATION_TIMEOUT_MS', 30000),
  };
}
