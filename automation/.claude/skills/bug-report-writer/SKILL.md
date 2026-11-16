---
name: bug-report-writer
description: Use when a verified Product Defect needs a bug report, or when the user asks to "write a bug", "log a defect", or "create a bug report". Produces a complete, reproducible defect report with evidence.
---

# Bug Report Writer

## Required fields
- Title: [Module] Short description of the wrong behavior (under 80 characters)
- Test Case ID and scenario name
- Environment: environment name, build/version, browser/device, OS, resolution
- Preconditions
- Steps to reproduce (numbered, minimal)
- Expected result (from the original test case)
- Actual result (observed)
- Severity: Critical, Major, Minor, Trivial
- Priority: High, Medium, Low
- Reproducibility: Always, Intermittent (x of y runs), Once
- Evidence: annotated screenshot, video, logs, API request/response
- Notes: workaround, related defects

## Severity guide
- Critical: crash, data loss, security issue, core flow fully blocked
- Major: key feature broken, no reasonable workaround
- Minor: feature works with a workaround or small deviation
- Trivial: cosmetic or text issue

## Rules
- One defect per report.
- Facts only; no blame and no guessed root cause.
- Remove any secrets or personal data from evidence.
- Check for an existing report of the same defect before writing a new one.

## Implementation in this framework
- **Location:** `reports/bugs/BUG_<TC-ID>_<yyyyMMdd>[_n].md`, one file per defect. Drafts are only written here. Nothing is filed in an external tracker unless the user asks.
- **Check for an existing report:** `Grep` in `reports/bugs/` for the TC ID and the key words of the title before creating a new file. If one exists, add the new occurrence under its Notes instead.
- **Where to find each field:**
  | Field | Source |
  |---|---|
  | Expected | original test case (`reports/test-case-review/extracted/`), word for word |
  | Actual / Evidence | result-verifier table, annotated screenshot (`screenshots/annotated/...`), Allure attachments (HTTP request/response for API) |
  | Environment | banner Env line, `reports/allure-results/<type>/environment.properties`, `.env` (`TEST_ENV`, `BROWSER`, device). The build/version comes from the user. Ask if unknown. |
  | Reproducibility | first run + isolated re-run: failed both → Always; failed once → Intermittent (1 of 2 runs) |
- **Evidence safety:** annotated screenshots are already masked (skill: screenshot-annotation). In API attachments, auth headers are masked. Also remove tokens, passwords and personal data from any pasted bodies or logs.
- **Template:**
  ```markdown
  # [Module] <short description>
  | Field | Value |
  |---|---|
  | Test case | TC-… — <scenario name> |
  | Environment | <env> · build <version> · <browser/device> · <OS> · <resolution> |
  | Severity / Priority | Major / High |
  | Reproducibility | Always (2 of 2 runs) |

  ## Preconditions
  ## Steps to reproduce
  1. …
  ## Expected result
  ## Actual result
  ## Evidence
  - screenshots/annotated/web/TC-…_annotated.png
  ## Notes
  ```
