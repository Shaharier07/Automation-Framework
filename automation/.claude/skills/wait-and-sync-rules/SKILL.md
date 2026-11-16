---
name: wait-and-sync-rules
description: Use when writing or reviewing any step that waits for elements, pages, network, or animations in web or mobile tests. Prevents flaky timing. Trigger on "wait", "timeout", "sleep", "flaky", "not found".
---

# Wait and Sync Rules

## Rules
- Fixed sleeps are forbidden.
- Web: rely on Playwright auto-waiting and web-first assertions. Wait for specific conditions (visible, enabled, URL changed, network response) when needed.
- Mobile: use explicit waits on element conditions; avoid implicit waits mixed with explicit waits.
- Wait for the condition the test actually depends on, not a general "page loaded".
- Timeouts come from config per platform and environment; never hardcode them in steps.
- A timeout failure message must say what was being waited for.

## Common cases
- After form submit: wait for the result element or the API response, not a delay.
- Loaders and spinners: wait until they disappear.
- Animations: wait for the final state of the element.
- Mobile keyboards and permission dialogs: handle them explicitly.

## Implementation in this framework
| Need | Web (`BasePage`) | Mobile (`BaseScreen`) |
|---|---|---|
| element visible | `waitForVisible(locator)` (actions auto-wait) | `element(selector)` / `tap()` / `type()` (explicit wait) |
| loader/spinner gone | `waitForHidden(spinner)` | `waitForGone(spinner)` |
| enabled | `waitForEnabled(button)` | n/a (use the element's state) |
| URL changed | `waitForUrl(/\/dashboard/)` | n/a |
| API response after an action | `const res = await waitForResponse('/api/login', () => this.click(this.submit))` | n/a |
| keyboard | n/a | `hideKeyboard()` |
| optional element probe | `isVisible(locator)` (no throw) | `isDisplayed(selector)` (no throw) |

- **Timeouts:** come from `.env`: `WEB_TIMEOUT_MS`, `WEB_NAVIGATION_TIMEOUT_MS`, `MOBILE_TIMEOUT_MS`, `APPIUM_SESSION_TIMEOUT_MS`. They're overridable per environment (`WEB_TIMEOUT_MS_STAGING`) and applied as context/driver defaults. Pass an explicit timeout only in a page object method that genuinely needs a different one, never in a step.
- **Mobile:** implicit wait is set to 0 at session start, so there are only explicit waits. Android grants permissions automatically (`autoGrantPermissions`). For iOS permission alerts, either handle them in a screen object or set `IOS_AUTO_ACCEPT_ALERTS=true` explicitly.
- **Assertions in steps:** page object methods wait for the condition and return the value (`getText`, `waitForVisible` …). The step then asserts that value (`assert.strictEqual`). Never poll in a step.
- **Messages:** waits throw `Timed out waiting for <locator> to be visible …` (web) or `Timed out after Nms waiting for <Screen> <selector> to be displayed` (mobile).
- **Enforced by ESLint:** `waitForTimeout`, `pause` and `new Promise(setTimeout)` are errors in pages, support, utils and steps. The only exception is the press duration inside the swipe gesture, which is commented in `BaseScreen`.
