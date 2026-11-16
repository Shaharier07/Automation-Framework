# Automation framework — working rules for Claude

- `source/` holds the user's ORIGINAL test cases. Never edit, move, rename or delete anything in it.
- Analyse the source test cases before writing any automation, following the `test-case-validity-remarks` skill (review workbook first, automate VALID cases only). Do not assume URLs, credentials, endpoints, locators or test data. Ask instead.
- Every automated scenario must carry its original test case ID tag: `@TC-WEB-012` (prefixes in `TC_ID_PREFIXES`) or `@id=<ID>` (any format).
- Web/mobile: Cucumber + POM (`pages/`), thin steps in `step-definitions/`. API: Karate in `features/api/`.
- Failure evidence follows the `screenshot-annotation` skill (`.claude/skills/`). Set `this.expected()` from the original test case wording.
- Full pipeline requests ("run the full pipeline", "analyze and automate", "start testing", "test, verify and review") follow the `qa-workflow` skill (phases 0–6, gates) using the agents in `.claude/agents/`.
- Run `npm run check:gate` after code changes.

## Excel update commands (run ONLY when the user explicitly says so)
| User says | Run |
|---|---|
| "Update Excel Report" | `npm run excel:update` |
| "Update Excel Report for Web" | `npm run excel:update:web` |
| "Update Excel Report for Mobile" | `npm run excel:update:mobile` |
| "Update Excel Report for API" | `npm run excel:update:api` |
| "Update Excel Report for Latest Execution" | `npm run excel:update:latest` |
| any of the above + "with review remarks" | add `-- --include-review` (review remarks on rows that weren't executed) |

Never run an Excel update as a side effect of running tests.
