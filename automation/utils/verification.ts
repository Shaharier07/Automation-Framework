/** Reads the latest result-verifier output (reports/verification/verification_*.json). */
import fs from 'fs';
import path from 'path';
import { paths } from '../support/config';
import { norm } from './excel';
import { baseTestCaseId } from '../config/traceability.config';

export interface VerificationEntry {
  tcId: string;
  scenario: string;
  type?: string;
  firstResult: string;
  rerunResult: string;
  category: string;
  reason: string;
  evidence?: string;
  action: string;
}

export interface VerificationFile {
  verifiedBy: string;
  generatedAt: string;
  types: string[];
  results: VerificationEntry[];
}

export const VERIFICATION_DIR = path.join(paths.reports, 'verification');

export function latestVerification(): { file: string; data: VerificationFile } | null {
  if (!fs.existsSync(VERIFICATION_DIR)) return null;
  const latest = fs.readdirSync(VERIFICATION_DIR).filter((f) => /^verification_\d{8}-\d{6}\.json$/.test(f)).sort().pop();
  if (!latest) return null;
  return { file: latest, data: JSON.parse(fs.readFileSync(path.join(VERIFICATION_DIR, latest), 'utf8')) };
}

/** Verification entries keyed by normalised original test case ID (sub-scenario suffixes rolled up). */
export function verificationByTestCase(): { file: string; byId: Map<string, VerificationEntry[]> } | null {
  const v = latestVerification();
  if (!v) return null;
  const byId = new Map<string, VerificationEntry[]>();
  for (const e of v.data.results) {
    for (const id of e.tcId.split(',').map((s) => baseTestCaseId(s.trim().replace(/^@(id=)?/i, '')))) {
      const k = norm(id);
      byId.set(k, [...(byId.get(k) ?? []), e]);
    }
  }
  return { file: v.file, byId };
}
