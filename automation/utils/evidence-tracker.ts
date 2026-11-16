/**
 * Remembers the element a page/screen object last acted on, so failure evidence can box it.
 * Page objects call track() automatically through BasePage / BaseScreen.
 * Cucumber runs scenarios sequentially within a worker process, so module state is per-scenario
 * once reset() is called in the Before hook.
 */
import type { Locator } from 'playwright';

export type TrackedTarget =
  | { kind: 'web'; locator: Locator; name: string }
  | { kind: 'mobile'; selector: string; name: string };

let last: TrackedTarget | undefined;
const extra: TrackedTarget[] = [];

export const evidenceTracker = {
  /** Element currently being acted on / asserted. */
  set(target: TrackedTarget): void {
    last = target;
  },
  /** Additional issue regions to number (1, 2, 3 …) on the next evidence capture. */
  addIssue(target: TrackedTarget): void {
    extra.push(target);
  },
  targets(): TrackedTarget[] {
    return [...(last ? [last] : []), ...extra];
  },
  reset(): void {
    last = undefined;
    extra.length = 0;
  },
};
