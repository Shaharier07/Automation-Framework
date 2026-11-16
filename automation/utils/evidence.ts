/**
 * Failure / defect evidence (see .claude/skills/screenshot-annotation/SKILL.md).
 *
 * captureEvidence() — call from the AfterStep hook (automatic) or from a step (on demand):
 *   1. captures the screen immediately (before any recovery)
 *   2. resolves issue regions (web: bounding box × DPR + scroll; mobile: rect × screenshot/window scale)
 *   3. masks sensitive fields BEFORE anything is written
 *   4. saves screenshots/raw/{web|mobile}/{TC_ID}_{ts}.png (masked only)
 *   5. saves screenshots/annotated/{web|mobile}/{TC_ID}_{ts}_annotated.png (boxes + banner below)
 *   6. attaches raw, annotated and full-text details to Allure / Cucumber
 */
import fs from 'fs';
import path from 'path';
import { env, paths } from '../support/config';
import type { CustomWorld } from '../support/world';
import { annotate, pngSize, type EvidenceStatus, type Region } from './annotator';
import { evidenceTracker, type TrackedTarget } from './evidence-tracker';
import { logger } from './logger';

export interface EvidenceDetails {
  status: EvidenceStatus;
  stepNumber?: number;
  stepName: string;
  /** Wording from the original test case. */
  expected?: string;
  actual?: string;
  reason?: string;
  /** Extra regions to mark in addition to the tracked element. */
  targets?: TrackedTarget[];
}

export interface EvidenceFiles {
  raw: string;
  annotated: string;
}

const WEB_SENSITIVE =
  'input[type="password"], [autocomplete="cc-number"], [autocomplete="cc-csc"], [autocomplete="one-time-code"], [data-sensitive], [data-mask]';

function timestamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function localDateTime(d = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short',
  }).format(d);
}

const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 60) || 'NO-ID';

/* ------------------------------ web ------------------------------ */

async function webCapture(world: CustomWorld, targets: TrackedTarget[]) {
  const page = world.web;
  const { dpr, sx, sy } = await page.evaluate(() => ({ dpr: window.devicePixelRatio || 1, sx: window.scrollX, sy: window.scrollY }));
  const toRegion = (b: { x: number; y: number; width: number; height: number }): Region => ({
    x: (b.x + sx) * dpr, y: (b.y + sy) * dpr, width: b.width * dpr, height: b.height * dpr,
  });

  // capture first — evidence must reflect the failure moment
  const image = await page.screenshot({ fullPage: true, animations: 'disabled', caret: 'hide', timeout: 10000 });

  const extraMask = env.str('MASK_SELECTORS');
  const maskLocators = await page.locator(extraMask ? `${WEB_SENSITIVE}, ${extraMask}` : WEB_SENSITIVE).all().catch(() => []);
  const masks: Region[] = [];
  for (const l of maskLocators.slice(0, 50)) {
    const b = await l.boundingBox({ timeout: 500 }).catch(() => null);
    if (b && b.width > 0 && b.height > 0) masks.push(toRegion(b));
  }

  const boxes: Region[] = [];
  const missing: string[] = [];
  for (const t of targets) {
    if (t.kind !== 'web') continue;
    const b = await t.locator.first().boundingBox({ timeout: 1000 }).catch(() => null);
    if (b && b.width > 0 && b.height > 0) boxes.push(toRegion(b));
    else missing.push(t.name);
  }

  const browser = page.context().browser();
  const envDevice = browser ? `${browser.browserType().name()} ${browser.version()}` : env.str('BROWSER', 'browser');
  return { image, masks, boxes, missing, envDevice };
}

/* ----------------------------- mobile ---------------------------- */

