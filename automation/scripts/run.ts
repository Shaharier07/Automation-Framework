#!/usr/bin/env tsx
/**
 * Execution entry point.
 *
 *   tsx scripts/run.ts <web|mobile|api|regression> [--tags "<expr>"] [--env <karate env>] [--rerun] [extra cucumber args]
 *
 * --rerun  isolated re-run for the result-verifier: results go to reports/allure-results-rerun/<type>,
 *          the original run's results, evidence and last-run.json are left untouched.
 *
 * - Cleans the Allure results of the executed type(s) so each run is self-contained
 * - Runs Cucumber (web/mobile) or Karate via Maven (api)
 * - Writes Allure environment info + reports/last-run.json (used by "Excel update --latest")
 * - Prints an execution summary; exits non-zero when anything failed
 *
 * Excel is NEVER updated here — only via `npm run excel:update*`.
 */
import fs from 'fs';
import path from 'path';
import { env, paths, EXECUTION_TYPES, TEST_ENV, type ExecutionType } from '../support/config';
import { readResults, countByStatus, enrichTagLabels } from '../utils/allure-results';
import { bin, cleanDir, listFiles, parseArgs, run, timestamp } from './lib';
import { buildSummary, HISTORY_DIR, type HistoryRun } from './execution-summary';

type Target = ExecutionType | 'regression';

const featureDirs: Record<ExecutionType, string> = {
  web: path.join(paths.root, 'features', 'web'),
  mobile: path.join(paths.root, 'features', 'mobile'),
  api: path.join(paths.root, 'features', 'api'),
};

/** Cucumber tag expression -> Karate tags ("a and not b" -> "a;~b", "a or b" -> "a,b"). */
function toKarateTags(expr: string): string {
  return expr
    .replace(/\bnot\s+@/g, '~@')
    .replace(/\s+and\s+/g, ';')
    .replace(/\s+or\s+/g, ',')
    .replace(/[()]/g, '')
    .trim();
}

/**
 * Suite rules (skill: tagging-and-suites): @manual never runs; regression excludes @wip and @quarantine;
 * platform/browser-specific scenarios only run on their platform/browser.
 */
function exclusions(type: ExecutionType, regression: boolean): string[] {
  const ex = ['@manual', ...(regression ? ['@wip', '@quarantine'] : [])];
  if (type === 'mobile') {
    const [mine, other] = env.str('PLATFORM', 'android').toLowerCase() === 'ios' ? ['@ios', '@android'] : ['@android', '@ios'];
    ex.push(`(${other} and not ${mine})`);
  }
  if (type === 'web') {
    const browser = `@${env.str('BROWSER', 'chromium').toLowerCase()}`;
    const others = ['@chromium', '@firefox', '@webkit'].filter((b) => b !== browser);
    ex.push(`((${others.join(' or ')}) and not ${browser})`);
  }
  return ex;
}

function cucumberTags(type: ExecutionType, user: string | undefined, regression: boolean): string {
  return [...(user ? [`(${user})`] : []), ...exclusions(type, regression).map((e) => `not ${e}`)].join(' and ');
}

/** Karate syntax: ';' = AND, ',' = OR, '~' = NOT (only simple user expressions are converted). */
function karateTags(user: string | undefined, regression: boolean): string {
  const ex = exclusions('api', regression).map((e) => `~${e}`);
  return [...(user ? [toKarateTags(user)] : []), ...ex].join(';');
}

function writeEnvironment(type: ExecutionType, karateEnv: string): void {
  const dir = paths.allureResults(type);
  const props: Record<string, string> = { Execution: type, Environment: process.env.TEST_ENV || TEST_ENV, Node: process.version, OS: `${process.platform} ${process.arch}` };
  if (type === 'web') Object.assign(props, { Browser: env.str('BROWSER', 'chromium'), Headless: env.str('HEADLESS', 'true'), BaseURL: env.str('BASE_URL', '(not set)') });
  if (type === 'mobile') Object.assign(props, { Platform: env.str('PLATFORM', 'android'), Appium: `${env.str('APPIUM_HOST', '127.0.0.1')}:${env.str('APPIUM_PORT', '4723')}` });
  if (type === 'api') Object.assign(props, { KarateEnv: karateEnv });
  fs.writeFileSync(path.join(dir, 'environment.properties'), Object.entries(props).map(([k, v]) => `${k}=${v}`).join('\n'));
  fs.writeFileSync(path.join(dir, 'executor.json'), JSON.stringify({ name: 'Local', type: 'local', buildName: `${type} @ ${new Date().toISOString()}` }));
}

