/**
 * Environment-aware test data (skill: test-data-management).
 *   test-data/<web|mobile|api>/<TEST_ENV>/<file>.json   (optional shared fallback: test-data/<platform>/common/)
 *
 *   const user = dataFor<User>('web', 'users.json', 'validUser');   // by meaningful key, never raw values in code
 *   const email = uniqueEmail(dataFor<string>('web', 'settings.json', 'emailDomain'));
 *
 * Missing data is a BLOCKED condition (never invent data): the error names the file and key.
 */
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { paths, TEST_ENV } from '../support/config';

export type DataPlatform = 'web' | 'mobile' | 'api';

function resolve(platform: DataPlatform, file: string): string {
  const env = process.env.TEST_ENV?.trim() || TEST_ENV;
  const candidates = [path.join(paths.testData, platform, env, file), path.join(paths.testData, platform, 'common', file)];
  const found = candidates.find((f) => fs.existsSync(f));
  if (!found) {
    throw new Error(
      `BLOCKED: test data file not found: ${path.relative(paths.root, candidates[0])} (or .../common/${file}). ` +
        'Ask the user for the data — do not invent it.',
    );
  }
  return found;
}

/** Whole data file for the current environment. */
export function loadTestData<T = unknown>(platform: DataPlatform, file: string): T {
  return JSON.parse(fs.readFileSync(resolve(platform, file), 'utf8')) as T;
}

/** One record by key, e.g. dataFor('web', 'users.json', 'validUser'). */
export function dataFor<T = unknown>(platform: DataPlatform, file: string, key: string): T {
  const data = loadTestData<Record<string, T>>(platform, file);
  if (!(key in data)) {
    throw new Error(`BLOCKED: test data key "${key}" not found in ${path.relative(paths.root, resolve(platform, file))}. Ask the user for the data.`);
  }
  return data[key];
}

/** Unique value for records a test creates (avoids collisions between runs). */
export function uniqueId(prefix = 'auto'): string {
  return `${prefix}_${Date.now()}_${randomUUID().slice(0, 8)}`;
}

/** Unique e-mail address; the domain must come from test data or the user — it is never assumed. */
export function uniqueEmail(domain: string, prefix = 'qa'): string {
  if (!domain) throw new Error('uniqueEmail needs a domain from test data (e.g. settings.json -> emailDomain)');
  return `${uniqueId(prefix).toLowerCase()}@${domain}`;
}
