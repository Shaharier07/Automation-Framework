/**
 * Test case review vocabulary (skill: test-case-validity-remarks).
 */
export const REVIEW_STATUSES = [
  'VALID',
  'INVALID',
  'DUPLICATE',
  'NOT AUTOMATABLE',
  'BLOCKED',
  'NEEDS CLARIFICATION',
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/** Category is required for INVALID only. */
export const INVALID_CATEGORIES = ['Incomplete', 'Ambiguous', 'Contradictory', 'Obsolete'] as const;
export type InvalidCategory = (typeof INVALID_CATEGORIES)[number];

/** Cell fill per status (ARGB). */
export const REVIEW_COLORS: Record<ReviewStatus, string> = {
  VALID: 'FFC6EFCE',
  INVALID: 'FFFFC7CE',
  DUPLICATE: 'FFE1D5F0',
  'NOT AUTOMATABLE': 'FFD9D9D9',
  BLOCKED: 'FFFFEB9C',
  'NEEDS CLARIFICATION': 'FFBDD7EE',
};

/** Remarks that say nothing actionable are rejected. */
export const VAGUE_REMARKS = /^(invalid( test case)?|wrong|bad|not ok|incorrect|n\/?a|error|fix it)\.?$/i;

/** Columns of reports/test-case-review/review_*.xlsx (fixed order). */
export const REVIEW_COLUMNS = ['TC ID', 'Title', 'Status', 'Category', 'Remark', 'Evidence', 'Suggested Fix', 'Reviewed By', 'Date'] as const;
