---
name: test-data-management
description: Use when a test needs input data, accounts, or records, or when reviewing hardcoded values. Keeps data separate from scripts and environment-aware. Trigger on "test data", "data file", "fixture", "hardcoded".
---

# Test Data Management

## Rules
- No test data inside feature files beyond readable examples, and none inside step or page code.
- Store data in test-data/{web|mobile|api}/{environment}/ as JSON or similar.
- Reference data by meaningful keys (validUser, expiredCard), not by raw values.
- Generate unique values (emails, names, IDs) at runtime when the test creates records, to avoid collisions.
- Tests must not depend on data created by other tests unless explicitly chained and documented.
- Clean up data created during the test when the application allows it.
- Never put real customer data or real credentials in data files.
- If required data is not provided, mark the case BLOCKED and ask the user.

## Implementation in this framework
- **Folder:** `test-data/<web|mobile|api>/<TEST_ENV>/<file>.json`. `test-data/<platform>/common/` is an optional fallback shared by all environments. See `test-data/README.md`.
- **Web/mobile (TypeScript, `utils/test-data.ts`):**
  ```ts
  const user = dataFor<User>('web', 'users.json', 'validUser');      // by key
  const email = uniqueEmail(dataFor<string>('web', 'settings.json', 'emailDomain'));
  const name = uniqueId('customer');
  ```
- **API (Karate, `karate-config.js`):** `* def users = readData('users.json')`, `* def email = uniqueId('user') + '@' + users.emailDomain`.
- **Missing data:** the helpers throw `BLOCKED: test data … not found …` naming the file and key. The scenario becomes BLOCKED in Excel and in the summary. Ask the user. Never invent data.
- **Passwords and tokens** go in `.env` (skill: secrets-and-env-handling), not in data files.
- **Cleanup:** do it in the scenario (Karate: a `DELETE` at the end) or in a page/API helper called from a final step. Note it in the handoff when the app doesn't allow cleanup.
- **Checked by:** code-reviewer (no literals in steps/pages, keys not raw values).
