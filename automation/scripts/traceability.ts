#!/usr/bin/env tsx
/**
 * Traceability matrix (skill: traceability-matrix): original test cases -> validity -> automation -> latest result.
 * Read-only on source/.
 *
 *   tsx scripts/traceability.ts
 *
 * Sources: source/** (.xlsx/.xlsm/.csv), latest review per source file, feature file tags, latest Allure results,
 *          latest verification (failure category), reports/bugs/ (linked defects).
 * Output:  reports/traceability/traceability_<yyyyMMdd>.xlsx  (Matrix, Flags, Summary) + console coverage summary
 */
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { paths, EXECUTION_TYPES, type ExecutionType } from '../support/config';
import { cellText, findHeader, norm, readWorkbook } from '../utils/excel';
import { parseFeatures, type ParsedScenario } from '../utils/features';
import { loadReview, type ReviewRow } from '../utils/review';
import { readResults, type ScenarioResult } from '../utils/allure-results';
import { testCaseIdsFromTags } from '../config/traceability.config';
import { excelConfig } from '../config/excel.config';
import { findCategory } from '../config/verification.config';
import { verificationByTestCase } from '../utils/verification';
import { listFiles } from './lib';

const COLUMNS = [
  'Original TC ID', 'Title', 'Source File', 'Platform', 'Validity Status', 'Automation Status', 'Feature File',
  'Scenario Name', 'Last Result', 'Last Run Date', 'Failure Category', 'Linked Defect', 'Remarks',
] as const;

const TITLE_HEADERS = ['title', 'test case title', 'test case name', 'name', 'summary', 'scenario', 'test scenario', 'description'];
const MODULE_HEADERS = ['module', 'feature', 'component', 'area', 'functionality', 'screen'];
const PLATFORM_HEADERS = ['platform', 'type', 'test type'];

interface SourceCase { id: string; title: string; module: string; platform: string; sourceFile: string; review?: ReviewRow }

/* ------------------------------ source ------------------------------ */
async function readSource(): Promise<{ cases: SourceCase[]; unparsed: string[] }> {
  const cases: SourceCase[] = [];
  const files = listFiles(paths.source, (n) => !n.startsWith('.') && !n.startsWith('~$') && n !== 'README.md');
  const unparsed = files.filter((f) => !/\.(xlsx|xlsm|csv)$/i.test(f)).map((f) => path.relative(paths.root, f));

  for (const file of files.filter((f) => /\.(xlsx|xlsm|csv)$/i.test(f))) {
    const rel = path.relative(paths.root, file);
    const folder = path.relative(paths.source, file).split(path.sep)[0];
    const review = await loadReview(file);
    const wb = await readWorkbook(file);
    for (const ws of wb.worksheets) {
      const header = findHeader(ws);
      if (!header) continue;
      const cols = new Map<string, number>();
      ws.getRow(header.row).eachCell((c, i) => cols.set(norm(cellText(c.value)), i));
      const pick = (aliases: string[]) => aliases.map((a) => cols.get(norm(a))).find((c) => c !== undefined && c !== header.idCol);
      const [titleC, moduleC, platformC] = [pick(TITLE_HEADERS), pick(MODULE_HEADERS), pick(PLATFORM_HEADERS)];
      for (let r = header.row + 1; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const id = cellText(row.getCell(header.idCol).value).trim();
        if (!id) continue;
        const declared = platformC ? cellText(row.getCell(platformC).value).trim().toLowerCase() : '';
        cases.push({
          id,
          title: titleC ? cellText(row.getCell(titleC).value).trim() : '',
          module: moduleC ? cellText(row.getCell(moduleC).value).trim() : '',
          platform: ['web', 'mobile', 'api'].includes(folder) ? folder : ['web', 'mobile', 'api'].find((p) => declared.includes(p)) ?? '',
          sourceFile: rel,
          review: review?.rows.get(norm(id)),
        });
      }
    }
  }
  return { cases, unparsed };
}

/* ------------------------------ helpers ----------------------------- */
const excelStatus = (r: ScenarioResult) =>
  /^(Error: )?BLOCKED\b/.test(r.message) ? 'BLOCKED' : excelConfig.statusMap[r.status] ?? 'BLOCKED';
const SEVERITY: Record<string, number> = { PASS: 0, BLOCKED: 1, FAIL: 2 };
const isManual = (s: ParsedScenario) => s.tags.some((t) => t.toLowerCase() === '@manual');

function bugsFor(id: string): string {
  const dir = path.join(paths.reports, 'bugs');
  if (!fs.existsSync(dir)) return '';
  const safe = id.replace(/[^A-Za-z0-9._-]+/g, '_');
  return fs.readdirSync(dir).filter((f) => f.startsWith(`BUG_${safe}_`)).map((f) => `reports/bugs/${f}`).join('\n');
}

