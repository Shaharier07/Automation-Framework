---
name: test-case-to-gherkin
description: Use when converting a manual test case into a Cucumber feature file scenario. Keeps traceability, readability, and step reuse. Trigger on "convert test case", "write feature file", "gherkin", "BDD scenario".
---

# Test Case to Gherkin

## Procedure
1. Confirm the case is VALID in the validity review.
2. Search existing step definitions for reusable steps before writing new ones.
3. Map: preconditions to Given, actions to When, expected results to Then.
4. Add tags: original TC ID, platform, module, suite (smoke/regression), priority.
5. Use Scenario Outline with Examples when the case repeats with different data.
6. Put shared preconditions in Background only when every scenario in the file needs them.

## Writing rules
- Write in business language, not technical details ("When the user submits the login form", not "When I click #btn-submit").
- One behavior per scenario.
- Every Then must be verifiable and specific.
- Keep scenarios under about 10 steps; split if longer.
- Keep the original test case title as the scenario name, with the TC ID.
- One feature file per module per platform.

## Traceability
- Every scenario maps to exactly one original test case ID.
- If one test case needs several scenarios, suffix them (TC-WEB-012-a, -b) and note it.

## Implementation in this framework
- **Validity:** check the status in `reports/test-case-review/review_<file>_<date>.xlsx` (or the `.review.json` input).
- **Search steps first:** `Grep` for `Given(`/`When(`/`Then(` in `step-definitions/`, or run `npx cucumber-js --profile web --dry-run` to see which steps already exist and which are undefined.
- **Files:** `features/web/<module>.feature`, `features/mobile/<module>.feature`. API cases go to Karate: `features/api/<module>.feature`.
- **Tags** (skill: tagging-and-suites; feature-level tags apply to every scenario in the file):
  ```gherkin
  @web @login
  Feature: Login

    @TC-WEB-012 @smoke @regression @critical
    Scenario: TC-WEB-012 Valid user can log in
      Given the user is on the login page
      When the user signs in as "validUser"
      Then the dashboard shows the welcome message for the user

    @TC-WEB-013-a @regression @medium
    Scenario Outline: TC-WEB-013-a Login is rejected for <case>
      Given the user is on the login page
      When the user signs in as "<user>"
      Then the error message "<message>" is shown
      Examples:
        | case           | user              | message                      |
        | wrong password | wrongPasswordUser | Invalid username or password |
  ```
  - TC ID: `@TC-…` (prefixes in `TC_ID_PREFIXES`) or `@id=<ID>`. A suffix `-a`, `-b` … is a sub-scenario of the base ID, so Excel, Allure and traceability roll it up to `TC-WEB-013` (worst result wins).
  - Platform `@web` / `@mobile` / `@api`, a module (listed in the README tag list), a suite `@smoke` / `@regression`, and exactly one priority `@critical` / `@high` / `@medium` / `@low`. Checked by `npm run check:tags`.
  - Examples reference data **keys** (`validUser`), which the steps resolve with `dataFor()` (skill: test-data-management).
- **Data in Examples:** use non-secret values only. Credentials come from `.env` or `test-data/` (skills secrets-and-env-handling / test-data-management).
- **Then steps** call `this.expected('<original expected result>')` so the failure evidence quotes the test case (skill: screenshot-annotation).
