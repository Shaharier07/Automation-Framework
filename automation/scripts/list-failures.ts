#!/usr/bin/env tsx
/**
 * Lists every non-passed scenario of the latest results with its evidence, for the result-verifier.
 *   tsx scripts/list-failures.ts [web|mobile|api|all|latest] [--rerun]   (default: latest)
 *   --rerun  read the isolated re-run results (reports/allure-results-rerun) instead
 * Output: printed table + reports/verification/failures_<timestamp>.json
 */
import fs from 'fs';
import path from 'path';
import { paths, EXECUTION_TYPES, type ExecutionType } from '../support/config';
import { readResults } from '../utils/allure-results';
import { listFiles, timestamp } from './lib';

const argv = process.argv.slice(2);
if (argv.includes('--rerun')) process.env.AUTOMATION_RERUN = '1';
const arg = argv.find((a) => !a.startsWith('--')) ?? 'latest';
let types: ExecutionType[];
if (arg === 'latest') {
  if (!fs.existsSync(paths.lastRun)) {
    console.log('No reports/last-run.json — run tests first.');
    process.exit(1);
  }
  types = JSON.parse(fs.readFileSync(paths.lastRun, 'utf8')).types;
} else types = arg === 'all' ? EXECUTION_TYPES : [arg as ExecutionType];

const shots = listFiles(path.join(paths.screenshots, 'annotated'), (f) => f.endsWith('.png'));
const failures = types.flatMap(readResults).filter((r) => r.status !== 'passed').map((r) => {
  const ids = r.testCaseIds.length ? r.testCaseIds : ['NO-ID'];
  return {
    type: r.type,
    testCaseIds: ids,
    feature: r.feature,
    scenario: r.name,
    status: r.status,
    failedStep: r.failedStep,
    message: r.message,
    durationS: +((r.stop - r.start) / 1000).toFixed(2),
    evidence: shots.filter((s) => ids.some((id) => path.basename(s).startsWith(id.replace(/[^A-Za-z0-9._-]+/g, '_') + '_'))).map((s) => path.relative(paths.root, s)),
  };
});

const dir = path.join(paths.reports, 'verification');
fs.mkdirSync(dir, { recursive: true });
const out = path.join(dir, `${process.env.AUTOMATION_RERUN === '1' ? 'rerun-failures' : 'failures'}_${timestamp()}.json`);
fs.writeFileSync(out, JSON.stringify({ types, generatedAt: new Date().toISOString(), failures }, null, 2));

if (failures.length === 0) console.log(`No failures in ${types.join(', ')}.`);
for (const f of failures) {
  console.log(`\n[${f.status.toUpperCase()}] ${f.testCaseIds.join(',')} — ${f.type}: ${f.feature} › ${f.scenario}`);
  if (f.failedStep) console.log(`  step:     ${f.failedStep}`);
  if (f.message) console.log(`  message:  ${f.message.split('\n')[0].slice(0, 200)}`);
  for (const e of f.evidence) console.log(`  evidence: ${e}`);
}
console.log(`\n${failures.length} non-passed scenario(s) -> ${path.relative(paths.root, out)}`);