/* -------------------------------- main ------------------------------- */
async function main() {
  const { cases, unparsed } = await readSource();
  const scenarios = parseFeatures();
  const results = EXECUTION_TYPES.flatMap((t) => readResults(t as ExecutionType));
  const verification = verificationByTestCase();

  const scenariosById = new Map<string, ParsedScenario[]>();
  for (const sc of scenarios) {
    for (const id of testCaseIdsFromTags(sc.tags)) scenariosById.set(norm(id), [...(scenariosById.get(norm(id)) ?? []), sc]);
  }
  const resultsById = new Map<string, ScenarioResult[]>();
  for (const r of results) for (const id of r.testCaseIds) resultsById.set(norm(id), [...(resultsById.get(norm(id)) ?? []), r]);
  const sourceIds = new Set(cases.map((c) => norm(c.id)));

  const rows: Record<(typeof COLUMNS)[number], string>[] = [];
  const flags: string[][] = [];

  for (const c of cases) {
    const k = norm(c.id);
    const scs = scenariosById.get(k) ?? [];
    const auto = scs.filter((s) => !isManual(s));
    const rs = resultsById.get(k) ?? [];
    const v = c.review?.status ?? '';

    let automation = 'Not Started';
    if (auto.length) automation = 'Automated';
    else if (v === 'NOT AUTOMATABLE' || scs.some(isManual)) automation = 'Not Automatable';
    else if (v === 'INVALID') automation = 'Invalid';

    const last = rs.length ? rs.map(excelStatus).sort((a, b) => SEVERITY[b] - SEVERITY[a])[0] : '';
    const lastDate = rs.length ? new Date(Math.max(...rs.map((r) => r.stop || r.start))).toISOString().slice(0, 16).replace('T', ' ') : '';
    const cat = last && last !== 'PASS'
      ? [...new Set((verification?.byId.get(k) ?? []).map((e) => findCategory(e.category)?.name ?? e.category))].join(', ') || 'Not verified'
      : '';

    const remarks: string[] = [];
    if (c.review && v !== 'VALID') remarks.push(c.review.remark);
    if (!c.review) remarks.push('Not reviewed yet');
    if (v === 'VALID' && !auto.length) remarks.push('VALID but no scenario yet');
    if (auto.length && !rs.length) remarks.push('Automated but not executed in the latest results');
    if (automation === 'Automated' && v && v !== 'VALID' && v !== 'BLOCKED') remarks.push(`Automated although review status is ${v}`);
    if (!c.platform) remarks.push('Platform unknown (put the file in source/web|mobile|api or add a Platform column)');
    if (!scs.length) flags.push(['Source case without scenario', c.id, c.sourceFile, v || 'not reviewed']);

    rows.push({
      'Original TC ID': c.id,
      Title: c.title,
      'Source File': c.sourceFile,
      Platform: c.platform || (scs[0]?.type ?? ''),
      'Validity Status': v || 'Not reviewed',
      'Automation Status': automation,
      'Feature File': [...new Set(scs.map((s) => `${s.file}:${s.line}`))].join('\n'),
      'Scenario Name': scs.map((s) => s.name).join('\n'),
      'Last Result': last || (auto.length ? 'Not run' : ''),
      'Last Run Date': lastDate,
      'Failure Category': cat,
      'Linked Defect': bugsFor(c.id),
      Remarks: remarks.join('\n'),
    });
  }

  // scenarios whose TC ID is not in source
  for (const [k, scs] of scenariosById) {
    if (sourceIds.has(k)) continue;
    const id = testCaseIdsFromTags(scs[0].tags).find((x) => norm(x) === k) ?? k;
    for (const s of scs) flags.push(['Scenario TC ID not in source', id, `${s.file}:${s.line}`, s.name]);
    const rs = resultsById.get(k) ?? [];
    rows.push({
      'Original TC ID': id, Title: '', 'Source File': 'NOT IN SOURCE', Platform: scs[0].type, 'Validity Status': '',
      'Automation Status': 'Automated', 'Feature File': scs.map((s) => `${s.file}:${s.line}`).join('\n'),
      'Scenario Name': scs.map((s) => s.name).join('\n'),
      'Last Result': rs.length ? rs.map(excelStatus).sort((a, b) => SEVERITY[b] - SEVERITY[a])[0] : '',
      'Last Run Date': rs.length ? new Date(Math.max(...rs.map((r) => r.stop || r.start))).toISOString().slice(0, 16).replace('T', ' ') : '',
      'Failure Category': '',
      'Linked Defect': bugsFor(id), Remarks: 'TC ID does not exist in any source file',
    });
  }

  /* ---------------------------- summary ---------------------------- */
  const modules = new Map<string, string>(); // tc -> module (source column, else module tag)
  const moduleTagsByTc = new Map<string, string>();
  for (const sc of scenarios) {
    const mod = sc.tags.find((t) => !/^@(web|mobile|api|smoke|regression|critical|high|medium|low|android|ios|chromium|firefox|webkit|manual|quarantine|wip)$/i.test(t) && !t.includes('=') && !testCaseIdsFromTags([t]).length);
    if (mod) for (const id of testCaseIdsFromTags(sc.tags)) moduleTagsByTc.set(norm(id), mod.slice(1));
  }
  for (const c of cases) modules.set(norm(c.id), c.module || moduleTagsByTc.get(norm(c.id)) || '(no module)');

  type Agg = { total: number; automated: number; notStarted: number; notAutomatable: number; invalid: number; pass: number; fail: number; blocked: number };
  const agg = new Map<string, Agg>();
  for (const r of rows.filter((x) => x['Source File'] !== 'NOT IN SOURCE')) {
    const k = `${r.Platform || '(unknown)'}|${modules.get(norm(r['Original TC ID'])) ?? '(no module)'}`;
    const a = agg.get(k) ?? { total: 0, automated: 0, notStarted: 0, notAutomatable: 0, invalid: 0, pass: 0, fail: 0, blocked: 0 };
    a.total++;
    if (r['Automation Status'] === 'Automated') a.automated++;
    if (r['Automation Status'] === 'Not Started') a.notStarted++;
    if (r['Automation Status'] === 'Not Automatable') a.notAutomatable++;
    if (r['Automation Status'] === 'Invalid') a.invalid++;
    if (r['Last Result'] === 'PASS') a.pass++;
    if (r['Last Result'] === 'FAIL') a.fail++;
    if (r['Last Result'] === 'BLOCKED') a.blocked++;
    agg.set(k, a);
  }
  const coverage = (a: Agg) => {
    const automatable = a.total - a.notAutomatable - a.invalid;
    return automatable > 0 ? `${((a.automated / automatable) * 100).toFixed(0)}%` : 'n/a';
  };

  /* ----------------------------- write ----------------------------- */
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Matrix', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = COLUMNS.map((h) => ({ header: h, width: ['Remarks', 'Feature File', 'Scenario Name', 'Title'].includes(h) ? 40 : 18 }));
  ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF37474F' } };
  ws.autoFilter = { from: 'A1', to: 'M1' };
  const color: Record<string, string> = { PASS: 'FFC6EFCE', FAIL: 'FFFFC7CE', BLOCKED: 'FFFFEB9C' };
  for (const r of rows) {
    const row = ws.addRow(COLUMNS.map((c) => r[c]));
    row.alignment = { wrapText: true, vertical: 'top' };
    const lr = color[r['Last Result']];
    if (lr) row.getCell(9).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: lr } };
  }

  const fl = wb.addWorksheet('Flags');
  fl.columns = [{ header: 'Flag', width: 32 }, { header: 'TC ID', width: 18 }, { header: 'Where', width: 50 }, { header: 'Detail', width: 50 }];
  fl.getRow(1).font = { bold: true };
  flags.forEach((f) => fl.addRow(f));

  const sm = wb.addWorksheet('Summary');
  sm.columns = ['Platform', 'Module', 'Total', 'Automated', 'Not Started', 'Not Automatable', 'Invalid', 'Coverage (automatable)', 'Last PASS', 'Last FAIL', 'Last BLOCKED']
    .map((h) => ({ header: h, width: h === 'Module' ? 28 : 16 }));
  sm.getRow(1).font = { bold: true };
  for (const [k, a] of [...agg].sort()) {
    const [platform, module] = k.split('|');
    sm.addRow([platform, module, a.total, a.automated, a.notStarted, a.notAutomatable, a.invalid, coverage(a), a.pass, a.fail, a.blocked]);
  }
  if (unparsed.length) {
    sm.addRow([]);
    sm.addRow(['Not included (not a spreadsheet — analyse via the test case review):']).font = { italic: true };
    unparsed.forEach((u) => sm.addRow([u]));
  }

  const dir = path.join(paths.reports, 'traceability');
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `traceability_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.xlsx`);
  await wb.xlsx.writeFile(out);

  /* ---------------------------- console ---------------------------- */
  console.log(`\nTraceability matrix: ${path.relative(paths.root, out)}`);
  console.log(`Source cases ${cases.length} · scenarios ${scenarios.length} · flags ${flags.length}${unparsed.length ? ` · ${unparsed.length} non-spreadsheet file(s) not included` : ''}`);
  if (agg.size) {
    console.log('\nCoverage by platform / module');
    for (const [k, a] of [...agg].sort()) {
      const [platform, module] = k.split('|');
      console.log(`  ${platform.padEnd(8)} ${module.padEnd(24)} automated ${a.automated}/${a.total} (coverage ${coverage(a)}) · not started ${a.notStarted} · not automatable ${a.notAutomatable} · invalid ${a.invalid} · last: ${a.pass} pass / ${a.fail} fail / ${a.blocked} blocked`);
    }
  }
  const notInSource = flags.filter((f) => f[0] === 'Scenario TC ID not in source');
  if (notInSource.length) console.log(`\n! ${notInSource.length} scenario(s) reference a TC ID that is not in source: ${[...new Set(notInSource.map((f) => f[1]))].join(', ')}`);
  console.log('');
}

main().catch((e) => {
  console.error(`Traceability failed: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
