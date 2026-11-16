/** Reads the latest test case validity review for a source file (skill: test-case-validity-remarks). */
import fs from 'fs';
import path from 'path';
import { paths } from '../support/config';
import { cellText, norm, readWorkbook } from './excel';
import type { ReviewStatus } from '../config/review.config';

export interface ReviewRow { id: string; status: ReviewStatus; category: string; remark: string }
export const REVIEW_DIR = path.join(paths.reports, 'test-case-review');

/** Latest review_<base>_<yyyyMMdd>.xlsx for a source file -> rows by normalised ID. */
export async function loadReview(sourceFile: string): Promise<{ file: string; rows: Map<string, ReviewRow> } | null> {
  if (!fs.existsSync(REVIEW_DIR)) return null;
  const base = path.basename(sourceFile, path.extname(sourceFile));
  const latest = fs.readdirSync(REVIEW_DIR).filter((f) => f.startsWith(`review_${base}_`) && /_\d{8}\.xlsx$/.test(f)).sort().pop();
  if (!latest) return null;
  const ws = (await readWorkbook(path.join(REVIEW_DIR, latest))).getWorksheet('Review');
  if (!ws) return null;
  const col = (name: string) => {
    let found = 0;
    ws.getRow(1).eachCell((c, i) => { if (norm(cellText(c.value)) === norm(name)) found = i; });
    return found;
  };
  const [idC, stC, catC, rmC] = [col('TC ID'), col('Status'), col('Category'), col('Remark')];
  const rows = new Map<string, ReviewRow>();
  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const id = cellText(row.getCell(idC).value).trim();
    if (!id) continue;
    rows.set(norm(id), {
      id,
      status: cellText(row.getCell(stC).value).trim() as ReviewStatus,
      category: catC ? cellText(row.getCell(catC).value).trim() : '',
      remark: cellText(row.getCell(rmC).value),
    });
  }
  return { file: latest, rows };
}
