# SQA Automation Framework

**TypeScript · Playwright (web) · Appium (mobile) · Karate DSL (API) · Cucumber BDD · Allure · Excel status updates**

| Layer | Tool | Language |
|---|---|---|
| Web UI | Playwright: Chromium, Firefox, WebKit | TypeScript + Gherkin |
| Mobile | Appium 3: UiAutomator2 (Android), XCUITest (iOS) via WebdriverIO | TypeScript + Gherkin |
| API | Karate DSL 1.5 (Maven / JUnit 5) | Karate Gherkin |
| BDD runner | Cucumber.js 12 (web/mobile), Karate (API) | — |
| Reporting | Allure 2 (all types) + Cucumber/Karate HTML | — |
| Test case sync | ExcelJS writes a **copy** of your original `.xlsx` | — |

---

## 1. Prerequisites

| Tool | Version | Needed for | Check |
|---|---|---|---|
| Node.js | ≥ 20 | everything | `node -v` |
| Java JDK | 17+ | Karate, Allure CLI, Android | `java -version` |
| Maven | 3.8+ | Karate | `mvn -v` |
| Android Studio + SDK, `adb` | latest | Android | `adb devices` |
| Xcode + Command Line Tools (macOS) | latest | iOS | `xcodebuild -version` |

For Android, add this to `~/.zshrc`:
```bash
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$PATH:$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator
```

> Allure-Java is pinned to 2.x because 3.x needs Java 21.

## 2. Installation

```bash
cd automation
npm run setup              # npm deps + Playwright browsers + Appium drivers + Karate (Maven) deps
cp .env.example .env       # then fill in your values
npm run verify             # health check of every layer (no application tests are run)
```

`npm run verify` checks Node, Java, Maven, `.env`, the TypeScript typecheck, launching all 3 browsers,
the Cucumber web/mobile wiring, the Appium server and drivers, ANDROID_HOME/adb/Xcode,
Karate compilation, the Allure CLI and ExcelJS.

## 3. Project structure

```text
automation/
├── source/                     # ORIGINAL test cases — never modified
│   ├── web/  mobile/  api/     #   per execution type
│   └── test-cases/             #   shared / mixed files
├── features/                   # Gherkin scenarios
│   ├── web/                    #   Cucumber + Playwright   (tag @web)
│   ├── mobile/                 #   Cucumber + Appium       (tag @mobile)
│   └── api/                    #   Karate scenarios
├── step-definitions/
│   ├── web/  mobile/           #   thin TS steps that call page objects
│   └── common/                 #   steps shared by web & mobile
├── pages/
│   ├── web/BasePage.ts         #   Playwright POM base (open, click, fill, getText, isVisible …)
│   └── mobile/BaseScreen.ts    #   Appium POM base (tap, type, swipe, byPlatform …)
├── api/                        # Karate (Maven) project
│   ├── karate-config.js        #   env selection, base URL, auth, default headers, helpers
│   ├── features/common/        #   reusable flows: auth.feature, oauth2-token.feature
│   ├── test-data/              #   API payloads + schemas/ (JSON Schema)
│   ├── src/test/java/framework #   ApiTestRunner, AllureKarateHook, SchemaValidator
│   └── pom.xml
├── support/                    # config.ts (.env), world.ts (Cucumber World), hooks.ts (lifecycle)
├── config/                     # web.config.ts, mobile.config.ts, excel.config.ts
├── utils/                      # annotator + evidence, logger, test-data loader, Allure result reader
├── scripts/                    # run.ts, allure.ts, update-excel.ts, verify.ts
├── .claude/skills/             # Claude skills, one folder each (see §11)
├── .claude/agents/             # pipeline agents: test-analyst, automation-engineer, code-reviewer, test-executor, result-verifier, report-manager
├── reports/
│   ├── allure-results/{web,mobile,api}/
│   ├── allure-report/{web,mobile,api,all}/
│   ├── cucumber/{web,mobile}/  karate/   excel/   logs/
├── screenshots/{raw,annotated}/{web,mobile}/
├── test-data/                  # test-data/<web|mobile|api>/<TEST_ENV>/*.json (see test-data/README.md)
├── cucumber.js  tsconfig.json  package.json  .env.example
```

## 4. Environment configuration (`.env`)

