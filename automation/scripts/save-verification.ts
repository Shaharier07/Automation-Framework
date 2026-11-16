#!/usr/bin/env tsx
/**
 * Saves the result-verifier's classification and enforces the qa-workflow gate
 * "no failure left unclassified".
 *
 *   tsx scripts/save-verification.ts --input <verification.json> [--type web|mobile|api|latest]
 *
 * Input JSON: { "verifiedBy": "result-verifier (Claude)", "results": [
 *   { "tcId": "TC-WEB-012", "scenario": "...", "type": "web", "firstResult": "failed", "rerunResult": "failed",
 *     "category": "PRODUCT DEFECT",   // failure-classification skill "reason": "<facts>", "evidence": "screenshots/annotated/web/...png",
 *     "action": "Log defect (reports/bugs/BUG_TC-WEB-012_...md)" } ] }
 *
 * Output: reports/verification/verification_<timestamp>.json + .md (table)
 */
import fs from 'fs';
import path from 'path';
import { paths, EXECUTION_TYPES, type ExecutionType } from '../support/config';
import { readResults } from '../utils/allure-results';
import { norm } from '../utils/excel';
import { FAILURE_CATEGORIES, findCategory } from '../config/verification.config';
import { VERIFICATION_DIR, type VerificationFile } from '../utils/verification';
import { parseArgs, timestamp } from './lib';

const { opts } = parseArgs(process.argv.slice(2), ['input', 'type']);
if (typeof opts.input !== 'string') {
  console.error('Usage: tsx scripts/save-verification.ts --input <verification.json> [--type latest]');
  process.exit(2);
}
const input = JSON.parse(fs.readFileSync(path.resolve(opts.input), 'utf8')) as Omit<VerificationFile, 'generatedAt' | 'types'>;

const typeArg = typeof opts.type === 'string' ? opts.type : 'latest';
const types: ExecutionType[] = typeArg === 'latest'
  ? (fs.existsSync(paths.lastRun) ? JSON.parse(fs.readFileSync(paths.lastRun, 'utf8')).types : [])
  : typeArg === 'all' ? EXECUTION_TYPES : [typeArg as ExecutionType];

const errors: string[] = [];
if (!input.verifiedBy) errors.push('verifiedBy is required');
for (const [i, e] of (input.results ?? []).entries()) {
  const at = `results[${i}] (${e.tcId || 'no tcId'})`;
  for (const f of ['tcId', 'scenario', 'firstResult', 'rerunResult', 'category', 'reason', 'action'] as const) {
    if (!e[f] || !String(e[f]).trim()) errors.push(`${at}: ${f} is required`);
  }
  if (e.category && !findCategory(e.category)) errors.push(`${at}: unknown category "${e.category}" (use: ${FAILURE_CATEGORIES.map((c) => c.name).join(' | ')})`);
  if (/^pass/i.test(e.rerunResult ?? '') && e.category && findCategory(e.category)?.name !== 'FLAKY' && /^fail|^broken/i.test(e.firstResult ?? '')) {
    errors.push(`${at}: failed first, passed on re-run -> category must be FLAKY`);
  }
}

// Gate: every non-passed scenario of the executed run is classified
const classified = new Set((input.results ?? []).flatMap((e) => e.tcId.split(',').map((x) => norm(x.trim().replace(/^@(id=)?/i, '')))));
for (const r of types.flatMap(readResults).filter((x) => x.status !== 'passed')) {
  const ids = r.testCaseIds.length ? r.testCaseIds : ['NO-ID'];
  if (!ids.some((id) => classified.has(norm(id)))) errors.push(`unclassified failure: ${ids.join(',')} — ${r.type}: ${r.name} (${r.status})`);
}

if (errors.length) {
  console.error(`Verification rejected (${errors.length}):\n  - ${errors.join('\n  - ')}`);
  process.exit(1);
}

const stamp = timestamp();
const data: VerificationFile = { verifiedBy: input.verifiedBy, generatedAt: new Date().toISOString(), types, results: input.results };
fs.mkdirSync(VERIFICATION_DIR, { recursive: true });
fs.writeFileSync(path.join(VERIFICATION_DIR, `verification_${stamp}.json`), JSON.stringify(data, null, 2));

const esc = (s = '') => String(s).replace(/\|/g, '\\|').replace(/\n/g, '<br>');
const md = [
  `# Verification — ${types.join(', ') || 'n/a'}`,
  '',
  `Verified by ${data.verifiedBy}, ${data.generatedAt}`,
  '',
  '| TC ID | Scenario | First result | Re-run result | Category | Reason | Evidence | Recommended action |',
  '|---|---|---|---|---|---|---|---|',
  ...data.results.map((e) => `| ${esc(e.tcId)} | ${esc(e.scenario)} | ${esc(e.firstResult)} | ${esc(e.rerunResult)} | ${esc(e.category)} | ${esc(e.reason)} | ${esc(e.evidence)} | ${esc(e.action)} |`),
  '',
  '## Totals',
  ...FAILURE_CATEGORIES.map((c) => [c.name, data.results.filter((e) => findCategory(e.category)?.name === c.name).length] as const)
    .filter(([, n]) => n)
    .map(([c, n]) => `- ${c}: ${n}`),
  '',
].join('\n');
fs.writeFileSync(path.join(VERIFICATION_DIR, `verification_${stamp}.md`), md);
console.log(`Verification saved: reports/verification/verification_${stamp}.{json,md} — ${data.results.length} classified, none unclassified.`);
