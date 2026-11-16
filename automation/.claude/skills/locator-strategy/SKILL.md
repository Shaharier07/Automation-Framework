---
name: locator-strategy
description: Use whenever creating, changing, or reviewing a locator for web or mobile. Defines locator priority, forbidden patterns, and naming. Trigger on "locator", "selector", "element", "page object", "xpath".
---

# Locator Strategy

## Web priority (highest first)
1. Dedicated test attributes (data-testid, data-test, data-qa)
2. Accessible role with name
3. Label, placeholder, or alt text
4. Visible text (only when stable and not translated)
5. Short, meaningful CSS
6. Relative XPath (last resort, with a comment explaining why)

## Mobile priority
1. Accessibility ID
2. Resource ID (Android) / name (iOS)
3. Platform-native queries (UiAutomator / iOS predicate or class chain)
4. XPath (last resort, with a comment)

## Forbidden
- Absolute XPath, index-only selectors, auto-generated class names, coordinates.

## Rules
- Use only locators the user provided or that can be confirmed from the real page/screen. Never invent them.
- Name locators by purpose (loginButton, emailInput), not by appearance.
- One locator definition per element, inside its page object.
- If no stable locator exists, recommend the dev team add a test ID and note it in the handoff.

## Implementation in this framework
Locators are `readonly` fields on the page/screen class. Methods take the field and never a new selector string.

**Web** (`pages/web/<Name>Page.ts`, extends `BasePage`). Playwright equivalents in priority order:
```ts
readonly loginButton   = this.page.getByTestId('login-submit');                 // 1. test attribute*
readonly emailInput    = this.page.getByRole('textbox', { name: 'Email' });     // 2. role + name
readonly passwordInput = this.page.getByLabel('Password');                      // 3. label (getByPlaceholder / getByAltText)
readonly welcomeText   = this.page.getByText('Welcome back', { exact: true });  // 4. stable, untranslated text
readonly cartBadge     = this.page.locator('header .cart-count');               // 5. short CSS
// 6. relative XPath — last resort, comment why:
readonly totalCell     = this.page.locator('xpath=//td[normalize-space()="Total"]/following-sibling::td[1]'); // no test id / role on totals table
```
*`getByTestId` reads `data-testid`. For `data-test` / `data-qa`, use `this.page.locator('[data-qa="login-submit"]')`.

**Mobile** (`pages/mobile/<Name>Screen.ts`, extends `BaseScreen`). Use `byPlatform()` when Android and iOS differ:
```ts
readonly loginButton = '~login_button';                                          // 1. accessibility id (both platforms)
readonly emailInput  = this.byPlatform({
  android: 'id=com.example.app:id/email',                                        // 2. resource id
  ios: '-ios predicate string:name == "email"',                                  // 2/3. name / predicate
});
readonly okButton    = this.byPlatform({
  android: 'android=new UiSelector().text("OK")',                                // 3. UiAutomator
  ios: '-ios class chain:**/XCUIElementTypeButton[`label == "OK"`]',             // 3. class chain
});
```
`byPlatform()` reads the session, so define platform-specific locators as getters (`get emailInput() { return this.byPlatform(...) }`) when the screen object is created before the session.

**Confirm a locator from the real screen:** web: open the page with `npm run test:web:headed` or Playwright codegen (`npx playwright codegen <BASE_URL>`). Mobile: use the Appium Inspector against `npm run appium`. If you can't confirm a locator, don't add it. List it as needed from the user or the dev team.

**Checked by:** ESLint (no `locator()`/`$()` in step definitions) and the code-reviewer.
