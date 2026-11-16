---
name: screenshot-annotation
description: Use whenever a web (Playwright) or mobile (Appium) test step fails, is blocked, or a defect needs visual evidence. Captures the screen, marks the failing element with a numbered red box, writes test case ID, step, expected, actual, reason and environment on a banner below the image, and attaches raw and annotated copies to Allure. Trigger on test failures, "screenshot", "evidence", "mark the issue", "annotate".
---

# Screenshot Annotation

## When to use
- Automatically in the After hook when a scenario fails or is blocked.
- On demand when a defect is observed during verification or exploration.

## Procedure
1. Capture the raw screenshot immediately, before any retry, navigation, or recovery action.
2. Save it as screenshots/raw/{web|mobile}/{TC_ID}_{yyyyMMdd-HHmmss}.png.
3. Find the region to mark:
   - Web: use the element's bounding box and scale by the device pixel ratio.
   - Mobile: use the element's rect and scale from window size to screenshot size (iOS uses points, not pixels).
   - If the missing element is the bug, mark where it was expected; if unknown, draw no box and write "Element not found: <page object name>".
   - For multiple issues, number each box (1, 2, 3) and refer to the numbers in the Reason line.
4. Mask passwords, tokens, card numbers, and personal data with a solid black box labelled "masked" before saving anything.
5. Add a banner BELOW the image (extend the canvas) so evidence is never covered. Banner lines:
   - TC ID | Step number and name | FAIL or BLOCKED
   - Expected: (from the original test case)
   - Actual: (what was observed)
   - Reason: (factual cause, or "Cause not determined")
   - Env: browser/device | resolution | environment | date and time with timezone
6. Save as screenshots/annotated/{web|mobile}/{TC_ID}_{timestamp}_annotated.png.
7. Attach both raw and annotated images to the failing step in Allure.

## Rules
- The Reason states only observed facts. "Submit button stays disabled after valid input" is correct. "Backend is probably down" is not.
- Expected text must come from the original test case, word for word where possible.
- Text must be readable (14px minimum). Truncate long lines with "…" and put the full text in the Allure step.
- Use the framework's existing annotator utility only. Do not add new image libraries.
- Never attach a screenshot taken at a different step than the failure.
- Red (#E53935) is reserved for failures; use amber for BLOCKED.

## Implementation in this framework

| Piece | File | What it does |
|---|---|---|
| Annotator (the only image utility) | `utils/annotator.ts` | `annotate()` draws masks, numbered boxes and the banner using Playwright's bundled Chromium. No extra image libraries. |
| Evidence capture | `utils/evidence.ts` | `captureEvidence(world, details)` runs steps 1–7: capture → regions → mask → raw + annotated files → Allure. |
| Element tracking | `utils/evidence-tracker.ts` | `BasePage.el()` and `BaseScreen.element()` / `isDisplayed()` record the element being acted on, so it is boxed automatically. |
| Automatic trigger | `support/hooks.ts` | `AfterStep` captures evidence right after the failing step, before teardown. `After` covers failures in setup hooks as BLOCKED. |

### Writing steps that produce good evidence
Set the banner text from the step definition. Copy Expected from the original test case:
```ts
Then('the Sign in button is enabled', async function (this: CustomWorld) {
  const login = new LoginPage(this.web);
  this.expected('Sign in button becomes enabled after entering valid credentials'); // original test case wording
  const enabled = await login.submit.isEnabled();
  if (!enabled) {
    this.observed('Sign in button stays disabled');
    this.reason('Submit button stays disabled after valid input');                   // observed fact only
  }
  assert.ok(enabled, 'Sign in button is disabled');
});
```
- If `observed()` isn't called, Actual falls back to the first line of the error. If `reason()` isn't called, Reason is "Cause not determined".
- Status is **BLOCKED** (amber) when the error message starts with `BLOCKED:` (e.g. no Appium session); otherwise it's **FAIL** (red).
- For more issues on the same screen, call `page.markIssue(locator)` / `screen.markIssue(selector)` before the assertion. Boxes are numbered in order (1 = the element under test). Refer to the numbers in `this.reason('1: … ; 2: …')`.
- On demand (defect seen while exploring): `await captureEvidence(this, { status: 'FAIL', stepNumber: this.stepNumber, stepName: this.stepName, expected, actual, reason })`.

### Masking
These are always masked: web password inputs, `autocomplete=cc-number|cc-csc|one-time-code`, `[data-sensitive]`, `[data-mask]`, Android `password="true"` and iOS `XCUIElementTypeSecureTextField`.
Add more with `MASK_SELECTORS` (web CSS, comma-separated) and `MOBILE_MASK_SELECTORS` (separated by `||`) in `.env`.
If a screen shows other personal data, add its selector before automating that screen.

### Output
- `screenshots/raw/{web|mobile}/{TC_ID}_{yyyyMMdd-HHmmss}.png`: masked, otherwise untouched
- `screenshots/annotated/{web|mobile}/{TC_ID}_{yyyyMMdd-HHmmss}_annotated.png`
- Allure: "Screenshot (raw)", "Screenshot (annotated)" and "Evidence details" (full, untruncated text, plus the URL for web)
- The `Env` environment name comes from `TEST_ENV` in `.env`.
- Each `npm run test:web|mobile` run clears that type's screenshot folders first.
