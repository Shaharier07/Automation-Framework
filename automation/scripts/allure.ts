#!/usr/bin/env tsx
/**
 * Allure report generation, organised by execution type.
 *
 *   tsx scripts/allure.ts generate <web|mobile|api|all> [--open]
 *   tsx scripts/allure.ts open     <web|mobile|api|all>
 *
 * Results: reports/allure-results/<type>   Reports: reports/allure-report/<type>
 * "all" merges web + mobile + api into one report.
 */
import fs from 'fs';
import path from 'path';
import { paths, EXECUTION_TYPES, type ExecutionType } from '../support/config';
import { bin, parseArgs, run } from './lib';

type ReportName = ExecutionType | 'all';

const categories = [
  { name: 'Product defects', matchedStatuses: ['failed'] },
  { name: 'Test / automation defects', matchedStatuses: ['broken'] },
  { name: 'Blocked / environment issues', matchedStatuses: ['broken', 'failed'], messageRegex: '.*(ECONNREFUSED|timeout|Timeout|session not created|Could not start|net::ERR_).*' },
  { name: 'Skipped', matchedStatuses: ['skipped'] },
];

function hasResults(type: ExecutionType): boolean {
  const dir = paths.allureResults(type);
  return fs.existsSync(dir) && fs.readdirSync(dir).some((f) => f.endsWith('-result.json'));
}

function prepare(type: ExecutionType, reportName: ReportName): void {
  const results = paths.allureResults(type);
  fs.writeFileSync(path.join(results, 'categories.json'), JSON.stringify(categories, null, 2));
  // keep trend history between runs
  const history = path.join(paths.allureReport(reportName), 'history');
  if (fs.existsSync(history)) fs.cpSync(history, path.join(results, 'history'), { recursive: true });
}

function generate(name: ReportName): number {
  const types = name === 'all' ? EXECUTION_TYPES.filter(hasResults) : [name].filter(hasResults);
  if (types.length === 0) {
    console.log(`No Allure results for "${name}". Run the tests first (npm run test:${name === 'all' ? 'regression' : name}).`);
    return 1;
  }
  types.forEach((t) => prepare(t, name));
  const out = paths.allureReport(name);
  const code = run(bin('allure'), ['generate', ...types.map(paths.allureResults), '-o', out, '--clean']);
  if (code === 0) console.log(`Allure report (${name}): ${path.relative(process.cwd(), path.join(out, 'index.html'))}`);
  return code;
}

function open(name: ReportName): number {
  const dir = paths.allureReport(name);
  if (!fs.existsSync(path.join(dir, 'index.html'))) {
    console.log(`No report at ${dir}. Run: npm run report:${name}`);
    return 1;
  }
  return run(bin('allure'), ['open', dir]);
}

const [action, nameArg = 'all', ...rest] = process.argv.slice(2);
const name = nameArg as ReportName;
if (!['generate', 'open'].includes(action) || ![...EXECUTION_TYPES, 'all'].includes(name)) {
  console.error('Usage: tsx scripts/allure.ts <generate|open> <web|mobile|api|all> [--open]');
  process.exit(2);
}
const { opts } = parseArgs(rest, ['open']);
let code = action === 'generate' ? generate(name) : open(name);
if (code === 0 && action === 'generate' && opts.open) code = open(name);
process.exit(code);
