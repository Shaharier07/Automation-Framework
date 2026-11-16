#!/usr/bin/env tsx
/**
 * Framework health check — validates tooling and wiring, does NOT run application tests.
 *   tsx scripts/verify.ts
 */
import fs from 'fs';
import path from 'path';
import * as playwright from 'playwright';
import { paths } from '../support/config';
import { bin, capture, isWin } from './lib';

type Level = 'ok' | 'warn' | 'fail';
const rows: { area: string; check: string; level: Level; info: string }[] = [];
const add = (area: string, check: string, level: Level, info = '') => rows.push({ area, check, level, info });

function cmd(area: string, check: string, command: string, args: string[], required = true, fix = '') {
  const r = capture(command, args);
  const info = r.out.split('\n')[0] ?? '';
  add(area, check, r.ok ? 'ok' : required ? 'fail' : 'warn', r.ok ? info : fix || info);
  return r;
}

async function main() {
  // ---------- toolchain ----------
  add('Tooling', 'Node.js', Number(process.versions.node.split('.')[0]) >= 20 ? 'ok' : 'fail', process.version);
  cmd('Tooling', 'Java (Karate/Allure)', 'java', ['-version']);
  cmd('Tooling', 'Maven (Karate)', isWin ? 'mvn.cmd' : 'mvn', ['-v']);
  const hasEnv = fs.existsSync(path.join(paths.root, '.env'));
  add('Config', '.env', hasEnv ? 'ok' : 'fail', hasEnv ? 'present' : 'cp .env.example .env');
  cmd('Config', 'TypeScript typecheck', bin('tsc'), ['-p', '.']);

  // ---------- web ----------
  for (const name of ['chromium', 'firefox', 'webkit'] as const) {
    try {
      const b = await playwright[name].launch({ headless: true });
      await (await b.newPage()).setContent('<p>ok</p>');
      await b.close();
      add('Web', `Playwright ${name}`, 'ok', 'launches');
    } catch (e) {
      add('Web', `Playwright ${name}`, 'fail', 'npm run setup:browsers');
    }
  }
  cmd('Web', 'Cucumber web wiring (dry run)', bin('cucumber-js'), ['--profile', 'web', '--dry-run']);

  // ---------- mobile ----------
  cmd('Mobile', 'Appium server', bin('appium'), ['--version']);
  const drivers = capture(bin('appium'), ['driver', 'list', '--installed', '--json']);
  let installed: string[] = [];
  try { installed = Object.keys(JSON.parse(drivers.stdout)); } catch { /* ignore */ }
  for (const d of ['uiautomator2', 'xcuitest']) {
    add('Mobile', `Appium driver ${d}`, installed.includes(d) ? 'ok' : 'fail', installed.includes(d) ? 'installed' : 'npm run setup:appium-drivers');
  }
  add('Mobile', 'ANDROID_HOME', process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT ? 'ok' : 'warn',
    process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || 'not set — needed for Android runs');
  cmd('Mobile', 'adb (Android)', 'adb', ['version'], false, 'not on PATH — needed for Android runs');
  if (process.platform === 'darwin') cmd('Mobile', 'Xcode (iOS)', 'xcodebuild', ['-version'], false, 'Xcode not installed — needed for iOS runs');
  cmd('Mobile', 'Cucumber mobile wiring (dry run)', bin('cucumber-js'), ['--profile', 'mobile', '--dry-run']);

  // ---------- api ----------
  cmd('API', 'Karate project compiles', isWin ? 'mvn.cmd' : 'mvn', ['-q', '-B', '--no-transfer-progress', '-f', path.join('api', 'pom.xml'), 'test-compile']);

  // ---------- reporting ----------
  cmd('Reports', 'Allure CLI', bin('allure'), ['--version']);
  add('Reports', 'exceljs', fs.existsSync(path.join(paths.root, 'node_modules', 'exceljs')) ? 'ok' : 'fail');

  // ---------- print ----------
  const icon = { ok: '✔', warn: '!', fail: '✘' };
  let area = '';
  for (const r of rows) {
    if (r.area !== area) console.log(`\n${(area = r.area)}`);
    console.log(`  ${icon[r.level]} ${r.check.padEnd(34)} ${r.info}`);
  }
  const fails = rows.filter((r) => r.level === 'fail').length;
  const warns = rows.filter((r) => r.level === 'warn').length;
  console.log(`\n${fails ? `✘ ${fails} blocking issue(s)` : '✔ Framework ready'}${warns ? `, ${warns} warning(s)` : ''}.\n`);
  process.exit(fails ? 1 : 0);
}

main();
