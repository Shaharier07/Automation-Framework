---
name: failure-classification
description: Shared rules for classifying any failed or blocked test result. Used by result-verifier, report-manager, and anyone analyzing failures. Trigger on "why did this fail", "classify failures", "analyze results".
---

# Failure Classification

## Categories
- PRODUCT DEFECT: application behaves differently from a valid expected result, reproducible.
- SCRIPT DEFECT: automation code is wrong (bad locator, wrong assertion, missing step).
- ENVIRONMENT: server down, network, device or browser issue, deployment problem.
- TEST DATA: required data missing, expired, or already used.
- FLAKY: fails and passes on re-run with no code or data change.
- INVALID TEST CASE: the test case itself is wrong (use test-case-validity-remarks).

## Decision order
1. Did it fail before reaching the application? Likely ENVIRONMENT.
2. Is the data missing or wrong? TEST DATA.
3. Does it pass on an isolated re-run? FLAKY.
4. Does the screenshot show the app working correctly but the script failing? SCRIPT DEFECT.
5. Does the app behave against a valid expected result? PRODUCT DEFECT.
6. Is the expected result itself wrong, with evidence? INVALID TEST CASE.

## Excel mapping
- PRODUCT DEFECT, SCRIPT DEFECT, FLAKY: FAIL
- ENVIRONMENT, TEST DATA: BLOCKED
- INVALID TEST CASE: BLOCKED with remark (until an INVALID status is added)

Always record the category and a one-line reason with the result.

## Implementation in this framework
- **Category names** (exact spelling) and the Excel mapping: `config/verification.config.ts`. Also allowed when evidence is insufficient: `Unclassified – needs manual check` (result-verifier), which maps to FAIL.
- **Clues for the decision order:**
  1. **ENVIRONMENT:** `BLOCKED: Appium session could not be created`, `BLOCKED: Missing required variable …`, connection refused or DNS errors, HTTP 5xx from a gateway. These failed before reaching the app.
  2. **TEST DATA:** `BLOCKED: test data … not found`, or the app reports that a record is missing, expired or already used.
  3. **FLAKY:** the isolated re-run (`npm run test:rerun:<type> -- --tags "<TC tag>"`) passes.
  4. **SCRIPT DEFECT:** the annotated screenshot shows the expected state, but the locator or assertion is wrong (`Element not found` on a visible element, a wrong selector, a wrong expected value in code).
  5. **PRODUCT DEFECT:** the screenshot or API response shows behaviour that differs from the original expected result of a VALID case. Draft a bug (skill: bug-report-writer).
  6. **INVALID TEST CASE:** needs evidence per test-case-validity-remarks. Never use it for a behaviour mismatch.
- **Recording:** the result-verifier's JSON is checked by `npm run verification:save`. It enforces known categories, a reason for every row, FLAKY for a fail followed by a passing re-run, and that no failure is left unclassified. The categories then feed:
  - **Excel:** Failure Category, Remarks and the BLOCKED mapping
  - **Execution summary:** failures by category, and flaky
  - **Traceability matrix:** Failure Category
- **Automatic BLOCKED:** a scenario that stops with a message starting `BLOCKED:` is already reported as BLOCKED before verification.
