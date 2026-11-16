/**
 * Base class for mobile screen objects (Appium / WebdriverIO).
 * Selector examples: '~accessibilityId', 'id=com.app:id/login', '//xpath',
 *   'android=new UiSelector().text("OK")', '-ios predicate string:name == "OK"'
 */
import { evidenceTracker } from '../../utils/evidence-tracker';
import { mobileTimeoutMs } from '../../config/mobile.config';

export type Direction = 'up' | 'down' | 'left' | 'right';

export abstract class BaseScreen {
  constructor(protected readonly driver: WebdriverIO.Browser) {}

  get isAndroid(): boolean {
    return this.driver.isAndroid;
  }

  get isIOS(): boolean {
    return this.driver.isIOS;
  }

  /** Choose a locator per platform: this.byPlatform({ android: 'id=...', ios: '~...' }) */
  protected byPlatform(sel: { android: string; ios: string }): string {
    return this.isAndroid ? sel.android : sel.ios;
  }

  /** Mark an extra issue region on the next evidence screenshot (numbered 2, 3 …). */
  markIssue(selector: string, name?: string): void {
    evidenceTracker.addIssue({ kind: 'mobile', selector, name: name ?? `${this.constructor.name} ${selector}` });
  }

  /** Explicit wait (MOBILE_TIMEOUT_MS) for the element to be displayed; the error names what was awaited. */
  protected async element(selector: string, timeout = mobileTimeoutMs()) {
    evidenceTracker.set({ kind: 'mobile', selector, name: `${this.constructor.name} ${selector}` });
    const el = this.driver.$(selector);
    await el.waitForDisplayed({ timeout, timeoutMsg: `Timed out after ${timeout}ms waiting for ${this.constructor.name} ${selector} to be displayed` });
    return el;
  }

  /** Loaders/spinners: wait until gone. */
  async waitForGone(selector: string, timeout = mobileTimeoutMs()): Promise<void> {
    await this.driver.$(selector).waitForDisplayed({
      timeout, reverse: true, timeoutMsg: `Timed out after ${timeout}ms waiting for ${this.constructor.name} ${selector} to disappear`,
    });
  }

  async tap(selector: string): Promise<void> {
    await (await this.element(selector)).click();
  }

  async type(selector: string, value: string | number): Promise<void> {
    const el = await this.element(selector);
    await el.clearValue();
    await el.setValue(String(value));
  }

  async getText(selector: string): Promise<string> {
    return (await (await this.element(selector)).getText()).trim();
  }

  async isDisplayed(selector: string, timeout = mobileTimeoutMs()): Promise<boolean> {
    evidenceTracker.set({ kind: 'mobile', selector, name: `${this.constructor.name} ${selector}` });
    try {
      await this.driver.$(selector).waitForDisplayed({ timeout });
      return true;
    } catch {
      return false;
    }
  }

  async hideKeyboard(): Promise<void> {
    if (await this.driver.isKeyboardShown()) await this.driver.hideKeyboard();
  }

  /** Swipe across the screen centre using W3C pointer actions. */
  async swipe(direction: Direction = 'up', percent = 0.6): Promise<void> {
    const { width, height } = await this.driver.getWindowSize();
    const cx = Math.round(width / 2);
    const cy = Math.round(height / 2);
    const dx = Math.round((width * percent) / 2);
    const dy = Math.round((height * percent) / 2);
    const [x1, y1, x2, y2] = {
      up: [cx, cy + dy, cx, cy - dy],
      down: [cx, cy - dy, cx, cy + dy],
      left: [cx + dx, cy, cx - dx, cy],
      right: [cx - dx, cy, cx + dx, cy],
    }[direction];
    // pause() here is the press duration inside the W3C gesture, not a sleep between steps
    // eslint-disable-next-line no-restricted-syntax
    await this.driver
      .action('pointer', { parameters: { pointerType: 'touch' } })
      .move({ x: x1, y: y1 }).down().pause(150)
      .move({ duration: 400, x: x2, y: y2 }).up()
      .perform();
  }
}
