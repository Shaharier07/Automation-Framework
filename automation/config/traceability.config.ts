/**
 * How a scenario tag links to an original test case ID. Two styles are accepted:
 *   @id=TC-WEB-012          explicit — works for ANY ID format (also @id=A,B for several IDs)
 *   @TC-WEB-012             the ID itself — recognised when it starts with one of TC_ID_PREFIXES
 * TC_ID_PREFIXES (.env, comma-separated, default "TC") e.g. "TC,WEB,MOB,API".
 * Sub-scenarios of one test case (skill test-case-to-gherkin): TC-WEB-012-a, -b … roll up to TC-WEB-012
 * (single-letter suffix; disable with TC_ID_SUBSCENARIO_SUFFIX=false).
 * Used by: Cucumber hooks (evidence), Allure labels, Excel update, check:tags. The Karate hook mirrors it (Java).
 */
import { env } from '../support/config';

export const TC_ID_PREFIXES = env.str('TC_ID_PREFIXES', 'TC').split(',').map((p) => p.trim()).filter(Boolean);

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PREFIX_TAG = new RegExp(`^@?((?:${TC_ID_PREFIXES.map(escape).join('|')})[-_]\\S+)$`, 'i');
const EXPLICIT_TAG = /^@?id[=:](.+)$/i;

const SUB_SUFFIX = env.bool('TC_ID_SUBSCENARIO_SUFFIX', true) ? /-[a-z]$/ : null;

/** Original test case ID for a scenario ID: TC-WEB-012-a -> TC-WEB-012. */
export function baseTestCaseId(id: string): string {
  return SUB_SUFFIX ? id.replace(SUB_SUFFIX, '') : id;
}

/** Original test case IDs referenced by one tag ('' tags or unrelated tags -> []). */
export function idsFromTag(tag: string): string[] {
  const t = tag.trim();
  const explicit = t.match(EXPLICIT_TAG);
  if (explicit) return explicit[1].split(',').map((v) => baseTestCaseId(v.trim())).filter(Boolean);
  const prefixed = t.match(PREFIX_TAG);
  return prefixed ? [baseTestCaseId(prefixed[1])] : [];
}

/** Unique test case IDs from a list of tags, in order. */
export function testCaseIdsFromTags(tags: string[]): string[] {
  return [...new Set(tags.flatMap(idsFromTag))];
}

export const isTestCaseIdTag = (tag: string): boolean => idsFromTag(tag).length > 0;
