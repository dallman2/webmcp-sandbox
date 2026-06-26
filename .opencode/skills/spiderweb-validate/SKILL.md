---
name: spiderweb-validate
description: Use after any doc mutation (task completion, new sprint, index regen, edit). Validates HTML structure, data-* schema conformance, link integrity, and breadcrumb presence.
---

# spiderweb-validate — Doc Integrity Check

Validates all HTML docs in `Docs/` against the spiderweb semantic schema. MUST be run after any doc mutation.

## Tools

- **Script**: `Docs/scripts/validate-docs.mjs`
- **Schema**: `Docs/css/docs-schema.js` (uses `linkedom` for DOM parsing)
- **Checks**: Schema compliance, link integrity, breadcrumb presence, epic directory existence

## Flags

| Flag | Purpose |
|------|---------|
| `--verbose` | Print each violation with file path |

## Workflow

1. Run `node Docs/scripts/validate-docs.mjs --verbose`
2. Parse the output. Each violation is formatted as: `<file>: <message>`
3. Categorize violations and fix each:

| Category | Example Violation | Fix |
|----------|------------------|-----|
| Schema | `Missing required section: <section id="execution-plan">` | Add the missing `<section id="execution-plan">` with an `<h2>` |
| Schema | `Invalid data-status: "inprogress". Must be one of: ...` | Change to a valid status value |
| Schema | `Task li[data-task-id="1.1"] is missing <input type="checkbox">` | Add `<input type="checkbox">` before the task content |
| Links | `Broken link: ../../DESIGN.html` | Fix the href or remove the link |
| Breadcrumb | `Missing breadcrumb: <nav class="breadcrumb" ...>` | Add breadcrumb nav at end of `<article>` |
| Epic dir | `data-epic "foo" does not match any epic directory` | Fix the `data-epic` attribute value |
| Missing article | `No <article data-doc-type="..."> found` | Wrap content in `<article data-doc-type="...">` |

4. Fix all violations and re-run until zero violations
5. Report the final result: `N files checked, N valid, 0 violation(s)`

## Key Behaviors

- Walks the entire `Docs/` tree (skips `node_modules/` and dotfiles)
- Templates in `Docs/templates/` will always show violations (they use `EPIC_NAME` placeholder) — these are expected and can be ignored
- Run this after: `mark-tasks-complete.mjs`, `generate-index.mjs`, manually editing any HTML doc, scaffolding a new sprint/epic

## Files Referenced
- `Docs/scripts/validate-docs.mjs`
- `Docs/css/docs-schema.js`
- All `Docs/**/*.html` files (read, not written)
