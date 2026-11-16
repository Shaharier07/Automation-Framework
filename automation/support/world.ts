/**
 * Custom Cucumber World — state shared by the steps of ONE scenario.
 *  - web scenarios:    this.page / this.context / this.browser (Playwright)
 *  - mobile scenarios: this.driver (Appium via WebdriverIO)
 */
import { setWorldConstructor, World, type IWorldOptions } from '@cucumber/cucumber';
import type { Browser, BrowserContext, Page } from 'playwright';

export type Platform = 'web' | 'android' | 'ios';

export class CustomWorld extends World {
  browser?: Browser;
  context?: BrowserContext;
  page?: Page;
  driver?: WebdriverIO.Browser;
  platform?: Platform;
  private store = new Map<string, unknown>();

  /* ---- evidence context (used by utils/evidence.ts) ---- */
  testCaseIds: string[] = [];
  stepNumber = 0;
  stepName = '';
  expectedText?: string;
  actualText?: string;
  reasonText?: string;
  evidenceCaptured = false;

  constructor(options: IWorldOptions) {
    super(options);
  }

  /** Playwright page; throws if the scenario is not tagged @web. */
  get web(): Page {
    if (!this.page) throw new Error('No Playwright page. Tag the scenario/feature with @web.');
    return this.page;
  }

  /** Appium driver; throws if the scenario is not tagged @mobile. */
  get mobile(): WebdriverIO.Browser {
    if (!this.driver) throw new Error('No Appium session. Tag the scenario/feature with @mobile.');
    return this.driver;
  }

  /** Expected result for the current step — copy the original test case wording. */
  expected(text: string): void {
    this.expectedText = text;
  }

  /** What was actually observed (used on the evidence banner). */
  observed(text: string): void {
    this.actualText = text;
  }

  /** Factual cause, e.g. "Submit button stays disabled after valid input". Never speculate. */
  reason(text: string): void {
    this.reasonText = text;
  }

  /** Share a value between steps of the same scenario. */
  remember<T>(key: string, value: T): void {
    this.store.set(key, value);
  }

  recall<T>(key: string): T {
    if (!this.store.has(key)) throw new Error(`Nothing remembered for "${key}"`);
    return this.store.get(key) as T;
  }
}

setWorldConstructor(CustomWorld);