Nothing is assumed: you provide every URL, credential, endpoint and device. See `.env.example` for the full list.

| Group | Key variables |
|---|---|
| General | **`TEST_ENV`** (selects the environment for everything), `TC_ID_PREFIXES`, `DEFAULT_TIMEOUT_MS`, `LOG_LEVEL` |
| Web | `BASE_URL` (required), `WEB_TIMEOUT_MS`, `WEB_NAVIGATION_TIMEOUT_MS`, `BROWSER` (chromium/firefox/webkit), `HEADLESS`, `SLOW_MO_MS`, `VIEWPORT_*`, `RECORD_VIDEO`, `TRACE` |
| Mobile | `APPIUM_HOST/PORT`, `PLATFORM` (android/ios), `APPIUM_SESSION_TIMEOUT_MS`, `MOBILE_TIMEOUT_MS`, `ANDROID_*`, `IOS_*`, `NO_RESET`, `FULL_RESET` |
| API | `API_BASE_URL` (required), `API_AUTH_TYPE` (none/bearer/basic/apikey/oauth2) + credentials, `API_MAX_RESPONSE_MS`, `API_TIMEOUT_MS`, `API_THREADS` |

**Emulator / simulator:** set `*_DEVICE_NAME` and `*_PLATFORM_VERSION` (for Android, optionally `ANDROID_AVD` to auto-boot).
**Real device:** also set `*_UDID` (find it with `adb devices` or `xcrun xctrace list devices`). For iOS, also set `IOS_XCODE_ORG_ID` for signing.
**App:** give either a binary path (`*_APP_PATH`) or an installed app (`ANDROID_APP_PACKAGE` + `ANDROID_APP_ACTIVITY` / `IOS_BUNDLE_ID`).

**Environments (skill: secrets-and-env-handling):** `TEST_ENV` selects the environment for web, mobile, API, the test data folder and the evidence banner.
Any variable can be set per environment with a suffix: with `TEST_ENV=qa`, `BASE_URL_QA` or `API_TOKEN_QA` win over `BASE_URL` / `API_TOKEN`.
Use `-- --env staging` to switch for one run. A missing required variable stops the run as **BLOCKED**, naming the variable.

## 5. Execution commands

| Command | Runs |
|---|---|
| `npm run test:web` | Web, browser and headless setting from `.env` |
| `npm run test:web:headed` | Web, visible browser |
| `npm run test:web:chromium` · `:firefox` · `:webkit` | Web on a specific engine |
| `npm run emulator:android` | Boots the `Automation_Pixel_API35` emulator (Pixel 7, Android 15) |
| `npm run devices` | Lists connected Android devices/emulators |
| `npm run appium` | Starts the Appium server (keep it running in a separate terminal) |
| `npm run test:android` · `npm run test:ios` | Mobile on Android / iOS |
| `npm run test:mobile` | Mobile on the `PLATFORM` from `.env` |
| `npm run test:api` | Karate API (`-- --env qa` picks the environment) |
| `npm run test:regression` | Full regression: web, then mobile, then API (types with no feature files are skipped) |

