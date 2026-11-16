#!/usr/bin/env tsx
/**
 * Decision-ready execution summary (skill: execution-summary). Runs automatically at the end of every test run
 * and on demand:  tsx scripts/execution-summary.ts
 *
 * Sources: reports/history/run_*.json (written by scripts/run.ts — current and previous run of the same suite),
 *          reports/verification/verification_*.json (failure categories, flaky), reports/allure-report/.
 * Output:  console + reports/summary/summary_<timestamp>.md
 */
import fs from 'fs';
import path from 'path';
import { paths } from '../support/config';
import { findCategory } from '../config/verification.config';
import { latestVerification, type VerificationEntry } from '../utils/verification';
import { norm } from '../utils/excel';
import { baseTestCaseId } from '../config/traceability.config';
import { timestamp } from './lib';

export interface HistoryScenario { type: string; ids: string[]; name: string; status: string; message: string; tags: string[] }
export interface HistoryRun {
  target: string;
  types: string[];
  environment: string;
  platformInfo: Record<string, string>;
  startedAt: string;
  finishedAt: string;
  scenarios: HistoryScenario[];
}

export const HISTORY_DIR = path.join(paths.reports, 'history');
const PRIORITY_RANK: Record<string, number> = { '@critical': 0, '@high': 1, '@medium': 2, '@low': 3 };
const CATEGORY_RANK: Record<string, number> = { 'PRODUCT DEFECT': 0, ENVIRONMENT: 1, 'TEST DATA': 2, 'SCRIPT DEFECT': 3, 'INVALID TEST CASE': 4, FLAKY: 5 };

type Outcome = 'passed' | 'failed' | 'blocked' | 'skipped';

function history(): HistoryRun[] {
  if (!fs.existsSync(HISTORY_DIR)) return [];
  return fs.readdirSync(HISTORY_DIR).filter((f) => /^run_\d{8}-\d{6}\.json$/.test(f)).sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(HISTORY_DIR, f), 'utf8')) as HistoryRun);
}

const key = (s: HistoryScenario) => `${s.type}|${s.ids.length ? s.ids.map((i) => norm(baseTestCaseId(i))).join(',') : s.name}`;
const label = (s: HistoryScenario) => {
  const id = s.ids.join(',') || 'NO-ID';
  return s.name.startsWith(s.ids[0] ?? '\u0000') ? s.name : `${id} ${s.name}`;
};
const priority = (s: HistoryScenario) => s.tags.map((t) => t.toLowerCase()).find((t) => t in PRIORITY_RANK) ?? '';

