#!/usr/bin/env tsx
/**
 * Updates execution status in a COPY of your original Excel test cases.
 * Runs ONLY when explicitly invoked (npm run excel:update*). Original files are never written.
 *
 *   tsx scripts/update-excel.ts [--type web|mobile|api|all|latest] [--file <path.xlsx>] [--dry-run] [--include-review]
 *
 * Source of truth: Allure results in reports/allure-results/<type>.
 * Link: each scenario is tagged @id=<ORIGINAL_ID> or @<ID> (TC_ID_PREFIXES); rows whose ID matches are updated,
 * every other row and column is left exactly as it was.
 *
 * Only rows covered by the selected execution results are changed. Columns written: Status (PASS/FAIL/BLOCKED),
 * Actual Result, Execution Date, Failure Details, Failure Category, Remarks (append-only), Automation Scenario.
 * Failure Category / Remarks come from the latest result-verifier output (reports/verification/verification_*.json);
 * categories ENVIRONMENT / TEST DATA / INVALID TEST CASE set BLOCKED (failure-classification skill). Remarks also carry the test case review remark
 * (reports/test-case-review/review_<name>_<date>.xlsx) for executed rows.
 * --include-review additionally appends review remarks to NOT-executed rows (Remarks column only, explicit opt-in).
 *
 * Output: reports/excel/<name>_updated_<timestamp>.xlsx  +  reports/excel/update-log_<timestamp>.csv
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { paths, EXECUTION_TYPES, type ExecutionType } from '../support/config';
import { excelConfig } from '../config/excel.config';
import { readResults, type ScenarioResult } from '../utils/allure-results';
import { listFiles, parseArgs, timestamp } from './lib';
import { cellText, findHeader, norm } from '../utils/excel';
import { loadReview } from '../utils/review';
import { findCategory } from '../config/verification.config';
import { verificationByTestCase } from '../utils/verification';

type ExcelStatus = 'PASS' | 'FAIL' | 'BLOCKED';
type ColumnKey = keyof typeof excelConfig.resultColumns;

interface TestCaseOutcome {
  id: string;
  status: ExcelStatus;
  actualResult: string;
  failureDetails: string;
  executionDate: Date;
  automationRef: string;
  failureCategory: string;
  remarks: string[];
}

interface LogRow { file: string; sheet: string; row: number | string; id: string; status: string; note: string }

const SEVERITY: Record<ExcelStatus, number> = { PASS: 0, BLOCKED: 1, FAIL: 2 };
const firstLine = (s: string) => s.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
const clip = (s: string, n = 1500) => (s.length > n ? `${s.slice(0, n)}…` : s);
const sha256 = (file: string) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

/* ------------------------------ results ------------------------------ */

function resolveTypes(type: string): ExecutionType[] {
  if (type === 'latest') {
    if (!fs.existsSync(paths.lastRun)) throw new Error('No reports/last-run.json yet — run tests first.');
    return JSON.parse(fs.readFileSync(paths.lastRun, 'utf8')).types as ExecutionType[];
  }
  if (type === 'all') return EXECUTION_TYPES;
  if ((EXECUTION_TYPES as string[]).includes(type)) return [type as ExecutionType];
  throw new Error(`Unknown --type "${type}". Use web | mobile | api | all | latest.`);
}

function describe(r: ScenarioResult, status: ExcelStatus): { actual: string; failure: string } {
  const msg = firstLine(r.message);
  if (status === 'PASS') return { actual: `Behaved as expected — scenario "${r.name}" passed`, failure: '' };
  if (status === 'FAIL') {
    return {
      actual: `Failed${r.failedStep ? ` at step "${r.failedStep}"` : ''}: ${msg || 'see report'}`,
      failure: clip([r.failedStep && `Step: ${r.failedStep}`, r.message].filter(Boolean).join('\n')),
    };
  }
  return { actual: `Not executed / blocked${msg ? `: ${msg}` : ''}`, failure: clip(r.message) };
}

