/**
 * Failure categories and Excel mapping — from the failure-classification skill.
 * statusOverride: Excel status for that category (default FAIL).
 */
export const FAILURE_CATEGORIES: { name: string; statusOverride?: 'BLOCKED' }[] = [
  { name: 'PRODUCT DEFECT' },
  { name: 'SCRIPT DEFECT' },
  { name: 'ENVIRONMENT', statusOverride: 'BLOCKED' },
  { name: 'TEST DATA', statusOverride: 'BLOCKED' },
  { name: 'FLAKY' },
  { name: 'INVALID TEST CASE', statusOverride: 'BLOCKED' }, // "BLOCKED with remark (until an INVALID status is added)"
  { name: 'Unclassified – needs manual check' }, // result-verifier: evidence insufficient
];

const key = (s: string) => s.toLowerCase().replace(/[^a-z]+/g, ' ').trim();
export const findCategory = (name: string) => FAILURE_CATEGORIES.find((c) => key(c.name) === key(name));
