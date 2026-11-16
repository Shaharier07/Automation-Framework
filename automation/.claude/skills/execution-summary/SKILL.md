---
name: execution-summary
description: Use after every test execution or when the user asks "how did the run go" or "summary". Produces a short, decision-ready summary of results. Trigger on "summary", "results", "how many failed".
---

# Execution Summary

## Include
- Run info: suite, platform, environment, date and time, duration
- Totals: passed, failed, blocked, skipped, pass rate
- Comparison with previous run: new failures, newly fixed, still failing
- Failures by category (from failure-classification)
- Flaky tests detected
- Top items needing attention, in priority order, with TC IDs
- Links to the Allure report and evidence folder

## Rules
- Keep it short enough to read in one minute.
- Facts only; mark anything unverified as such.
- Never say "all passed" if any tests were skipped or blocked; state those counts.

## Implementation in this framework
- **Automatic:** every `npm run test:*` run (except isolated re-runs) saves a snapshot to `reports/history/run_<time>.json`, then prints the summary and saves it to `reports/summary/summary_<time>.md`.
- **On demand:** `npm run summary` regenerates it. Run it after the result-verifier, so the categories and flaky list are filled in.
- **What it contains:**
  - Run info: target, browser or platform/device, `TEST_ENV`, start time, duration.
  - Totals: blocked = a `BLOCKED:` stop, or a category that maps to BLOCKED (ENVIRONMENT, TEST DATA, INVALID TEST CASE).
  - Comparison: the previous run of the same suite (new failures, newly fixed, still failing, new scenarios).
  - Categories and flaky: from the latest verification, but only if it was made after this run. Otherwise it says "not yet verified".
  - Attention list: sorted by priority tag (critical → low), then category (product defects first). Top 5.
  - Links: the Allure report path, or the command to generate it, and the evidence folder.
- **The headline says "All N scenario(s) passed" only** when failed, blocked and skipped are all 0. Otherwise it states every count.
- When reporting to the user, paste the summary as is. Don't round or reinterpret the numbers.