async function mobileCapture(world: CustomWorld, targets: TrackedTarget[]) {
  const driver = world.mobile;
  const image = Buffer.from(await driver.takeScreenshot(), 'base64');
  const { width: imgW } = pngSize(image);
  const win = await driver.getWindowSize();
  const scale = imgW / win.width; // iOS rects are in points, Android in px — both normalised here

  const rectOf = async (selector: string): Promise<Region | null> => {
    try {
      const el = driver.$(selector);
      if (!(await el.isExisting())) return null;
      const [loc, size] = await Promise.all([el.getLocation(), el.getSize()]);
      return { x: loc.x * scale, y: loc.y * scale, width: size.width * scale, height: size.height * scale };
    } catch {
      return null;
    }
  };

  const masks: Region[] = [];
  const secureSelector = driver.isIOS
    ? '-ios class chain:**/XCUIElementTypeSecureTextField'
    : '//*[@password="true"]';
  try {
    const els = await driver.$$(secureSelector).getElements();
    for (const el of els.slice(0, 20)) {
      const [loc, size] = await Promise.all([el.getLocation(), el.getSize()]);
      masks.push({ x: loc.x * scale, y: loc.y * scale, width: size.width * scale, height: size.height * scale });
    }
  } catch { /* no secure fields */ }
  for (const sel of env.str('MOBILE_MASK_SELECTORS').split('||').map((s) => s.trim()).filter(Boolean)) {
    const r = await rectOf(sel);
    if (r) masks.push(r);
  }

  const boxes: Region[] = [];
  const missing: string[] = [];
  for (const t of targets) {
    if (t.kind !== 'mobile') continue;
    const r = await rectOf(t.selector);
    if (r) boxes.push(r);
    else missing.push(t.name);
  }

  const caps = driver.capabilities as Record<string, unknown>;
  const envDevice = [
    driver.isIOS ? 'iOS' : 'Android',
    caps['deviceName'] ?? caps['appium:deviceName'] ?? '',
    caps['platformVersion'] ?? caps['appium:platformVersion'] ?? '',
  ].filter(Boolean).join(' ');
  return { image, masks, boxes, missing, envDevice };
}

/* ------------------------------ main ----------------------------- */

export async function captureEvidence(world: CustomWorld, d: EvidenceDetails): Promise<EvidenceFiles | null> {
  const kind = world.page ? 'web' : world.driver ? 'mobile' : null;
  if (!kind) return null;

  const targets = [...evidenceTracker.targets(), ...(d.targets ?? [])];
  const cap = kind === 'web' ? await webCapture(world, targets) : await mobileCapture(world, targets);
  const { width, height } = pngSize(cap.image);

  const tcId = world.testCaseIds.join(',') || 'NO-ID';
  const ts = timestamp();
  const step = `Step ${d.stepNumber ?? '?'}: ${d.stepName}`;
  const expected = d.expected ?? world.expectedText ?? `Not recorded — see original test case ${tcId}`;
  const actual = d.actual ?? world.actualText ?? 'Not recorded';
  const reason = d.reason ?? world.reasonText ?? 'Cause not determined';
  const envLine = `${cap.envDevice} | ${width}x${height} | ${env.str('TEST_ENV', 'local')} | ${localDateTime()}`;
  const note = cap.boxes.length === 0 && cap.missing.length ? `Element not found: ${cap.missing.join(', ')}` : undefined;

  // mask BEFORE saving anything
  const raw = await annotate({ image: cap.image, masks: cap.masks });
  const annotated = await annotate({
    image: cap.image,
    masks: cap.masks,
    boxes: cap.boxes,
    status: d.status,
    note,
    banner: { header: `${tcId} | ${step} | ${d.status}`, expected, actual, reason, env: envLine },
  });

  const rawFile = path.join(paths.screenshots, 'raw', kind, `${safe(tcId)}_${ts}.png`);
  const annFile = path.join(paths.screenshots, 'annotated', kind, `${safe(tcId)}_${ts}_annotated.png`);
  fs.mkdirSync(path.dirname(rawFile), { recursive: true });
  fs.mkdirSync(path.dirname(annFile), { recursive: true });
  fs.writeFileSync(rawFile, raw);
  fs.writeFileSync(annFile, annotated);

  const details = [
    `Test case: ${tcId}`, `Step: ${step}`, `Status: ${d.status}`, `Expected: ${expected}`, `Actual: ${actual}`,
    `Reason: ${reason}`, note ? `Note: ${note}` : '', `Env: ${envLine}`,
    kind === 'web' ? `URL: ${world.web.url()}` : '',
    cap.boxes.length ? `Marked regions: ${cap.boxes.length}` : '', cap.masks.length ? `Masked regions: ${cap.masks.length}` : '',
  ].filter(Boolean).join('\n');

  world.attach(raw, { mediaType: 'image/png', fileName: `Screenshot (raw) - ${step}` });
  world.attach(annotated, { mediaType: 'image/png', fileName: `Screenshot (annotated) - ${step}` });
  world.attach(details, { mediaType: 'text/plain', fileName: 'Evidence details' });

  world.evidenceCaptured = true;
  logger.warn(`${d.status} ${tcId} ${step} -> ${path.relative(paths.root, annFile)}`);
  return { raw: rawFile, annotated: annFile };
}
