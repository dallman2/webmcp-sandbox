---
name: spiderweb-drift
description: Use when the user asks if docs have diverged from the codebase, "check for drift", "are the docs still accurate?", or wants to cross-reference data-files against actual files on disk.
---

# spiderweb-drift — Detect Doc-Code Divergence

Cross-references `data-files` attributes in sprint plans against the actual filesystem. Validates test commands in verification sections. Checks external links. Produces a categorized findings report.

## Tools

- **Script**: `Docs/scripts/check-doc-drift.mjs`
- **Output**: JSON findings (3 categories) or HTML audit report

## Flags

| Flag | Purpose |
|------|---------|
| `--repo-root <path>` | Explicit repo root path (bypasses auto-detection) |
| `--audit-output <path>` | Write findings as an HTML audit report |

## Repo Root Detection (auto, in order)

1. `--repo-root` CLI flag (explicit)
2. `SPIDERWEB_REPO_ROOT` environment variable
3. Walk up from `Docs/` looking for `.git/` directory
4. Walk up from `Docs/` looking for `package.json`
5. Return `null` (no repo root found — file checks will be skipped)

## Finding Categories

### Category 1: File Existence

Checks every file path in `<data data-files="...">` attributes against the filesystem.

**Finding**: `path/to/file.ts` → `missing` (file does not exist)  
**Fix**: Update the `data-files` attribute or the task prose to reflect the correct file path. If the file was deleted, remove the path.

### Category 2: Test Commands

Extracts commands from `<code>` blocks in the verification section. Validates:
- `pnpm --filter @scope/name <script>`: checks that the package exists and the script is in its `package.json`
- `pnpm <script>` (no filter): checks root `package.json`
- `npm run <script>`: checks root `package.json`
- `yarn <script>`: checks root `package.json`
- `bun run <script>`: checks root `package.json`
- `node Docs/scripts/<name>.mjs`: checks that the script file exists
- `npx <tool>`: skipped (cannot statically validate)

**Finding**: `npm run check` → `script_not_found` (script 'check' not in package.json)  
**Fix**: Update the command in the verification section to match an actual script name, or add the script to `package.json`.

### Category 3: External Links

Checks `<a href="...">` links that point outside the `Docs/` directory tree.

**Finding**: `<a href="../DESIGN.md">` → `broken` (file does not exist)  
**Fix**: Fix the href or remove the link.

## Workflow

1. Run `node Docs/scripts/check-doc-drift.mjs --repo-root <path>`
2. Parse the JSON output. Summarize by category with counts.
3. For each finding, determine the fix and apply it.
4. Optionally generate an HTML audit report:
   ```bash
   node Docs/scripts/check-doc-drift.mjs --repo-root <path> --audit-output Docs/audits/drift-YYYY-MM-DD.html
   ```
5. The HTML report is itself a valid spiderweb audit doc — it will pass `validate-docs.mjs`.

## Key Behaviors

- Only operates on sprint-plan documents with valid `data-epic` (skips templates with `EPIC_NAME` placeholder)
- Glob patterns in `data-files` (e.g., `**/*.ts`) are skipped — cannot stat wildcards
- Common script names (`test`, `build`, `typecheck`, `dev`, `start`, `lint`, `serve`) are assumed valid and not flagged
- `npx` commands are always skipped — there's no filesystem check for globally installed tools

## Files Referenced
- `Docs/scripts/check-doc-drift.mjs`
- All sprint plan files (read)
- The codebase files referenced in `data-files` (read, stat'd)