Filter by tag (Cucumber syntax; for API it's converted to Karate syntax automatically):
```bash
npm run test:web -- --tags "@smoke and not @wip"
npm run test:api -- --tags "@regression" --env staging
npm run test:android -- --tags "@TC-LOGIN-001"   # one test case
```

Every run:
- clears the Allure results for its type, so each report reflects that run
- saves annotated failure evidence to `screenshots/` and attaches it to Allure (§9)
- prints an execution summary and records `reports/last-run.json`
- exits with code 1 if anything failed, so it works in CI

**Excel is never updated automatically.** See §8.

## 6. Allure reports

| Command | Output |
|---|---|
| `npm run report:web` | `reports/allure-report/web/index.html` |
| `npm run report:mobile` | `reports/allure-report/mobile/index.html` |
| `npm run report:api` | `reports/allure-report/api/index.html` |
| `npm run report:all` | One combined report: `reports/allure-report/all/index.html` |
| `npm run report:open -- web` | Serves a generated report in the browser (`web`/`mobile`/`api`/`all`) |

The reports include:
- passed, failed, broken and skipped scenarios, with duration and failure message/stack
- tags, plus these labels: `testCaseId` (from the TC ID tag), `severity` (from the priority tag), `epic`, `story`, `owner`
- UI failures: a screenshot and the page URL
- API: every step, with the **HTTP request and response attached to each `method` step**. Auth headers are masked.
- environment info (browser, platform, Karate env), failure categories, and trend history across runs

## 7. Adding new test cases

### Tags (skill: tagging-and-suites)
```gherkin
@web @login
Feature: Login

  @TC-WEB-012 @smoke @regression @critical
  Scenario: TC-WEB-012 Valid user can log in
```
**Every scenario** needs, from the feature line, the scenario line or its Examples block:
1. **Test case ID:** `@TC-WEB-012` (the ID itself, when it starts with a prefix in `TC_ID_PREFIXES`, default `TC`) or `@id=<ID>` for any ID format (`@id=A,B` for several).
   Sub-scenarios of one case use `-a`, `-b` (`@TC-WEB-012-a`) and are counted under `TC-WEB-012`.
2. **Platform:** exactly one, matching the folder.
3. **Module:** at least one, from the list below.
4. **Suite:** `@smoke` and/or `@regression`. Smoke covers only critical paths and stays fast.
5. **Priority:** exactly one.

Tags are lowercase and hyphenated (TC IDs keep their original form). **A tag that isn't in this list fails `npm run check:tags`**, so add new tags here first.

<!-- tag-list:start -->
| Group | Tags | Rule |
|---|---|---|
| platform | `@web` `@mobile` `@api` | exactly one; must match `features/<platform>/` |
| suite | `@smoke` `@regression` | at least one |
| priority | `@critical` `@high` `@medium` `@low` | exactly one (also sets Allure severity) |
| module | _(none yet: add each module tag here, in backticks, when its first feature is written — e.g. @login)_ | at least one |
| optional | `@android` `@ios` `@chromium` `@firefox` `@webkit` `@manual` `@quarantine` `@wip` `@a11y` `@visual` | platform/browser-specific, NOT AUTOMATABLE reference, flaky under investigation, work in progress, accessibility check, visual regression check |
| metadata | `@epic=` `@story=` `@owner=` | optional `key=value` labels shown in Allure |
<!-- tag-list:end -->

**How runs use tags:**
- `@manual` never runs.
- `npm run test:regression` also excludes `@wip` and `@quarantine`.
- `test:android` skips `@ios`-only scenarios and `test:ios` skips `@android`-only ones.
- Web runs skip scenarios tagged only for another browser (`@chromium`/`@firefox`/`@webkit`).
- Your own filter is combined with these: `npm run test:web -- --tags "@smoke"`.

### Web / Mobile (Cucumber + POM)
1. **Feature:** `features/web/login.feature` (tag the feature or the scenario `@web`, or `@mobile` for mobile).
2. **Page object:** `pages/web/LoginPage.ts`
   ```ts
   import { BasePage } from './BasePage';
   export class LoginPage extends BasePage {
     readonly username = this.page.getByLabel('Username');   // locators live here only
     readonly password = this.page.getByLabel('Password');
     readonly submit   = this.page.getByRole('button', { name: 'Sign in' });
     async login(user: string, pass: string) {
       await this.fill(this.username, user);
       await this.fill(this.password, pass);
       await this.click(this.submit);
     }
   }
   ```
   Mobile screens extend `BaseScreen` and use `this.byPlatform({ android: 'id=…', ios: '~…' })`.
3. **Steps:** `step-definitions/web/login.steps.ts`
   ```ts
   import { Given, When } from '@cucumber/cucumber';
   import type { CustomWorld } from '../../support/world';
   import { LoginPage } from '../../pages/web/LoginPage';
   When('I log in as {string}', async function (this: CustomWorld, user: string) {
     await new LoginPage(this.web).login(user, process.env.APP_PASSWORD ?? '');
   });
   ```
   `this.web` is the Playwright page and `this.mobile` is the Appium driver. Use `this.remember()` / `this.recall()` to share values between steps.
4. **Data:** put JSON in `test-data/web/<env>/…` under meaningful keys and read it with `dataFor('web', 'users.json', 'validUser')` (see `test-data/README.md`).
5. `npx cucumber-js --profile web --dry-run` lists any undefined steps, with ready-to-paste snippets.

### API (Karate, skill: api-validation-rules)
`features/api/users.feature`:
```gherkin
@api @users @regression
Feature: Users API
  Background:
    * url baseUrl                                   # API_BASE_URL[_<ENV>] (required, fails fast if missing)
    * def users = readData('users.json')            # test-data/api/<TEST_ENV>/users.json

  @TC-API-001 @smoke @high
  Scenario: TC-API-001 Create user
    * def payload = users.newUser
    * set payload.email = uniqueId('user') + '@' + users.emailDomain
    Given path 'users'
    And request payload
    When method post
    Then status 201                                                        # exact status
    And match responseHeaders['Content-Type'][0] contains 'application/json'
    And match validateSchema('test-data/schemas/user.schema.json', response) == []   # types + required fields
    And match response.email == payload.email                              # key field values
    And assert responseTime < maxResponseTime                              # API_MAX_RESPONSE_MS
    # cleanup what the test created
    Given path 'users', response.id
    When method delete
    Then status 204
```
Every API test checks the **status (exact)**, the **schema**, **key field values**, **important headers** and the **response time**.
For each endpoint, cover the positive case, missing or invalid required fields, invalid or missing auth, boundary values, and not found / wrong ID.
- **Methods:** `method get | post | put | patch | delete`
- **Auth and common headers:** applied once by `karate-config.js` from `API_AUTH_TYPE`. Never repeat them per test.
- **Secrets:** masked in the Karate log and Allure (`SecretMasker`): auth headers, cookies, and `password`/`token`/`secret`/`apiKey` fields.
- **Reusable flows:** `api/features/common/` → `* call read('classpath:common/x.feature')`.
- **Data:** `test-data/api/<env>/` via `readData()`. Schemas: `api/test-data/schemas/` → `classpath:test-data/schemas/…`.

## 8. Excel test case update (on demand only)

| Command | Updates using results from |
|---|---|
| `npm run excel:update` | web + mobile + API (all available results) |
| `npm run excel:update:web` | web only |
| `npm run excel:update:mobile` | mobile only |
| `npm run excel:update:api` | API only |
| `npm run excel:update:latest` | the type(s) of the most recent `test:*` run |

Options: `-- --file source/web/Login.xlsx` targets one file, `-- --dry-run` previews without writing, and `-- --include-review` also appends
test case review remarks (§10) to rows that weren't executed.

How it works:
1. It reads the Allure results of the chosen scope and links each scenario to a source row by its TC ID tag (`@TC-…` or `@id=…`).
2. It scans `.xlsx` / `.xlsm` / `.csv` files in `source/<type>/` and `source/test-cases/`. In each sheet it finds the header row by
   the ID column (`TC ID`, `Test Case ID`, `ID` …, configurable in `config/excel.config.ts`).
3. It updates **only the rows covered by the execution results**:
   - **Status:** `PASS` / `FAIL` / `BLOCKED`, colour coded
   - **Actual Result**, **Execution Date**, **Failure Details**, **Automation Scenario**
   - **Failure Category** from the latest result verification (`reports/verification/`). "Not verified" when there is none. *Environment Issue* sets BLOCKED.
   - **Remarks** (append-only, existing text is kept): the verification reason and action, plus the test case review remark if there is one

   It reuses existing columns with these names (for example your `Status` or `Remarks` column) and otherwise appends them.
4. It writes a **new copy** to `reports/excel/<name>_updated_<timestamp>.xlsx` and a log, `update-log_<timestamp>.csv`.
   The log also lists IDs that weren't found and scenarios that have no `@id` tag.
   The original file is checksum-verified as unchanged.

Status mapping: passed → PASS · failed/broken → FAIL · skipped or setup could not start (e.g. no device) → BLOCKED.
When several scenarios cover one ID, the worst result wins.
Legacy `.xls` isn't supported, so save it as `.xlsx`. Word/PDF test cases are used for analysis only.

## 9. Failure evidence (annotated screenshots)

When a web or mobile step fails, the framework automatically saves:
- `screenshots/raw/{web|mobile}/{TC_ID}_{timestamp}.png`: sensitive fields masked
- `screenshots/annotated/{web|mobile}/{TC_ID}_{timestamp}_annotated.png`: numbered red box (FAIL) or amber box (BLOCKED) on the element,
  and a banner below the image with the TC ID, step, Expected, Actual, Reason and Env

Both are attached to Allure. Set the banner text in your steps with `this.expected()`, `this.observed()` and `this.reason()`.
The full rules are in the Claude skill [`.claude/skills/screenshot-annotation/SKILL.md`](.claude/skills/screenshot-annotation/SKILL.md).

## 10. Test case review (before automation)

| Command | Purpose |
|---|---|
| `npm run testcases:extract` | Read-only extraction of `source/` test cases to `reports/test-case-review/extracted/` |
| `npm run testcases:review -- <review.json>` | Writes `reports/test-case-review/review_<file>_<date>.xlsx` (Review + Summary sheets) |

Each case is classified as VALID, INVALID (Incomplete / Ambiguous / Contradictory / Obsolete), DUPLICATE, NOT AUTOMATABLE, BLOCKED or NEEDS CLARIFICATION.
Each non-valid case gets an evidence-based remark and a suggested fix. On an Excel update command, non-VALID remarks are copied into
**Review Status / Review Remark** columns of the updated copy (`-- --no-review` to skip). The full rules are in the skill
[`.claude/skills/test-case-validity-remarks/SKILL.md`](.claude/skills/test-case-validity-remarks/SKILL.md).

## 11. Full QA pipeline (Claude agents)

Say **"run the full pipeline"**, "analyze and automate", "start testing", or "test, verify and review" in Claude Code.
The `qa-workflow` skill runs the phases strictly in order, with a gate after each one:

| Phase | Agent (`.claude/agents/`) | Gate |
|---|---|---|
| 0 | always-on rules: secrets-and-env-handling, tagging-and-suites, locator-strategy, wait-and-sync-rules, test-data-management | — |
| 1 | test-analyst: validity review + initial traceability | **stops** until you answer every NEEDS CLARIFICATION question |
| 2 | automation-engineer: VALID cases only | `npm run check:gate` passes. Missing locator/URL/credential/data → asks you |
| 3 | code-reviewer | APPROVED (loops back to phase 2, max 3 rounds, then escalates to you) |
| 4 | test-executor | results + evidence collected (a run that can't start → BLOCKED, continue) |
| 5 | result-verifier: isolated re-run + classification | every failure classified. SCRIPT DEFECT → back to phases 2/3 |
| 6 | report-manager: Allure + execution summary + traceability | Excel **only** on "Update Excel Report…" |

Skills (`.claude/skills/<name>/SKILL.md`):
- **process:** qa-workflow, test-case-validity-remarks, failure-classification
- **writing tests:** test-case-to-gherkin, tagging-and-suites, locator-strategy, wait-and-sync-rules, test-data-management, secrets-and-env-handling, api-validation-rules
- **reporting:** screenshot-annotation, bug-report-writer (drafts in `reports/bugs/`), execution-summary, traceability-matrix

Quality commands used by the gates:

| Command | Checks |
|---|---|
| `npm run lint` | ESLint (TypeScript). Step definitions may not contain selectors or waits |
| `npm run check:tags` | every scenario has a TC ID tag (`@TC-…` or `@id=…`), and web/mobile features have `@web` / `@mobile` |
| `npm run check:gate` | typecheck + lint + tags + Cucumber dry runs + Karate compile |
| `npm run results:failures [type\|latest] [--rerun]` | non-passed scenarios with their evidence paths (`--rerun`: isolated re-run results) |
| `npm run test:rerun:<web\|mobile\|api> -- --tags "<TC tag>"` | isolated re-run of one scenario into `reports/allure-results-rerun/` (original run untouched) |
| `npm run verification:save -- <file.json>` | saves the verifier's classification. Fails if any failure is unclassified |
| `npm run summary` | execution summary: totals, comparison with the previous run, categories, flaky, attention list (also printed after every run) |
| `npm run traceability` | `reports/traceability/traceability_<date>.xlsx`: source cases → review → scenarios → results, with coverage per platform/module |

## 12. Conventions

- Keep original files in `source/` untouched. Automation lives in `features/`, `pages/` and `step-definitions/`.
- Write one feature file per module or story, and give every scenario its TC ID tag.
- Selectors belong only in page objects. Step definitions contain no locators or hard-coded data.
- Secrets come only from `.env` or CI variables. Never commit `.env`.
- Suggested tags: `@smoke`, `@regression`, `@wip`, `@android`, `@ios`, `@severity=…`.
- Run `npm run check:gate` before committing.
