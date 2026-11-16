---
name: secrets-and-env-handling
description: Use whenever a test needs URLs, credentials, tokens, API keys, or environment switching. Keeps secrets safe. Trigger on "credentials", "password", "token", "env", "environment", "config".
---

# Secrets and Environment Handling

## Rules
- Read all URLs, credentials, and keys from .env and config files only.
- .env is never committed; .env.example lists every variable with placeholder values and a comment.
- Select the environment with one variable (e.g. TEST_ENV=staging).
- Never print, log, screenshot, or attach secrets in reports. Mask them in Allure and API logs.
- Fail fast with a clear message if a required variable is missing, naming the variable.
- Never assume or guess an environment value; ask the user.

## Implementation in this framework
- **Environment:** `TEST_ENV` (in `.env`, or `-- --env <name>` for one run) selects everything:
  - web/mobile config
  - Karate `karate.env`
  - the test data folder
  - the evidence banner
- **Per-environment values:** any variable can be overridden with a suffix. `BASE_URL_STAGING` wins over `BASE_URL` when `TEST_ENV=staging` (TS: `env.str()`; Karate: `setting()`).
- **Fail fast:** `env.required('NAME', 'purpose')` (TS) or `required()` (Karate) throws `BLOCKED: Missing required variable NAME (or NAME_<ENV>) in .env — needed for …`. Required variables:
  - `BASE_URL` for web
  - `ANDROID_APP_PATH` or `ANDROID_APP_PACKAGE` for Android
  - `IOS_APP_PATH` or `IOS_BUNDLE_ID` for iOS
  - `API_BASE_URL` for API
  - the matching credentials for `API_AUTH_TYPE`
- **Masking:**
  - **Screenshots:** password, card and one-time-code fields, `[data-sensitive]`, `[data-mask]`, Android password and iOS secure fields, plus anything in `MASK_SELECTORS` / `MOBILE_MASK_SELECTORS` (skill: screenshot-annotation).
  - **API (Karate log and Allure):** `SecretMasker` replaces Authorization, Cookie and token/key/secret headers, plus `password`/`token`/`secret`/`apiKey` fields in JSON, form bodies and query strings, with `***`.
  - **Logs:** the framework never logs `.env` values. Don't add `console.log` of credentials in steps or pages.
- **Files:** `.env` is in `.gitignore`. When you add a variable, add it to `.env.example` too with a placeholder and a comment. The two files must list the same keys.
- **Unknown values:** never guess. Ask the user, or let the run stop as BLOCKED with the variable name.
