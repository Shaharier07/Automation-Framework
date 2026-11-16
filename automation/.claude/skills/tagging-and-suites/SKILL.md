---
name: tagging-and-suites
description: Use when adding tags to scenarios or defining which tests run in which suite. Trigger on "tags", "smoke", "regression", "suite", "run only".
---

# Tagging and Suites

## Required tags on every scenario
- Original test case ID (e.g. @TC-WEB-012)
- Platform: @web, @mobile, @api
- Module: @login, @checkout, etc.
- Suite: @smoke and/or @regression
- Priority: @critical, @high, @medium, @low

## Optional tags
- @android, @ios, @chromium, @firefox, @webkit for platform-specific cases
- @manual for NOT AUTOMATABLE cases tracked for reference
- @quarantine for flaky tests under investigation
- @wip for work in progress (never in a regression run)

## Rules
- Smoke covers only the critical paths and must stay fast.
- Tags are lowercase, hyphenated, and listed in README.md.
- Never invent a new tag without adding it to the README tag list.

## Implementation in this framework
- **Tag list:** README.md §7 "Tags", between `<!-- tag-list:start -->` and `<!-- tag-list:end -->`. It's the source of truth for `npm run check:tags`.
  To add a module, put it in backticks in the `module` row first (e.g. `` `@checkout` ``).
- **`npm run check:tags`** (part of `check:gate`) fails when a scenario (counting feature, scenario and Examples tags) is missing any of:
  - the TC ID
  - exactly one platform tag matching its folder
  - a module tag
  - a suite tag
  - exactly one priority tag

  It also fails on tags that aren't listed or aren't lowercase and hyphenated. TC ID tags keep their original form. `@id=`, `@epic=`, `@story=` and `@owner=` are the allowed `key=value` tags.
- **Applied automatically by `scripts/run.ts`:**
  - `@manual` never runs.
  - `test:regression` also excludes `@wip` and `@quarantine`.
  - Android runs skip `@ios`-only scenarios, and iOS runs skip `@android`-only ones.
  - Web runs skip scenarios tagged only for another browser.

  Your `--tags` filter is combined with these.
- **Suites:** `npm run test:web -- --tags "@smoke"`, `npm run test:regression`, or one case with `--tags "@TC-WEB-012"`.
- **Allure:** the priority tag sets the severity (critical→blocker, high→critical, medium→normal, low→minor). The TC ID sets `testCaseId`.
