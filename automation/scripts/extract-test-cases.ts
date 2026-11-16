#!/usr/bin/env tsx
/**
 * READ-ONLY extraction of original test cases for analysis (skill: test-case-validity-remarks).
 * Never writes to source/.
 *
 *   tsx scripts/extract-test-cases.ts [file ...]        (default: every file under source/)
 *
 * Output: reports/test-case-review/extracted/<file>.json   (.xlsx/.xlsm/.csv — one object per row, all columns kept)
 *         reports/test-case-review/extracted/<file>.txt    (.docx/.doc/.rtf via macOS textutil)
 * PDFs and .md/.txt files are read directly by the reviewer; they are listed but not converted.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { paths } from '../support/config';
import { cellText, findHeader, readWorkbook } from '../utils/excel';
import { listFiles } from './lib';

const OUT = path.join(paths.reports, 'test-case-review', 'extracted');

interface ExtractedCase {
  sheet: string;
  row: number;
  id: string;
  fields: Record<string, string>;
}

async function extractSheetFile(file: string): Promise<string> {
  const wb = await readWorkbook(file);
  const cases: ExtractedCase[] = [];
  const skipped: string[] = [];

  for (const ws of wb.worksheets) {
    const header = findHeader(ws);
    if (!header) {
      skipped.push(ws.name);
      continue;
    }
    const headers: Record<number, string> = {};
    ws.getRow(header.row).eachCell({ includeEmpty: false }, (c, col) => (headers[col] = cellText(c.value).trim()));

    for (let r = header.row + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const id = cellText(row.getCell(header.idCol).value).trim();
      const fields: Record<string, string> = {};
      for (const [col, name] of Object.entries(headers)) {
        const v = cellText(row.getCell(Number(col)).value).trim();
        if (v) fields[name || `Column ${col}`] = v;
      }
      if (!id && Object.keys(fields).length === 0) continue; // blank row
      cases.push({ sheet: ws.name, row: r, id, fields });
    }
  }

  const out = path.join(OUT, `${path.basename(file)}.json`);
  fs.writeFileSync(out, JSON.stringify({ sourceFile: path.relative(paths.root, file), extractedAt: new Date().toISOString(), skippedSheets: skipped, cases }, null, 2));
  const noId = cases.filter((c) => !c.id).length;
  return `${cases.length} row(s)${noId ? `, ${noId} without ID` : ''}${skipped.length ? `, sheets without an ID header: ${skipped.join(', ')}` : ''} -> ${path.relative(paths.root, out)}`;
}

function extractDoc(file: string): string {
  if (process.platform !== 'darwin') return 'Word conversion needs macOS textutil — open the file and paste its text, or save as PDF';
  const out = path.join(OUT, `${path.basename(file)}.txt`);
  const r = spawnSync('textutil', ['-convert', 'txt', '-output', out, file], { encoding: 'utf8' });
  return r.status === 0 ? `text -> ${path.relative(paths.root, out)}` : `conversion failed: ${r.stderr.trim()}`;
}

async function main() {
  const args = process.argv.slice(2);
  const files = args.length
    ? args.map((f) => path.resolve(f))
    : listFiles(paths.source, (n) => !n.startsWith('.') && !n.startsWith('~$') && n !== 'README.md');
  if (files.length === 0) {
    console.log('No test case files in source/. Add your files first.');
    return;
  }
  fs.mkdirSync(OUT, { recursive: true });

  for (const file of files) {
    const rel = path.relative(paths.root, file);
    const ext = path.extname(file).toLowerCase();
    let msg: string;
    if (['.xlsx', '.xlsm', '.csv'].includes(ext)) msg = await extractSheetFile(file);
    else if (['.docx', '.doc', '.rtf'].includes(ext)) msg = extractDoc(file);
    else if (['.pdf', '.md', '.txt'].includes(ext)) msg = 'read directly';
    else if (ext === '.xls') msg = 'legacy .xls is not supported — save a copy as .xlsx';
    else msg = 'unsupported format';
    console.log(`  ${rel}: ${msg}`);
  }
}

main().catch((e) => {
  console.error(`Extraction failed: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
