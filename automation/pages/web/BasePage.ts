/**
 * Base class for web page objects (Playwright).
 *   export class LoginPage extends BasePage { readonly username = this.page.locator('#username'); ... }
 * Locators live in page classes only — never in step definitions.
 */
import type { Locator, Page, Response } from 'playwright';
import { evidenceTracker } from '../../utils/evidence-tracker';

type Target = string | Locator;

/** Default wait comes from the context (WEB_TIMEOUT_MS); pass a timeout only when a step genuinely needs a different one. */
const describe = (l: Locator) => l.toString();

/** Re-throws a Playwright timeout with what was being waited for (skill: wait-and-sync-rules). */
async function waitingFor<T>(what: string, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (e) {
    const err = e as Error;
    if (err.name === 'TimeoutError' || /Timeout \d+ms exceeded/.test(err.message)) {
      throw new Error(`Timed out waiting for ${what}. ${err.message.split('\n')[0]}`, { cause: e });
    }
    throw e;
  }
}

export abstract class BasePage {
  constructor(protected readonly page: Page) {}

  /** Resolves a target and records it as the element under test (boxed on failure evidence). */
  protected el(target: Target, name?: string): Locator {
    const locator = typeof target === 'string' ? this.page.locator(target) : target;
    evidenceTracker.set({ kind: 'web', locator, name: name ?? `${this.constructor.name} ${locator.toString()}` });
    return locator;
  }

  /** Mark an extra issue region on the next evidence screenshot (numbered 2, 3 …). */
  markIssue(target: Target, name?: string): void {
    const locator = typeof target === 'string' ? this.page.locator(target) : target;
    evidenceTracker.addIssue({ kind: 'web', locator, name: name ?? `${this.constructor.name} ${locator.toString()}` });
  }

  /** Navigate to a path relative to BASE_URL, or an absolute URL. */
  async open(urlOrPath = '/'): Promise<void> {
    await this.page.goto(urlOrPath, { waitUntil: 'domcontentloaded' });
  }

  async click(target: Target): Promise<void> {
    await this.el(target).click();
  }

  async fill(target: Target, value: string | number): Promise<void> {
    await this.el(target).fill(String(value));
  }

  async select(target: Target, value: string): Promise<void> {
    await this.el(target).selectOption(value);
  }

  async getText(target: Target): Promise<string> {
    return (await this.el(target).innerText()).trim();
  }

  /** Non-throwing visibility probe (for optional UI such as banners). Prefer waitForVisible for required elements. */
  async isVisible(target: Target, timeout?: number): Promise<boolean> {
    try {
      await this.el(target).waitFor({ state: 'visible', timeout });
      return true;
    } catch {
      return false;
    }
  }

  async waitForVisible(target: Target, timeout?: number): Promise<void> {
    const l = this.el(target);
    await waitingFor(`${describe(l)} to be visible`, () => l.waitFor({ state: 'visible', timeout }));
  }

  /** Loaders/spinners/overlays: wait until they are gone. */
  async waitForHidden(target: Target, timeout?: number): Promise<void> {
    const l = this.el(target);
    await waitingFor(`${describe(l)} to disappear`, () => l.waitFor({ state: 'hidden', timeout }));
  }

  async waitForEnabled(target: Target, timeout?: number): Promise<void> {
    const l = this.el(target);
    await waitingFor(`${describe(l)} to be enabled`, async () => {
      await l.waitFor({ state: 'visible', timeout });
      await l.page().waitForFunction((el) => !(el as HTMLButtonElement).disabled, await l.elementHandle(), { timeout });
    });
  }

  async waitForUrl(pattern: string | RegExp, timeout?: number): Promise<void> {
    await waitingFor(`URL to match ${pattern}`, () => this.page.waitForURL(pattern, { timeout }));
  }

  /**
   * Wait for the API call a UI action triggers, e.g. after submitting a form:
   *   const res = await this.waitForResponse('/api/login', () => this.click(this.submit));
   */
  async waitForResponse(urlPart: string | RegExp, action: () => Promise<unknown>, timeout?: number): Promise<Response> {
    const match = (u: string) => (typeof urlPart === 'string' ? u.includes(urlPart) : urlPart.test(u));
    return waitingFor(`a response from ${urlPart}`, async () => {
      const [res] = await Promise.all([this.page.waitForResponse((r) => match(r.url()), { timeout }), action()]);
      return res;
    });
  }

  title(): Promise<string> {
    return this.page.title();
  }

  url(): string {
    return this.page.url();
  }
}
