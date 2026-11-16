#!/usr/bin/env tsx
/**
 * Writes a test case review workbook from reviewer decisions (skill: test-case-validity-remarks).
 * Never touches source/.
 *
 *   tsx scripts/test-case-review.ts --input reports/test-case-review/input/<file>.review.json
 *
 * Input JSON:
 * {
 *   "sourceFile": "source/web/Login.xlsx",
 *   "reviewedBy": "Claude (AI reviewer)",
 *   "date": "2026-11-11",                       // optional, defaults to today
 *   "cases": [
 *     { "id": "TC-001", "title": "Login", "status": "VALID" },
 *     { "id": "TC-002", "title": "...", "status": "INVALID", "category": "Ambiguous",
 *       "problem": "Step 5 expected result \"page loads properly\" cannot be verified.",
 *       "evidence": "No element, text or state is named.",
 *       "fix": "\"Dashboard shows the welcome message with the logged-in user's name.\"" },
 *     { "id": "TC-003", "status": "DUPLICATE", "duplicateOf": "TC-001", "problem": "...", "evidence": "...", "fix": "..." },
 *     { "id": "TC-004", "status": "NEEDS CLARIFICATION", "problem": "...", "question": "Which role should ...?" }
 *   ]
 * }
 *
 * Output: reports/test-case-review/review_<source-file>_<YYYYMMDD>.xlsx  (sheets: Review, Summary)
 */
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { paths } from '../support/config';
import { INVALID_CATEGORIES, REVIEW_COLORS, REVIEW_COLUMNS, REVIEW_STATUSES, VAGUE_REMARKS, type ReviewStatus } from '../config/review.config';
import { parseArgs } from './lib';

interface ReviewCase {
  id: string;
  title?: string;
  status: ReviewStatus;
  category?: string;
  problem?: string;
  evidence?: string;
  fix?: string;
  duplicateOf?: string;
  question?: string;
}

interface ReviewInput {
  sourceFile: string;
  reviewedBy: string;
  date?: string;
  cases: ReviewCase[];
}

export const REVIEW_DIR = path.join(paths.reports, 'test-case-review');

const today = () => new Date().toISOString().slice(0, 10);
const blank = (s?: string) => !s || !s.trim();

function validate(input: ReviewInput): string[] {
  const errors: string[] = [];
  if (blank(input.sourceFile)) errors.push('sourceFile is required');
  if (blank(input.reviewedBy)) errors.push('reviewedBy is required');
  if (!Array.isArray(input.cases) || input.cases.length === 0) errors.push('cases[] is empty');

  const seen = new Set<string>();
  for (const [i, c] of (input.cases ?? []).entries()) {
    const at = `cases[${i}] (${c.id || 'no id'})`;
    if (blank(c.id)) errors.push(`${at}: id is required`);
    if (seen.has(c.id)) errors.push(`${at}: duplicate entry for the same ID`);
    seen.add(c.id);

    if (!REVIEW_STATUSES.includes(c.status)) {
      errors.push(`${at}: status must be one of ${REVIEW_STATUSES.join(', ')}`);
      continue;
    }
    if (c.status === 'INVALID' && !INVALID_CATEGORIES.includes(c.category as never)) {
      errors.push(`${at}: INVALID needs category ${INVALID_CATEGORIES.join(' | ')}`);
    }
    if (c.status !== 'INVALID' && !blank(c.category)) errors.push(`${at}: category is only used with INVALID`);
    if (c.status === 'VALID') continue;

    if (blank(c.problem) || VAGUE_REMARKS.test(c.problem!.trim()) || c.problem!.trim().length < 15) {
      errors.push(`${at}: problem must say what is wrong (cite the step number) — "${c.problem ?? ''}" is not actionable`);
    }
    if (c.status === 'NEEDS CLARIFICATION') {
      if (blank(c.question)) errors.push(`${at}: NEEDS CLARIFICATION needs the question for the user/BA`);
      continue;
    }
    if (blank(c.evidence)) errors.push(`${at}: evidence is required (requirement, user confirmation, or internal contradiction)`);
    if (blank(c.fix)) errors.push(`${at}: suggested fix is required`);
    if (c.status === 'DUPLICATE' && blank(c.duplicateOf)) errors.push(`${at}: DUPLICATE must name the other case in duplicateOf`);
  }
  return errors;
}

