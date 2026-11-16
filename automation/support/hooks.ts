/**
 * Lifecycle hooks
 *  @web    -> Playwright browser/context/page per scenario
 *  @mobile -> Appium session per scenario (PLATFORM=android|ios)
 *  failure -> annotated evidence (utils/evidence.ts, skill: screenshot-annotation)
 *              captured in AfterStep, i.e. immediately after the failing step and before teardown
 */
import path from 'path';
import {
  After, AfterAll, AfterStep, Before, BeforeAll, BeforeStep, Status, setDefaultTimeout,
  type ITestCaseHookParameter, type ITestStepHookParameter,
} from '@cucumber/cucumber';
import * as playwright from 'playwright';
import { remote } from 'webdriverio';

import { CustomWorld } from './world';
import { paths, settings } from './config';
import { getWebConfig } from '../config/web.config';
import { getMobileConfig } from '../config/mobile.config';
import { captureEvidence } from '../utils/evidence';
import { evidenceTracker } from '../utils/evidence-tracker';
import { closeAnnotator } from '../utils/annotator';
import { logger } from '../utils/logger';
import { testCaseIdsFromTags } from '../config/traceability.config';

setDefaultTimeout(settings.defaultTimeoutMs);

BeforeAll(function () {
  logger.info('Cucumber run started');
});

AfterAll(async function () {
  await closeAnnotator();
});

/* ---------------------- evidence context (all) --------------------- */
Before(function (this: CustomWorld, { pickle }: ITestCaseHookParameter) {
  evidenceTracker.reset();
  this.testCaseIds = testCaseIdsFromTags(pickle.tags.map((t) => t.name));
});

BeforeStep(function (this: CustomWorld, { pickleStep }: ITestStepHookParameter) {
  this.stepNumber += 1;
  this.stepName = pickleStep.text;
  this.expectedText = this.actualText = this.reasonText = undefined;
});

AfterStep(async function (this: CustomWorld, { pickleStep, result }: ITestStepHookParameter) {
  if (result.status !== Status.FAILED || this.evidenceCaptured) return;
  const message = ((result.message ?? result.exception?.message ?? '').split('\n').find((l) => l.trim()) ?? '')
    .replace(/^(AssertionError( \[ERR_ASSERTION\])?|Error): /, '');
  const blocked = /^(Error: )?BLOCKED\b/i.test(message);
  try {
    await captureEvidence(this, {
      status: blocked ? 'BLOCKED' : 'FAIL',
      stepNumber: this.stepNumber,
      stepName: pickleStep.text,
      actual: this.actualText ?? message.trim().slice(0, 300),
    });
  } catch (e) {
    logger.error(`Evidence capture failed: ${(e as Error).message}`);
  }
});

/* ------------------------------- WEB ------------------------------- */
Before({ tags: '@web' }, async function (this: CustomWorld) {
  const cfg = getWebConfig();
  this.platform = 'web';
  this.browser = await playwright[cfg.browser].launch(cfg.launchOptions);
  this.context = await this.browser.newContext({
    ...cfg.contextOptions,
    ...(cfg.recordVideo && { recordVideo: { dir: path.join(paths.reports, 'videos') } }),
  });
  if (cfg.trace) await this.context.tracing.start({ screenshots: true, snapshots: true });
  this.context.setDefaultTimeout(cfg.timeoutMs);
  this.context.setDefaultNavigationTimeout(cfg.navigationTimeoutMs);
  this.page = await this.context.newPage();
  logger.debug(`Launched ${cfg.browser} (headless=${cfg.launchOptions.headless})`);
});

/* ------------------------------ MOBILE ----------------------------- */
Before({ tags: '@mobile' }, async function (this: CustomWorld) {
  const cfg = getMobileConfig();
  this.platform = cfg.platform;
  try {
    this.driver = await remote(cfg.remote);
    await this.driver.setTimeout({ implicit: 0 }); // explicit waits only (skill: wait-and-sync-rules)
  } catch (e) {
    const { hostname, port } = cfg.remote;
    throw new Error(
      `BLOCKED: Appium session could not be created on ${cfg.platform} via ${hostname}:${port} ` +
        `(is "npm run appium" running and the device/emulator available?). ${(e as Error).message.split('\n')[0]}`,
      { cause: e },
    );
  }
  logger.debug(`Appium session started (${cfg.platform})`);
});

/* ----------------------------- TEARDOWN ---------------------------- */
After(async function (this: CustomWorld, { pickle, result }: ITestCaseHookParameter) {
  const failed = result?.status === Status.FAILED;
  try {
    // failure outside a step (e.g. a setup hook) with a live screen -> BLOCKED evidence
    if (failed && !this.evidenceCaptured && (this.page || this.driver)) {
      await captureEvidence(this, {
        status: 'BLOCKED',
        stepNumber: this.stepNumber,
        stepName: this.stepName || 'Scenario setup',
        actual: (result?.message ?? '').split('\n')[0].slice(0, 300) || 'Scenario could not run',
      }).catch((e) => logger.error(`Evidence capture failed: ${(e as Error).message}`));
    }
    if (this.context && getWebConfig().trace) {
      const safe = pickle.name.replace(/[^a-z0-9]+/gi, '_');
      await this.context.tracing.stop({ path: path.join(paths.reports, 'traces', `${safe}.zip`) });
    }
  } finally {
    await this.page?.close().catch(() => undefined);
    await this.context?.close().catch(() => undefined);
    await this.browser?.close().catch(() => undefined);
    await this.driver?.deleteSession().catch(() => undefined);
  }
});