function buildOutcomes(results: ScenarioResult[]): { outcomes: Map<string, TestCaseOutcome>; untraced: ScenarioResult[] } {
  const outcomes = new Map<string, TestCaseOutcome>();
  const untraced: ScenarioResult[] = [];

  for (const r of results) {
    if (r.testCaseIds.length === 0) {
      untraced.push(r);
      continue;
    }
    // a scenario that stopped on a "BLOCKED: …" condition (missing variable/data, no session) is BLOCKED, not FAIL
    const status = /^(Error: )?BLOCKED\b/.test(r.message) ? 'BLOCKED' : excelConfig.statusMap[r.status] ?? 'BLOCKED';
    const { actual, failure } = describe(r, status);
    const ref = `${r.type}: ${r.feature ? `${r.feature} › ` : ''}${r.name}`;
    const date = new Date(r.stop || r.start || Date.now());

    for (const rawId of r.testCaseIds) {
      const key = norm(rawId);
      const prev = outcomes.get(key);
      if (!prev) {
        outcomes.set(key, { id: rawId, status, actualResult: actual, failureDetails: failure, executionDate: date, automationRef: ref, failureCategory: '', remarks: [] });
        continue;
      }
      // Several scenarios cover one test case: worst status wins, details are combined.
      prev.status = SEVERITY[status] > SEVERITY[prev.status] ? status : prev.status;
      prev.actualResult = `${prev.actualResult}\n${actual}`;
      prev.failureDetails = [prev.failureDetails, failure].filter(Boolean).join('\n---\n');
      prev.automationRef = `${prev.automationRef}\n${ref}`;
      if (date > prev.executionDate) prev.executionDate = date;
    }
  }
  return { outcomes, untraced };
}

/* ------------------------------- excel ------------------------------- */

function resolveColumns(ws: ExcelJS.Worksheet, headerRow: number, idCol: number): Record<ColumnKey, number> {
  const header = ws.getRow(headerRow);
  const existing = new Map<string, number>();
  let lastCol = 0;
  header.eachCell({ includeEmpty: false }, (cell, col) => {
    existing.set(norm(cellText(cell.value)), col);
    lastCol = Math.max(lastCol, col);
  });

  const idCell = header.getCell(idCol);
  const cols = {} as Record<ColumnKey, number>;
  for (const [key, aliases] of Object.entries(excelConfig.resultColumns) as [ColumnKey, string[]][]) {
    const found = aliases.map(norm).map((a) => existing.get(a)).find((c) => c !== undefined && c !== idCol);
    if (found) {
      cols[key] = found;
      continue;
    }
    lastCol += 1;
    const cell = header.getCell(lastCol);
    cell.value = aliases[0];
    cell.style = JSON.parse(JSON.stringify(idCell.style ?? {}));
    ws.getColumn(lastCol).width = ['status', 'executionDate', 'failureCategory'].includes(key) ? 20 : 45;
    cols[key] = lastCol;
  }
  return cols;
}

function writeOutcome(ws: ExcelJS.Worksheet, rowNo: number, cols: Record<ColumnKey, number>, o: TestCaseOutcome): void {
  const row = ws.getRow(rowNo);
  const wrap = { wrapText: true, vertical: 'top' as const };

  const status = row.getCell(cols.status);
  status.value = o.status;
  status.font = { ...(status.font ?? {}), bold: true };
  status.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: excelConfig.statusColors[o.status] } };
  status.alignment = { vertical: 'top', horizontal: 'center' };

  const set = (key: ColumnKey, value: ExcelJS.CellValue) => {
    const c = row.getCell(cols[key]);
    c.value = value;
    c.alignment = wrap;
  };
  set('actualResult', o.actualResult);
  set('failureDetails', o.failureDetails || '—');
  set('failureCategory', o.status === 'PASS' ? '—' : o.failureCategory || 'Not verified');
  set('automationRef', o.automationRef);
  appendRemarks(row.getCell(cols.remarks), o.remarks);
  // Excel dates carry no timezone: store local wall-clock time
  set('executionDate', new Date(o.executionDate.getTime() - o.executionDate.getTimezoneOffset() * 60000));
  row.getCell(cols.executionDate).numFmt = 'yyyy-mm-dd hh:mm';
  row.commit();
}

