# source/ — Original Test Cases (read-only)

Put your original test case files here. **The framework never modifies these files.**
The Excel update writes a copy to `reports/excel/` instead.

| Folder | Put here |
|---|---|
| `web/` | Web test cases |
| `mobile/` | Mobile (Android / iOS) test cases |
| `api/` | API test cases |
| `test-cases/` | Shared or mixed files |

Supported formats: `.xlsx`, `.xlsm`, `.csv` (analysis + status update); `.docx`, `.pdf`, `.md`, `.txt` (analysis only).

## Traceability
Every automated scenario is tagged with the original ID, either as `@TC-LOGIN-001` (when it starts with a `TC_ID_PREFIXES` prefix, default `TC`) or as `@id=<ID>` for any ID format.
Allure shows this as the `testCaseId` label, and the Excel update uses it to find the row.
