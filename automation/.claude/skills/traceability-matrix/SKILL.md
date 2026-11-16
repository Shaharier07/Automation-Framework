---
name: traceability-matrix
description: Use when the user asks for coverage, traceability, or "which test cases are automated". Builds a mapping from original test cases to automation and results. Trigger on "traceability", "coverage", "mapping", "what is automated".
---

# Traceability Matrix

## Columns
Original TC ID, Title, Source File, Platform, Validity Status, Automation Status (Automated, Not Started, Not Automatable, Invalid), Feature File, Scenario Name, Last Result, Last Run Date, Failure Category, Linked Defect, Remarks.

## Rules
- Build from the source test cases, validity review, feature file tags, and latest results.
- Flag scenarios whose TC ID does not exist in source, and source cases with no scenario.
- Write to reports/traceability/traceability_{date}.xlsx. Never modify source files.
- End with a coverage summary per platform and module.

## Implementation in this framework
Run **`npm run traceability`**. It reads `source/` without modifying it and writes `reports/traceability/traceability_<yyyyMMdd>.xlsx` with three sheets:
- **Matrix:** the 13 columns above. One row per source case, plus one row per scenario whose TC ID isn't in source ("NOT IN SOURCE").
- **Flags:** source cases with no scenario, and scenario TC IDs that aren't in source.
- **Summary:** per platform and module: total, automated, not started, not automatable, invalid, coverage (automated ÷ automatable), and the last PASS/FAIL/BLOCKED counts.

| Column | Source |
|---|---|
| Title / Module / Platform | source columns (Title/Name/Summary, Module/Feature/Area, Platform), else the `source/<platform>/` folder and the module tag |
| Validity Status | latest `reports/test-case-review/review_<file>_<date>.xlsx` |
| Automation Status | Automated = a non-`@manual` scenario with that TC ID. Not Automatable = review NOT AUTOMATABLE or `@manual` only. Invalid = review INVALID. Otherwise Not Started |
| Feature File / Scenario | feature tags (`utils/features.ts`) |
| Last Result / Date | latest Allure results (worst result across sub-scenarios) |
| Failure Category | latest verification (`reports/verification/`) |
| Linked Defect | `reports/bugs/BUG_<TC>_*.md` |
| Remarks | review remark, plus notes such as "VALID but no scenario yet" |

Word and PDF test cases aren't parsed. They're listed in the Summary sheet as not included. Finish by repeating the console coverage summary and the flag counts to the user.