function runType(type: ExecutionType, tags: string | undefined, karateEnv: string, extra: string[], regression = false): number | null {
  const features = listFiles(featureDirs[type], (f) => f.endsWith('.feature'));
  if (features.length === 0) {
    console.log(`\n[${type}] no feature files in features/${type}/ — skipped.`);
    return null;
  }

  console.log(`\n========== ${type.toUpperCase()} (${features.length} feature file(s)) ==========`);
  cleanDir(paths.allureResults(type));
  fs.mkdirSync(path.join(paths.reports, '.tmp'), { recursive: true });
  // evidence files are timestamped, so a re-run adds to them instead of wiping the original run's evidence
  if (type !== 'api' && !RERUN) ['raw', 'annotated'].forEach((d) => cleanDir(path.join(paths.screenshots, d, type)));

  let code: number;
  if (type === 'api') {
    const mvn = process.platform === 'win32' ? 'mvn.cmd' : 'mvn';
    code = run(mvn, [
      '-B', '--no-transfer-progress', '-f', path.join('api', 'pom.xml'), 'test',
      `-Dkarate.env=${karateEnv}`,
      `-Dkarate.tags=${karateTags(tags, regression)}`,
      `-Dkarate.threads=${env.num('API_THREADS', 1)}`,
      `-Dtc.id.prefixes=${env.str('TC_ID_PREFIXES', 'TC')}`,
      `-Dallure.results.dir=${paths.allureResults('api')}`,
      `-Dkarate.report.dir=${RERUN ? '../reports/karate-rerun' : '../reports/karate'}`,
      ...extra,
    ], { env: { ...process.env } });
  } else {
    code = run(bin('cucumber-js'), ['--profile', type, '--tags', cucumberTags(type, tags, regression), ...extra]);
    enrichTagLabels(type);
  }

  writeEnvironment(type, karateEnv);
  const c = countByStatus(readResults(type));
  console.log(`[${type}] total=${c.total} passed=${c.passed} failed=${c.failed} broken=${c.broken} skipped=${c.skipped} (exit ${code})`);
  return code;
}

let RERUN = false;

function main(): void {
  const [target, ...argv] = process.argv.slice(2) as [Target, ...string[]];
  if (!target || ![...EXECUTION_TYPES, 'regression'].includes(target)) {
    console.error('Usage: tsx scripts/run.ts <web|mobile|api|regression> [--tags "<expr>"] [--env <env>]');
    process.exit(2);
  }
  const { opts, rest } = parseArgs(argv, ['tags', 'env', 'rerun']);
  RERUN = Boolean(opts.rerun);
  if (RERUN) {
    if (target === 'regression') {
      console.error('--rerun is for single scenarios: use web|mobile|api with --tags "<TC ID tag>"');
      process.exit(2);
    }
    process.env.AUTOMATION_RERUN = '1'; // inherited by Cucumber/Maven child processes and by paths.allureResults()
    console.log('Isolated re-run: results -> reports/allure-results-rerun/ (original run untouched)');
  }
  const tags = typeof opts.tags === 'string' ? opts.tags : undefined;
  // one environment selector for everything (TEST_ENV); --env overrides it for this run
  if (typeof opts.env === 'string') process.env.TEST_ENV = opts.env;
  const karateEnv = process.env.TEST_ENV?.trim() || 'local';

  const types: ExecutionType[] = target === 'regression' ? EXECUTION_TYPES : [target];
  const startedAt = new Date().toISOString();
  const executed: Record<string, { exitCode: number; counts: ReturnType<typeof countByStatus> }> = {};

  for (const t of types) {
    const code = runType(t, tags, karateEnv, target === 'regression' ? [] : rest, target === 'regression');
    if (code !== null) executed[t] = { exitCode: code, counts: countByStatus(readResults(t)) };
  }

  if (Object.keys(executed).length > 0 && !RERUN) {
    // history snapshot for run-to-run comparison (skill: execution-summary)
    const snapshot: HistoryRun = {
      target,
      types: Object.keys(executed),
      environment: process.env.TEST_ENV?.trim() || 'local',
      platformInfo: {
        ...(executed.web && { browser: env.str('BROWSER', 'chromium') }),
        ...(executed.mobile && { platform: env.str('PLATFORM', 'android'), device: env.str(env.str('PLATFORM', 'android').toLowerCase() === 'ios' ? 'IOS_DEVICE_NAME' : 'ANDROID_DEVICE_NAME', '?') }),
        ...(executed.api && { karateEnv }),
      },
      startedAt,
      finishedAt: new Date().toISOString(),
      scenarios: Object.keys(executed).flatMap((t) => readResults(t as ExecutionType)).map((r) => ({
        type: r.type, ids: r.testCaseIds, name: r.name, status: r.status, message: r.message, tags: r.tags,
      })),
    };
    fs.mkdirSync(HISTORY_DIR, { recursive: true });
    fs.writeFileSync(path.join(HISTORY_DIR, `run_${timestamp()}.json`), JSON.stringify(snapshot, null, 2));
    fs.writeFileSync(paths.lastRun, JSON.stringify({ target, types: Object.keys(executed), startedAt, finishedAt: new Date().toISOString(), results: executed }, null, 2));
  }

  console.log('\n---------------- EXECUTION SUMMARY ----------------');
  for (const [t, r] of Object.entries(executed)) {
    const c = r.counts;
    const rate = c.total ? ((c.passed / c.total) * 100).toFixed(1) : '0.0';
    console.log(`${t.padEnd(7)} total ${String(c.total).padStart(4)} | pass ${c.passed} | fail ${c.failed + c.broken} | skipped ${c.skipped} | ${rate}%`);
  }
  if (Object.keys(executed).length === 0) console.log('Nothing executed (no feature files yet).');
  else if (!RERUN) console.log(`\n${buildSummary() ?? ''}`);
  if (RERUN) console.log('Re-run failures: npm run results:failures -- ' + target + ' --rerun');
  else console.log('Allure report: npm run report:' + (target === 'regression' ? 'all' : target));
  console.log('---------------------------------------------------\n');

  process.exit(Object.values(executed).some((r) => r.exitCode !== 0) ? 1 : 0);
}

main();