export function buildSummary(): string | null {
  const runs = history();
  const current = runs.at(-1);
  if (!current) return null;
  const previous = [...runs.slice(0, -1)].reverse().find((r) => r.target === current.target && r.types.join() === current.types.join());

  // verification applies only if it was made for this run (after it finished)
  const v = latestVerification();
  const verified = v && new Date(v.data.generatedAt) >= new Date(current.finishedAt) ? v.data.results : null;
  const verdictFor = (s: HistoryScenario): VerificationEntry | undefined =>
    verified?.find((e) => e.tcId.split(',').some((id) => s.ids.some((x) => norm(baseTestCaseId(x)) === norm(baseTestCaseId(id.trim().replace(/^@(id=)?/i, ''))))));

  const outcome = (s: HistoryScenario): Outcome => {
    if (s.status === 'passed') return 'passed';
    const cat = findCategory(verdictFor(s)?.category ?? '');
    if (cat?.statusOverride === 'BLOCKED' || /^(Error: )?BLOCKED\b/.test(s.message)) return 'blocked';
    if (s.status === 'skipped') return 'skipped';
    return 'failed';
  };

  const all = current.scenarios;
  const by = (o: Outcome) => all.filter((s) => outcome(s) === o);
  const [passed, failed, blocked, skipped] = (['passed', 'failed', 'blocked', 'skipped'] as Outcome[]).map(by);
  const total = all.length;
  const rate = total ? ((passed.length / total) * 100).toFixed(1) : '0.0';
  const dur = Math.round((new Date(current.finishedAt).getTime() - new Date(current.startedAt).getTime()) / 1000);

  // comparison with previous run of the same suite
  const notPassed = (r: HistoryRun) => new Set(r.scenarios.filter((s) => s.status !== 'passed').map(key));
  const nowBad = notPassed(current);
  const prevBad = previous ? notPassed(previous) : new Set<string>();
  const prevKeys = previous ? new Set(previous.scenarios.map(key)) : new Set<string>();
  const newFailures = all.filter((s) => nowBad.has(key(s)) && !prevBad.has(key(s)));
  const fixed = all.filter((s) => !nowBad.has(key(s)) && prevBad.has(key(s)));
  const still = all.filter((s) => nowBad.has(key(s)) && prevBad.has(key(s)));

  // failures by category
  const bad = all.filter((s) => s.status !== 'passed');
  const cats = new Map<string, number>();
  for (const s of bad) {
    const c = verified ? findCategory(verdictFor(s)?.category ?? '')?.name ?? 'Unclassified – needs manual check' : 'Not yet verified';
    cats.set(c, (cats.get(c) ?? 0) + 1);
  }
  const flaky = verified ? bad.filter((s) => findCategory(verdictFor(s)?.category ?? '')?.name === 'FLAKY') : [];

  // attention list: priority, then category
  const rankCat = (s: HistoryScenario) => CATEGORY_RANK[findCategory(verdictFor(s)?.category ?? '')?.name ?? ''] ?? 9;
  const attention = [...bad]
    .sort((a, b) => (PRIORITY_RANK[priority(a)] ?? 9) - (PRIORITY_RANK[priority(b)] ?? 9) || rankCat(a) - rankCat(b))
    .slice(0, 5);

  const reportName = current.types.length > 1 ? 'all' : current.types[0];
  const reportPath = path.join('reports', 'allure-report', reportName, 'index.html');
  const reportExists = fs.existsSync(path.join(paths.root, reportPath));
  const headline =
    failed.length + blocked.length + skipped.length === 0 && total > 0
      ? `All ${total} scenario(s) passed.`
      : `${passed.length} passed, ${failed.length} failed, ${blocked.length} blocked, ${skipped.length} skipped of ${total}.`;

  const lines = [
    `# Execution summary — ${current.target} (${current.types.join(', ')})`,
    '',
    `**${headline}** Pass rate ${rate}%.${verified ? '' : ' Failures not yet verified.'}`,
    '',
    `- **Run:** ${current.target} · ${Object.entries(current.platformInfo).map(([k, val]) => `${k} ${val}`).join(' · ')} · env \`${current.environment}\``,
    `- **When:** ${new Date(current.startedAt).toLocaleString()} · duration ${Math.floor(dur / 60)}m ${dur % 60}s`,
    `- **Totals:** passed ${passed.length} · failed ${failed.length} · blocked ${blocked.length} · skipped ${skipped.length}`,
    previous
      ? `- **vs previous run** (${new Date(previous.startedAt).toLocaleString()}): new failures ${newFailures.length} · newly fixed ${fixed.length} · still failing ${still.length}` +
        (all.some((s) => !prevKeys.has(key(s))) ? ` · new scenarios ${all.filter((s) => !prevKeys.has(key(s))).length}` : '')
      : '- **vs previous run:** no earlier run of this suite',
    `- **Failures by category:** ${bad.length ? [...cats].map(([c, n]) => `${c} ${n}`).join(' · ') : 'none'}`,
    `- **Flaky:** ${verified ? (flaky.length ? flaky.map(label).join('; ') : 'none detected') : 'unknown (not yet verified)'}`,
  ];
  if (newFailures.length) lines.push(`- **New failures:** ${newFailures.map(label).join('; ')}`);
  if (fixed.length) lines.push(`- **Newly fixed:** ${fixed.map(label).join('; ')}`);
  if (attention.length) {
    lines.push('', '**Needs attention**');
    attention.forEach((s, i) => {
      const verdict = verdictFor(s);
      lines.push(`${i + 1}. ${label(s)} — ${priority(s) || 'no priority'} · ${outcome(s)} · ${verdict ? findCategory(verdict.category)?.name ?? verdict.category : 'unverified'}: ${(verdict?.reason ?? s.message.split('\n')[0]).slice(0, 140)}`);
    });
  }
  lines.push(
    '',
    `- **Allure:** ${reportExists ? reportPath : `not generated yet (npm run report:${reportName})`}`,
    '- **Evidence:** screenshots/annotated/ · failures list: `npm run results:failures`',
    '',
  );

  const md = lines.join('\n');
  const dir = path.join(paths.reports, 'summary');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `summary_${timestamp()}.md`), md);
  return md;
}

if (require.main === module) {
  const md = buildSummary();
  console.log(md ?? 'No runs recorded yet (reports/history/). Run tests first.');
}
