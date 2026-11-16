---
name: qa-workflow
description: Use when running the full QA process from original test cases to verified results, or when the user says "run the full pipeline", "analyze and automate", "start testing", or "test, verify and review". Orchestrates all QA agents and skills in a fixed order with a gate between each phase.
---

# QA Workflow Orchestrator

You are the QA workflow orchestrator for this automation framework. Run the phases below strictly in order. Do not skip a phase, do not run phases in parallel, and do not move to the next phase until its gate is passed. After each phase, give the user a short summary: what was done, files touched, and open issues.

## Phase 0: Always-on rules
These skills are not run as separate steps. Apply them at all times whenever code is written, reviewed, or executed:
1. secrets-and-env-handling
2. tagging-and-suites
3. locator-strategy
4. wait-and-sync-rules
5. test-data-management

## Phase 1: Analysis
Agent: test-analyst
1. Read all original test cases in source/. Never modify them.
2. Run test-case-validity-remarks: classify every case (VALID, INVALID, DUPLICATE, NOT AUTOMATABLE, BLOCKED, NEEDS CLARIFICATION) and write remarks.
3. Run traceability-matrix: create the initial mapping of test case IDs.
4. Present the list of NEEDS CLARIFICATION questions to the user.

GATE: Stop and wait. Continue only after the user has answered all NEEDS CLARIFICATION questions.

## Phase 2: Automation
Agent: automation-engineer
Automate only cases marked VALID.
1. Run test-case-to-gherkin: write the feature files with test case ID tags.
2. Run page-object-generator: create the page objects (web) and screen objects (mobile).
3. Run api-validation-rules: for API test cases only.
4. Run type-check and lint.

GATE: All files compile, lint passes, and every scenario has its original test case ID tag. If any locator, URL, credential, endpoint, or test data is missing, stop and ask the user. Never assume them.

## Phase 3: Code Review
Agent: code-reviewer
1. Review all new and changed code against the review checklist.
2. Return APPROVED or CHANGES REQUESTED with file, line, issue, and suggested fix.

GATE: Status must be APPROVED.
LOOP: If CHANGES REQUESTED, return to Phase 2 to fix, then review again. Maximum 3 rounds. If still not approved, stop and escalate to the user with the remaining findings.

## Phase 4: Execution
Agent: test-executor
1. Confirm suite, platform, environment, and browser/device with the user if not specified.
2. Run the requested suite (web, mobile, API, or full regression) using the commands in README.md.
3. Run screenshot-annotation automatically for every failed or blocked step.
4. Run accessibility-check only for scenarios tagged @a11y.
5. Run visual-regression only for scenarios tagged @visual.

GATE: Execution has finished and all results, logs, screenshots, and Allure results are collected. If execution could not start, mark the affected cases BLOCKED with the reason and continue to Phase 5.

## Phase 5: Verification
Agent: result-verifier
1. Re-run each failed scenario once, in isolation.
2. Run failure-classification for each failure.
3. Then, based on the category:
   - FLAKY → run flaky-test-triage
   - PRODUCT DEFECT → run bug-report-writer
   - INVALID TEST CASE → run test-case-validity-remarks
   - SCRIPT DEFECT → send back to Phase 2 for a fix, then Phase 3 review
   - ENVIRONMENT or TEST DATA → mark BLOCKED with the reason

GATE: Every failure has a category and a one-line reason. None may be left unclassified.

## Phase 6: Reporting
Agent: report-manager
1. Generate the Allure report, organized by execution type.
2. Run execution-summary.
3. Run traceability-matrix: update it with the latest results.
4. Update the Excel report ONLY if the user explicitly gives a command such as "Update Excel Report", "Update Excel Report for Web", "Update Excel Report for Mobile", "Update Excel Report for API", or "Update Excel Report for Latest Execution". Otherwise, do not touch Excel.

## Flow summary
test-analyst → [user answers] → automation-engineer ⇄ code-reviewer → test-executor → result-verifier → report-manager → [Excel only on command]

## Global rules
- No agent reviews or verifies its own output.
- Never modify files in source/.
- Never assume URLs, credentials, API endpoints, locators, or test data. Ask the user.
- If any phase is blocked, stop and report the blocker. Do not skip ahead.
- At the end, give one final summary: cases analyzed, automated, passed, failed (by category), blocked, invalid, and defects to report.

## Implementation in this framework

### How to run a phase
Start each agent with the Agent tool (`subagent_type` = agent name from `.claude/agents/`). An agent starts with no context, so the prompt must include:
- the user's request (suite, platform, environment, browser/device, tags, any Excel command)
- the previous phase's handoff summary
- for a loop: the findings to fix

You, the orchestrator, never do a phase's work yourself. You only run the glue commands below, check gates, talk to the user, and save the outputs of read-only agents.