/** [STATUS – Category] Problem: … Evidence: … Suggested fix: … Reviewed by: <who>, <date>. */
export function composeRemark(c: ReviewCase, reviewedBy: string, date: string): string {
  const tag = c.status === 'INVALID' ? `[INVALID – ${c.category}]` : `[${c.status}]`;
  const end = (s: string) => (/[.!?…"”]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);
  if (c.status === 'VALID') return `${tag} Ready for automation. Reviewed by: ${reviewedBy}, ${date}.`;

  const problem = c.status === 'DUPLICATE' && c.duplicateOf && !c.problem!.includes(c.duplicateOf)
    ? `${end(c.problem!)} Duplicate of ${c.duplicateOf}.`
    : end(c.problem!);
  const parts = [`${tag} Problem: ${problem}`];
  if (!blank(c.evidence)) parts.push(`Evidence: ${end(c.evidence!)}`);
  if (c.status === 'NEEDS CLARIFICATION') parts.push(`Question: ${end(c.question!)}`);
  if (!blank(c.fix)) parts.push(`Suggested fix: ${end(c.fix!)}`);
  parts.push(`Reviewed by: ${reviewedBy}, ${date}.`);
  return parts.join(' ');
}

async function main() {
  const { opts } = parseArgs(process.argv.slice(2), ['input']);
  if (typeof opts.input !== 'string') {
    console.error('Usage: tsx scripts/test-case-review.ts --input <review.json>');
    process.exit(2);
  }
  const input = JSON.parse(fs.readFileSync(path.resolve(opts.input), 'utf8')) as ReviewInput;
  const errors = validate(input);
  if (errors.length) {
    console.error(`Review input rejected (${errors.length} problem(s)):\n  - ${errors.join('\n  - ')}`);
    process.exit(1);
  }

  const date = input.date ?? today();
  const wb = new ExcelJS.Workbook();
  wb.creator = input.reviewedBy;

  /* ---------- Review sheet ---------- */
  const ws = wb.addWorksheet('Review', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = REVIEW_COLUMNS.map((h) => ({
    header: h,
    width: { 'TC ID': 16, Title: 34, Status: 22, Category: 15, Remark: 80, Evidence: 45, 'Suggested Fix': 50, 'Reviewed By': 22, Date: 12 }[h],
  }));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF37474F' } };
  ws.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + REVIEW_COLUMNS.length)}1` };

  for (const c of input.cases) {
    const row = ws.addRow([
      c.id,
      c.title ?? '',
      c.status,
      c.category ?? '',
      composeRemark(c, input.reviewedBy, date),
      c.evidence ?? '',
      c.fix ?? (c.status === 'NEEDS CLARIFICATION' ? `Awaiting answer: ${c.question}` : ''),
      input.reviewedBy,
      date,
    ]);
    row.alignment = { wrapText: true, vertical: 'top' };
    row.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: REVIEW_COLORS[c.status] } };
    row.getCell(3).font = { bold: true };
  }

  /* ---------- Summary sheet ---------- */
  const totals = REVIEW_STATUSES.map((s) => [s, input.cases.filter((c) => c.status === s).length] as const);
  const needsInput = input.cases.filter((c) => c.status === 'NEEDS CLARIFICATION');
  const sum = wb.addWorksheet('Summary');
  sum.columns = [{ width: 28 }, { width: 90 }];
  sum.addRow(['Source file', input.sourceFile]).font = { bold: true };
  sum.addRow(['Reviewed by', `${input.reviewedBy}, ${date}`]);
  sum.addRow(['Total cases', input.cases.length]);
  sum.addRow([]);
  sum.addRow(['Status', 'Count']).font = { bold: true };
  for (const [s, n] of totals) {
    const r = sum.addRow([s, n]);
    r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: REVIEW_COLORS[s] } };
  }
  sum.addRow([]);
  sum.addRow(['Needs user input', needsInput.length ? '' : 'None']).font = { bold: true };
  for (const c of needsInput) sum.addRow([c.id, c.question ?? '']).alignment = { wrapText: true, vertical: 'top' };

  /* ---------- write ---------- */
  fs.mkdirSync(REVIEW_DIR, { recursive: true });
  const base = path.basename(input.sourceFile, path.extname(input.sourceFile));
  const out = path.join(REVIEW_DIR, `review_${base}_${date.replace(/-/g, '')}.xlsx`);
  await wb.xlsx.writeFile(out);

  console.log(`\nReview written: ${path.relative(paths.root, out)}`);
  console.log(`Total ${input.cases.length}: ${totals.filter(([, n]) => n).map(([s, n]) => `${s} ${n}`).join(' | ')}`);
  if (needsInput.length) {
    console.log('\nNeeds your input:');
    for (const c of needsInput) console.log(`  - ${c.id}: ${c.question}`);
  }
  console.log('');
}

if (require.main === module) {
  main().catch((e) => {
    console.error(`Review failed: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  });
}
