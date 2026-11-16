#!/usr/bin/env tsx
/**
 * Gate (skill: tagging-and-suites). For every scenario in features/{web,mobile,api} (feature + scenario + Examples tags):
 *   - original test case ID tag (@TC-… with a TC_ID_PREFIXES prefix, or @id=<ID>)
 *   - exactly one platform tag matching its folder (@web / @mobile / @api)
 *   - at least one module tag, at least one suite tag, exactly one priority tag
 *   - every other tag is listed in README.md (tag list) and is lowercase-hyphenated (key=value: lowercase key)
 * The allowed tags are read from README.md between <!-- tag-list:start --> and <!-- tag-list:end -->.
 *
 *   tsx scripts/check-tags.ts
 */
import fs from 'fs';
import path from 'path';
import { paths } from '../support/config';
import { parseFeatures } from '../utils/features';
import { isTestCaseIdTag, TC_ID_PREFIXES } from '../config/traceability.config';

type Group = 'platform' | 'suite' | 'priority' | 'module' | 'optional' | 'metadata';

/* ------------------------- README tag list ------------------------- */
function readTagList(): Record<Group, string[]> {
  const readme = fs.readFileSync(path.join(paths.root, 'README.md'), 'utf8');
  const block = readme.split('<!-- tag-list:start -->')[1]?.split('<!-- tag-list:end -->')[0];
  if (!block) throw new Error('README.md has no tag list (<!-- tag-list:start --> … <!-- tag-list:end -->)');
  const groups: Record<Group, string[]> = { platform: [], suite: [], priority: [], module: [], optional: [], metadata: [] };
  for (const line of block.split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 3) continue;
    const g = cells[1].toLowerCase() as Group;
    if (!(g in groups)) continue;
    groups[g].push(...[...cells[2].matchAll(/`(@[^`]+)`/g)].map((m) => m[1].toLowerCase()));
  }
  return groups;
}

const allowed = readTagList();
const metaKeys = allowed.metadata.map((t) => t.replace(/=.*$/, '='));
const known = new Set([...allowed.platform, ...allowed.suite, ...allowed.priority, ...allowed.module, ...allowed.optional]);
const FORMAT = /^@[a-z0-9]+(-[a-z0-9]+)*$/;

const problems: string[] = [];
let scenarios = 0;

function checkScenario(rel: string, line: number, name: string, type: string, tags: string[]) {
  scenarios++;
  const where = `${rel}:${line} "${name}"`;
  const lower = tags.map((t) => t.toLowerCase());

  if (!tags.some(isTestCaseIdTag)) problems.push(`${where}: no test case ID tag (@${TC_ID_PREFIXES[0]}-… or @id=<ID>)`);

  const platforms = lower.filter((t) => allowed.platform.includes(t));
  if (platforms.length !== 1 || platforms[0] !== `@${type}`) {
    problems.push(`${where}: needs exactly one platform tag @${type} (found: ${platforms.join(' ') || 'none'})`);
  }
  if (!lower.some((t) => allowed.module.includes(t))) {
    problems.push(`${where}: no module tag (allowed: ${allowed.module.join(' ') || 'none listed yet — add the module to the README tag list'})`);
  }
  if (!lower.some((t) => allowed.suite.includes(t))) problems.push(`${where}: no suite tag (${allowed.suite.join(' / ')})`);
  const prio = lower.filter((t) => allowed.priority.includes(t));
  if (prio.length !== 1) problems.push(`${where}: needs exactly one priority tag (${allowed.priority.join(' / ')}), found ${prio.length}`);

  for (const t of tags) {
    if (isTestCaseIdTag(t)) continue;
    const kv = t.match(/^(@[^=]+=)(.+)$/);
    if (kv) {
      if (!metaKeys.includes(kv[1])) problems.push(`${where}: unknown tag ${t} (add it to the README tag list first)`);
      else if (kv[1] !== kv[1].toLowerCase()) problems.push(`${where}: tag key must be lowercase: ${t}`);
      continue;
    }
    if (!FORMAT.test(t)) problems.push(`${where}: tag ${t} must be lowercase and hyphenated`);
    else if (!known.has(t)) problems.push(`${where}: unknown tag ${t} (add it to the README tag list first)`);
  }
}

/* ------------------------- feature parsing ------------------------- */
for (const sc of parseFeatures()) checkScenario(sc.file, sc.line, sc.name, sc.type, sc.tags);

if (problems.length) {
  console.error(`Tag check failed (${problems.length}):\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}
console.log(`Tag check passed: ${scenarios} scenario(s) — TC ID, platform, module, suite and priority tags present; all tags listed in README.`);
