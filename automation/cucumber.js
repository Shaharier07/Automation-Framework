/**
 * Cucumber profiles (web, mobile). TypeScript is loaded through tsx.
 * Allure results are written per execution type: reports/allure-results/<type>
 */
const path = require('path');

// Isolated re-run (result-verifier): separate result folders so the executor's run stays intact
const RERUN = process.env.AUTOMATION_RERUN === '1';
const RESULTS = RERUN ? 'allure-results-rerun' : 'allure-results';
const CUCUMBER = RERUN ? 'cucumber-rerun' : 'cucumber';

// Tag labels (TC ID tags, @severity=, @epic=, @story=, @owner=) are added after each run by utils/allure-results.ts (enrichTagLabels),
// so web, mobile and Karate API share one tagging convention.
const allureFormatOptions = (type) => ({
  resultsDir: path.join('reports', RESULTS, type),
  labels: [],
});

const profile = (type) => ({
  requireModule: ['tsx/cjs'],
  require: ['support/**/*.ts', `step-definitions/${type}/**/*.ts`, 'step-definitions/common/**/*.ts'],
  paths: [`features/${type}/**/*.feature`],
  format: [
    'progress',
    [`allure-cucumberjs/reporter`, path.join('reports', '.tmp', `allure-formatter-${type}.log`)],
    `json:reports/${CUCUMBER}/${type}/cucumber-report.json`,
    `html:reports/${CUCUMBER}/${type}/cucumber-report.html`,
  ],
  formatOptions: { snippetInterface: 'async-await', ...allureFormatOptions(type) },
});

module.exports = {
  default: profile('web'),
  web: profile('web'),
  mobile: profile('mobile'),
};
