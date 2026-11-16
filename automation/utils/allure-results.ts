/**
 * Reads Allure result files (shared by web, mobile and API) into a normalised shape.
 * Used by the run summary and the Excel updater.
 */
import fs from 'fs';
import path from 'path';
import { paths, type ExecutionType } from '../support/config';
import { idsFromTag } from '../config/traceability.config';

export interface AllureLabel { name: string; value: string }
interface AllureStep { name: string; status?: string; steps?: AllureStep[] }
interface AllureFixture { name?: string; status?: string; statusDetails?: { message?: string } }
interface AllureContainer { children?: string[]; befores?: AllureFixture[]; afters?: AllureFixture[] }
interface AllureResult {
  uuid?: string;
  name: string;
  fullName?: string;
  status?: string;
  statusDetails?: { message?: string; trace?: string };
  start?: number;
  stop?: number;
  labels?: AllureLabel[];
  steps?: AllureStep[];
}

export interface ScenarioResult {
  type: ExecutionType;
  name: string;
  feature: string;
  status: string; // passed | failed | broken | skipped | unknown
  testCaseIds: string[];
  tags: string[];
  message: string;
  failedStep: string;
  stepCount: number;
  start: number;
  stop: number;
}

function firstFailedStep(steps: AllureStep[] = []): string {
  for (const s of steps) {
    if (s.status === 'failed' || s.status === 'broken') return firstFailedStep(s.steps) || s.name;
  }
  return '';
}

function extractIds(labels: AllureLabel[]): string[] {
  const ids = new Set<string>();
  for (const l of labels) {
    if (l.name === 'testCaseId') ids.add(l.value.trim());
    if (l.name === 'tag') idsFromTag(l.value).forEach((id) => ids.add(id));
  }
  return [...ids];
}

/** Failure messages of setup/teardown fixtures (e.g. a Before hook that could not start a session), by test uuid. */
function fixtureFailures(dir: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('-container.json'))) {
    const c = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as AllureContainer;
    const failed = [...(c.befores ?? []), ...(c.afters ?? [])].find((x) => x.status === 'failed' || x.status === 'broken');
    const msg = failed?.statusDetails?.message?.trim();
    if (msg) for (const child of c.children ?? []) if (!map.has(child)) map.set(child, msg);
  }
  return map;
}

export function readResults(type: ExecutionType): ScenarioResult[] {
  const dir = paths.allureResults(type);
  if (!fs.existsSync(dir)) return [];
  const fixtureMsgs = fixtureFailures(dir);
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('-result.json'))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as AllureResult)
    .map((r) => {
      const labels = r.labels ?? [];
      const label = (n: string) => labels.find((l) => l.name === n)?.value ?? '';
      return {
        type,
        name: r.name,
        feature: label('feature') || label('suite') || label('parentSuite'),
        status: r.status ?? 'unknown',
        testCaseIds: extractIds(labels),
        tags: labels.filter((l) => l.name === 'tag').map((l) => l.value),
        message: (r.statusDetails?.message ?? '').trim() || fixtureMsgs.get(r.uuid ?? '') || '',
        failedStep: firstFailedStep(r.steps),
        stepCount: r.steps?.length ?? 0,
        start: r.start ?? 0,
        stop: r.stop ?? 0,
      };
    });
}

export function countByStatus(results: ScenarioResult[]) {
  const c = { total: results.length, passed: 0, failed: 0, broken: 0, skipped: 0, unknown: 0 };
  for (const r of results) c[(r.status in c ? r.status : 'unknown') as keyof typeof c]++;
  return c;
}

/** Metadata tag key -> Allure label (@epic=…). Test case IDs (@id=… / @TC-…) map to "testCaseId". */
export const LABEL_TAGS: Record<string, string> = { epic: 'epic', story: 'story', owner: 'owner' };

/** Priority tag (skill: tagging-and-suites) -> Allure severity. */
export const PRIORITY_SEVERITY: Record<string, string> = { '@critical': 'blocker', '@high': 'critical', '@medium': 'normal', '@low': 'minor' };

/**
 * Cucumber writes "@key=value" tags only as plain tags. This adds the matching Allure labels
 * (testCaseId, severity, epic, story, owner) to every result file of the given type.
 */
export function enrichTagLabels(type: ExecutionType): void {
  const dir = paths.allureResults(type);
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('-result.json'))) {
    const file = path.join(dir, f);
    const r = JSON.parse(fs.readFileSync(file, 'utf8')) as AllureResult;
    const labels = r.labels ?? [];
    const added: AllureLabel[] = [];
    for (const l of labels.filter((x) => x.name === 'tag')) {
      const sev = PRIORITY_SEVERITY[l.value.toLowerCase()];
      if (sev && !labels.some((x) => x.name === 'severity') && !added.some((x) => x.name === 'severity')) added.push({ name: 'severity', value: sev });
      for (const v of idsFromTag(l.value)) {
        if (!labels.some((x) => x.name === 'testCaseId' && x.value === v) && !added.some((x) => x.name === 'testCaseId' && x.value === v)) {
          added.push({ name: 'testCaseId', value: v });
        }
      }
      const m = l.value.match(/^@?(\w+)=(.+)$/);
      const name = m && LABEL_TAGS[m[1].toLowerCase()];
      if (!name) continue;
      for (const v of m[2].split(',').map((x) => x.trim())) {
        if (!labels.some((x) => x.name === name && x.value === v)) added.push({ name, value: v });
      }
    }
    if (added.length) fs.writeFileSync(file, JSON.stringify({ ...r, labels: [...labels, ...added] }));
  }
}