/* ----------------------- verification & review ----------------------- */

/** Applies the result-verifier's classification: Failure Category, BLOCKED override, remark. */
function applyVerification(outcomes: Map<string, TestCaseOutcome>): string | null {
  const v = verificationByTestCase();
  if (!v) return null;
  for (const [key, o] of outcomes) {
    if (o.status === 'PASS') continue;
    const entries = v.byId.get(key);
    if (!entries?.length) continue;
    o.failureCategory = [...new Set(entries.map((e) => findCategory(e.category)?.name ?? e.category))].join(', ');
    if (entries.some((e) => findCategory(e.category)?.statusOverride === 'BLOCKED') && entries.every((e) => findCategory(e.category)?.statusOverride === 'BLOCKED')) {
      o.status = 'BLOCKED';
    }
    for (const e of entries) {
      o.remarks.push(`Verification: ${findCategory(e.category)?.name ?? e.category} — ${e.reason.trim()} (first run: ${e.firstResult}, re-run: ${e.rerunResult}). Action: ${e.action.trim()}`);
    }
  }
  return v.file;
}

/** Remarks are append-only so existing content in the source column is preserved. */
function appendRemarks(cell: ExcelJS.Cell, remarks: string[]): void {
  if (!remarks.length) return;
  const stamp = new Date().toISOString().slice(0, 10);
  const existing = cellText(cell.value).trim();
  const added = remarks.map((r) => `[Automation ${stamp}] ${r}`).join('\n');
  cell.value = existing ? `${existing}\n${added}` : added;
  cell.alignment = { wrapText: true, vertical: 'top' };
}

function sourceFiles(types: ExecutionType[], explicit: string[]): string[] {
  if (explicit.length) return explicit.map((f) => path.resolve(f));
  const dirs = [...new Set([...types.map((t) => path.join(paths.source, t)), path.join(paths.source, 'test-cases')])];
  return dirs.flatMap((d) => listFiles(d, (f) => /\.(xlsx|xlsm|csv)$/i.test(f) && !f.startsWith('~$')));
}

async function updateFile(file: string, outcomes: Map<string, TestCaseOutcome>, stamp: string, dryRun: boolean, log: LogRow[], matched: Set<string>, includeReview: boolean) {
  const isCsv = /\.csv$/i.test(file);
  const wb = new ExcelJS.Workbook();
  const before = sha256(file);
  if (isCsv) await wb.csv.readFile(file);
  else await wb.xlsx.readFile(file);

  let updated = 0;
  let reviewOnly = 0;
  const rel = path.relative(paths.root, file);
  const review = await loadReview(file);

  for (const ws of wb.worksheets) {
    const header = findHeader(ws);
    if (!header) continue;
    let cols: Record<ColumnKey, number> | null = null;

    for (let r = header.row + 1; r <= ws.rowCount; r++) {
      const id = cellText(ws.getRow(r).getCell(header.idCol).value).trim();
      if (!id) continue;
      const o = outcomes.get(norm(id));
      const rvRow = review?.rows.get(norm(id));
      const rv = rvRow && rvRow.status !== 'VALID' ? rvRow : undefined;

      if (o) {
        cols ??= resolveColumns(ws, header.row, header.idCol);
        const withReview = rv ? { ...o, remarks: [...o.remarks, `Test case review: ${rv.remark}`] } : o;
        if (!dryRun) writeOutcome(ws, r, cols, withReview);
        matched.add(norm(id));
        updated++;
        log.push({ file: rel, sheet: ws.name, row: r, id, status: withReview.status, note: dryRun ? 'dry-run' : 'updated' });
      } else if (rv && includeReview) {
        // explicit opt-in: review remark on a row that was not executed (Remarks column only)
        cols ??= resolveColumns(ws, header.row, header.idCol);
        if (!dryRun) {
          appendRemarks(ws.getRow(r).getCell(cols.remarks), [`Test case review: ${rv.remark}`]);
          ws.getRow(r).commit();
        }
        reviewOnly++;
        log.push({ file: rel, sheet: ws.name, row: r, id, status: rv.status, note: `review remark only (not executed) — ${review!.file}` });
      }
    }
  }

  const extra = reviewOnly ? ` + ${reviewOnly} review-only remark(s)` : '';
  if (updated === 0 && reviewOnly === 0) {
    console.log(`  - ${rel}: no matching test case IDs`);
    return;
  }
  if (dryRun) {
    console.log(`  ~ ${rel}: ${updated} row(s) would be updated${extra} (dry run)`);
    return;
  }

  const ext = path.extname(file);
  const out = path.join(paths.excelOutput, `${path.basename(file, ext)}_updated_${stamp}${isCsv ? '.csv' : '.xlsx'}`);
  fs.mkdirSync(paths.excelOutput, { recursive: true });
  if (isCsv) await wb.csv.writeFile(out);
  else await wb.xlsx.writeFile(out);

  if (sha256(file) !== before) throw new Error(`Safety check failed: original file changed: ${file}`);
  console.log(`  ✔ ${rel}: ${updated} row(s) updated${extra} -> ${path.relative(paths.root, out)}`);
}

