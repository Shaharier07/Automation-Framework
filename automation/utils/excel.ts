/** Shared, read-only Excel helpers (header detection, cell text). Used by the Excel update and test case review scripts. */
import ExcelJS from 'exceljs';
import { excelConfig } from '../config/excel.config';

/** Case/space/underscore/dash-insensitive key for IDs and headers. */
export const norm = (s: unknown): string => String(s ?? '').toLowerCase().replace(/[\s_-]+/g, ' ').trim();

export function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return String(v.text);
    if ('result' in v) return String(v.result ?? '');
    if ('error' in v) return String(v.error);
  }
  return String(v);
}

/** Finds the header row by the test case ID column (aliases in config/excel.config.ts). */
export function findHeader(ws: ExcelJS.Worksheet): { row: number; idCol: number } | null {
  const max = Math.min(ws.rowCount, excelConfig.headerScanRows);
  for (const alias of excelConfig.idHeaders) {
    for (let r = 1; r <= max; r++) {
      const row = ws.getRow(r);
      for (let c = 1; c <= row.cellCount; c++) {
        if (norm(cellText(row.getCell(c).value)) === norm(alias)) return { row: r, idCol: c };
      }
    }
  }
  return null;
}

export async function readWorkbook(file: string): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  if (/\.csv$/i.test(file)) await wb.csv.readFile(file);
  else await wb.xlsx.readFile(file);
  return wb;
}