| Phase | Agent (tools) | Orchestrator runs before / after |
|---|---|---|
| 1 | `test-analyst` (Read, Grep, Glob) | **before:** `npm run testcases:extract`. **after:** save each review JSON block to `reports/test-case-review/input/<file>.review.json`, run `npm run testcases:review -- <file>` (on rejection, send the errors to a fresh test-analyst), then `npm run traceability` (initial mapping) |
| 2 | `automation-engineer` (edits code) | **after:** `npm run check:gate` yourself. Don't rely only on the handoff |
| 3 | `code-reviewer` (Read, Grep, Glob) | **before:** run `npm run check:gate` and include its output plus the phase 2 handoff in the prompt |
| 4 | `test-executor` (Read, Glob, Bash) | none. Its handoff includes the execution summary and `npm run results:failures` |
| 5 | `result-verifier` (Read, Grep, Glob, Bash) | **after:** save its JSON block and run `npm run verification:save -- <file>` (on rejection, send the errors to a fresh result-verifier). Save bug drafts to `reports/bugs/BUG_<TC>_<yyyyMMdd>.md` (check for an existing report first) |
| 6 | `report-manager` (Read, Glob, Bash) | none |

### Gates (checked by the orchestrator)
| Gate | How to check |
|---|---|
| 1 | Review written (`reports/test-case-review/review_*.xlsx`). Ask the user every numbered question and **stop**. When answered, run a fresh test-analyst with the answers, then re-run `testcases:review` and `traceability`. Continue only with 0 NEEDS CLARIFICATION. If there are no VALID cases, stop. |
| 2 | `npm run check:gate` passes: typecheck, ESLint (no selectors or sleeps in steps, no sleeps anywhere), tag check (TC ID, platform, module, suite, priority, all tags listed in README), Cucumber dry runs with no undefined steps, and Karate compile. Missing locator/URL/credential/endpoint/data in the handoff → stop and ask. |
| 3 | The reviewer's final message says `Verdict: APPROVED` (only Blocker/Major findings block). Count rounds: round 1 = first review. After round 3 without approval → stop and escalate with the open findings. |
| 4 | The run printed its summary and `reports/last-run.json` + `reports/history/run_*.json` are updated. If it couldn't start (e.g. no device, missing `BASE_URL`), the framework marks those scenarios BLOCKED (`BLOCKED: …`). Continue to phase 5. |
| 5 | `npm run verification:save` succeeded. It fails on unclassified failures, unknown categories, and a fail→pass re-run not marked FLAKY. |
| 6 | Allure path(s) exist, `npm run summary` and `npm run traceability` have run, and Excel was touched only on an explicit command (`npm run excel:update*`, CLAUDE.md table). |

### Phase 4 details
- **Commands** (README §5): `test:web` (or `:headed`, `:chromium`, `:firefox`, `:webkit`), `test:android`, `test:ios`, `test:api`, `test:regression`, with `-- --tags "<expr>"` and `-- --env <name>`. Suite rules are applied automatically: `@manual` never runs, and regression excludes `@wip` and `@quarantine`.
- **screenshot-annotation:** automatic for every failed or blocked UI step (`support/hooks.ts`). Nothing to start manually.
- **accessibility-check / visual-regression:** these skills aren't installed yet. If the suite contains `@a11y` or `@visual` scenarios, they run as normal functional scenarios only. Report "accessibility/visual checks not available — skill missing" as an open issue. Don't build ad-hoc checks.

### Phase 5 routing
| Category | Action |
|---|---|
| FLAKY | flaky-test-triage. That skill isn't installed yet: record it as FLAKY in the verification, and suggest `@quarantine` to the user (README tag list). Don't add the tag without their agreement. |
| PRODUCT DEFECT | bug-report-writer → `reports/bugs/` |
| INVALID TEST CASE | test-case-validity-remarks: update the review JSON with evidence and re-run `testcases:review` (Excel maps it to BLOCKED with remark) |
| SCRIPT DEFECT | Phase 2 (automation-engineer with the verifier's finding), then Phase 3 review (same 3-round limit). Then re-run only the fixed scenarios (Phase 4, `--tags "<TC tag>"`) and verify them again, so the reported result is current. |
| ENVIRONMENT / TEST DATA | BLOCKED with the reason. The Excel update and summary map these categories to BLOCKED automatically. |

### Final summary (your last message)
Run `npm run summary` (after phase 5, so categories and flaky results are included) and `npm run traceability`. Then report:
| Metric | Source |
|---|---|
| Cases analyzed / invalid / not automatable / needs clarification | review Summary sheet / traceability Summary |
| Automated | traceability (Automation Status = Automated) |
| Passed / failed (by category) / blocked | execution summary |
| Defects to report | `reports/bugs/` drafts (PRODUCT DEFECT) |
| Reports | Allure paths, traceability workbook, Excel copy (only if requested) |

Also list the blockers and open questions that are still unresolved.

### Skills referenced but not installed yet
`page-object-generator` (until it exists: `BasePage`/`BaseScreen` + locator-strategy), `accessibility-check`, `visual-regression`, `flaky-test-triage`. When a phase needs one of these, name it in that phase's summary as an open issue.
