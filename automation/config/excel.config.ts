/**
 * Excel test-case update settings.
 * Header matching is case/space-insensitive. Add aliases if your sheets use other column names.
 */
export const excelConfig = {
  /** Header names that identify the test case ID column (first match wins). */
  idHeaders: ['test case id', 'testcase id', 'tc id', 'tc_id', 'tcid', 'test id', 'case id', 'id'],

  /**
   * Result columns. If a column with one of the aliases exists it is reused,
   * otherwise a new column is appended with the first name.
   */
  resultColumns: {
    status: ['Execution Status', 'Status', 'Test Status', 'Result'],
    actualResult: ['Actual Result', 'Actual Results', 'Actual Outcome'],
    executionDate: ['Execution Date', 'Executed On', 'Test Date'],
    failureDetails: ['Failure Details', 'Failure Reason', 'Defect Details'],
    automationRef: ['Automation Scenario', 'Automation Reference', 'Automated Scenario'],
    failureCategory: ['Failure Category', 'Defect Category', 'Failure Type'],
    /** Append-only: existing text in a Remarks cell is kept and new remarks are added below it. */
    remarks: ['Remarks', 'Remark', 'Comments'],
  },

  /** How many rows from the top to scan for the header row. */
  headerScanRows: 25,

  /** Allure status -> Excel status. */
  statusMap: {
    passed: 'PASS',
    failed: 'FAIL',
    broken: 'FAIL',
    skipped: 'BLOCKED',
    unknown: 'BLOCKED',
  } as Record<string, 'PASS' | 'FAIL' | 'BLOCKED'>,

  /** Cell fill colours (ARGB). */
  statusColors: { PASS: 'FFC6EFCE', FAIL: 'FFFFC7CE', BLOCKED: 'FFFFEB9C' } as Record<string, string>,

  // Test case ID tags (@id=… / @TC-…) are defined in config/traceability.config.ts
};