/* -------------------------------- main ------------------------------- */

async function main() {
  const { opts } = parseArgs(process.argv.slice(2), ['type', 'file', 'dry-run', 'include-review']);
  const typeArg = typeof opts.type === 'string' ? opts.type : 'all';
  const explicit = typeof opts.file === 'string' ? opts.file.split(',').map((s) => s.trim()) : [];
  const dryRun = Boolean(opts['dry-run']);
  const includeReview = Boolean(opts['include-review']);

  const types = resolveTypes(typeArg);
  const results = types.flatMap(readResults);
  console.log(`\nExcel update — scope: ${typeArg} (${types.join(', ')}) — ${results.length} scenario result(s)`);
  if (results.length === 0) {
    console.log('No execution results found. Run tests first.');
    process.exit(1);
  }

  const { outcomes, untraced } = buildOutcomes(results);
  const verificationFile = applyVerification(outcomes);
  console.log(verificationFile ? `  Failure categories from ${verificationFile}` : '  No verification yet — failed rows get Failure Category "Not verified"');
  const files = sourceFiles(types, explicit);
  for (const f of listFiles(paths.source, (n) => /\.xls$/i.test(n))) {
    console.log(`  ! ${path.relative(paths.root, f)}: legacy .xls is not supported — save a copy as .xlsx in source/`);
  }
  if (files.length === 0) {
    console.log('No .xlsx/.csv test case files found in source/. Use --file <path> to point at one.');
    process.exit(1);
  }

  const stamp = timestamp();
  const log: LogRow[] = [];
  const matched = new Set<string>();
  for (const f of files) await updateFile(f, outcomes, stamp, dryRun, log, matched, includeReview);

  for (const [key, o] of outcomes) {
    if (!matched.has(key)) log.push({ file: '-', sheet: '-', row: '-', id: o.id, status: o.status, note: 'ID not found in any Excel file' });
  }
  for (const r of untraced) log.push({ file: '-', sheet: '-', row: '-', id: '-', status: r.status, note: `No test case ID tag: ${r.type}: ${r.name}` });

  if (!dryRun) {
    const esc = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = ['file,sheet,row,test_case_id,status,note', ...log.map((l) => [l.file, l.sheet, l.row, l.id, l.status, l.note].map(esc).join(','))].join('\n');
    fs.mkdirSync(paths.excelOutput, { recursive: true });
    fs.writeFileSync(path.join(paths.excelOutput, `update-log_${stamp}.csv`), csv);
  }

  const notFound = [...outcomes.keys()].filter((k) => !matched.has(k));
  console.log(`\nMatched ${matched.size}/${outcomes.size} test case ID(s).`);
  if (notFound.length) console.log(`Not found in Excel: ${notFound.map((k) => outcomes.get(k)!.id).join(', ')}`);
  if (untraced.length) console.log(`${untraced.length} scenario(s) without a test case ID tag were ignored.`);
  if (!dryRun) console.log(`Log: reports/excel/update-log_${stamp}.csv\n`);
}

main().catch((e) => {
  console.error(`Excel update failed: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
