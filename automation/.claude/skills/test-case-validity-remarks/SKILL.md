---
name: test-case-validity-remarks
description: Use when analyzing original test cases in source/ before automation, or when a test cannot be executed as written. Classifies each case and writes a clear, evidence-based remark with a suggested fix into a review copy. Never edits the original file. Trigger on "analyze test cases", "invalid test case", "remarks", "review test cases", "can't automate this".
---

# Test Case Validity & Remarks

## Classification
- VALID: clear steps, verifiable expected result, test data available.
- INVALID – Incomplete: missing steps, preconditions, test data, or expected result.
- INVALID – Ambiguous: expected result cannot be verified ("works properly", "looks good", "fast").
- INVALID – Contradictory: steps or expected result contradict each other or the requirement.
- INVALID – Obsolete: the feature, screen, or flow no longer exists.
- DUPLICATE: same steps and checks as another case (name that case ID).
- NOT AUTOMATABLE: CAPTCHA, physical OTP, hardware action, subjective visual judgment. Recommend manual execution.
- BLOCKED: the case is valid, but environment, access, build, or data is unavailable.
- NEEDS CLARIFICATION: cannot decide without input from the user or business analyst.

## Critical rule
A test that FAILS is not invalid. If the application behaves differently from the expected result, report it as FAIL (possible defect). Mark INVALID only when the test case itself is wrong, and only with evidence (requirement, user confirmation, or internal contradiction).

## Remark format
[STATUS – Category] Problem: <what is wrong, citing the step number>. Evidence: <what shows it>. Suggested fix: <concrete correction>. Reviewed by: <agent/person>, <date>.

## Examples
- Good: [INVALID – Ambiguous] Problem: Step 5 expected result "page loads properly" cannot be verified. Evidence: no element, text, or state is named. Suggested fix: "Dashboard shows the welcome message with the logged-in user's name."
- Good: [DUPLICATE] Problem: same steps and checks as TC-WEB-014. Suggested fix: merge into TC-WEB-014 or add the missing variation.
- Bad: "Invalid test case." (no reason, no fix)
- Bad: "Wrong." (not actionable)

## Output
- Write results to reports/test-case-review/review_{source-file}_{date}.xlsx with columns: TC ID, Title, Status, Category, Remark, Evidence, Suggested Fix, Reviewed By, Date.
- Never modify files in source/.
- Copy remarks into the Excel execution report only when the user gives an update command.
- End with a summary: totals per status and the list of cases needing user input.

## Implementation in this framework

### Workflow
When the read-only `test-analyst` agent does the analysis (qa-workflow), the orchestrator runs steps 1, 3 (saving the agent's JSON) and 4, and the agent does step 2.

1. **Extract (read-only)**: `npm run testcases:extract` (all of `source/`) or `npm run testcases:extract -- source/web/Login.xlsx`.
   - `.xlsx/.xlsm/.csv` → `reports/test-case-review/extracted/<file>.json`: one object per row with every column, sheet and row number.
   - `.docx/.doc/.rtf` → `…/extracted/<file>.txt` (via macOS `textutil`).
   - `.pdf/.md/.txt` → read them directly with the Read tool.
   - legacy `.xls` → ask the user to save it as `.xlsx`.
2. **Analyse** every case against the classification above. Check duplicates across all files, not just within one sheet.
   Cite step numbers. Use only the case text, requirements the user supplied, or the user's confirmation as evidence. Never guess.
3. **Record decisions** in `reports/test-case-review/input/<source-file>.review.json`:
   ```json
   {
     "sourceFile": "source/web/Login.xlsx",
     "reviewedBy": "Claude (AI reviewer)",
     "date": "2026-11-11",
     "cases": [
       { "id": "TC-001", "title": "Valid login", "status": "VALID" },
       { "id": "TC-002", "title": "Login page", "status": "INVALID", "category": "Ambiguous",
         "problem": "Step 1 expected result \"Page loads properly\" cannot be verified",
         "evidence": "No element, text, or state is named",
         "fix": "\"Login page shows the Username and Password fields and the Sign in button.\"" },
       { "id": "TC-003", "status": "DUPLICATE", "duplicateOf": "TC-001", "problem": "Same steps and checks as TC-001",
         "evidence": "Steps 1-3 and the expected result are identical", "fix": "Merge into TC-001 or add the missing variation" },
       { "id": "TC-004", "status": "NEEDS CLARIFICATION",
         "problem": "Step 2 expected result \"Correct reports are visible\" does not name the reports",
         "question": "Which reports should a manager see?" }
     ]
   }
   ```
   `date` is optional and defaults to today. `category` is only used with INVALID.
4. **Write the review**: `npm run testcases:review -- reports/test-case-review/input/<file>.review.json`
   - It builds the Remark in the exact format above and writes the `Review` and `Summary` sheets.
   - It prints totals per status and the cases needing user input. Repeat that summary to the user at the end.
5. **Ask** the user every NEEDS CLARIFICATION question. When answered, update the JSON (status, evidence "Confirmed by <user>, <date>") and run step 4 again.

### Validation (the writer rejects input that breaks the rules)
- Every non-VALID case needs a `problem` of at least 15 characters. Vague text such as "Invalid test case." or "Wrong." is rejected.
- INVALID needs a `category` (Incomplete | Ambiguous | Contradictory | Obsolete) and `evidence`.
- Every status except VALID and NEEDS CLARIFICATION needs `evidence` and `fix`.
- DUPLICATE needs `duplicateOf`. NEEDS CLARIFICATION needs `question`.

### Into the Excel execution report (only on an update command)
`npm run excel:update*` (see CLAUDE.md) reads the latest `review_<file>_<date>.xlsx` for each source file and appends the remark
to the **Remarks** column of the updated copy (`reports/excel/`). The column is append-only, so existing text is kept.
- **Executed rows:** the review remark is added when the case has a non-VALID review entry.
- **Rows that weren't executed:** only on explicit request ("Update Excel Report … with review remarks" → `-- --include-review`), because the
  report-manager rule is "update only cases covered by the selected execution results".
Remarks never change the execution Status. Never run an update unless the user asks.

### Automating after review
- Automate only VALID cases (and BLOCKED cases once they're unblocked).
- NOT AUTOMATABLE cases are recommended for manual execution. Write no scenario for them.
- INVALID / NEEDS CLARIFICATION cases wait for a corrected case or an answer from the user. Don't write a scenario around a guessed expected result.
