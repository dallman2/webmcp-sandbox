---
name: spiderweb-bootstrap
description: Use when the user wants to add Spiderweb docs to a project, "bootstrap docs into my repo", "set up spiderweb", or needs to initialize the Docs/ tree in a target repository.
---

# spiderweb-bootstrap — Initialize Docs in a Target Repo

Bootstraps a full Spiderweb `Docs/` tree into any project repository. This is the **first and only setup step** — one command and the project is ready.

## What It Does

`bootstrap.sh` performs these steps automatically:

1. **Creates the directory tree**: `Docs/css/`, `Docs/scripts/`, `Docs/templates/`, `Docs/epics/`, `Docs/architecture/`, `Docs/audits/`, `Docs/references/`, `Docs/playbooks/`
2. **Copies CSS**: design tokens, base styles, print styles, schema JS
3. **Copies scripts**: all 8 standalone ESM scripts + vitest suites + package.json
4. **Copies templates**: all 8 HTML boilerplate files
5. **Copies agent skills and rules**: into `.opencode/skills/` and `.opencode/rules/`
6. **Installs npm dependencies**: runs `npm install` in `Docs/scripts/`
7. **Auto-detects project name**: from `package.json` or directory name
8. **Creates a first epic**: `v0.0-baseline` with `phase-0/sprint-0-bootstrap/sprint.html` — pre-populated with architecture, audit, and planning tasks
9. **Generates index pages**: runs `generate-index.mjs`
10. **Appends to AGENTS.md**: adds a Spiderweb section explaining available scripts so agents discover the docs system

## Prerequisites

- **Node.js 20+** and **npm** installed
- A clone of the spiderweb repo alongside the target repo

## Workflow

1. Confirm the spiderweb repo exists alongside the target:
   ```
   ~/repos/
     spiderweb/     ← this repo (already cloned)
     my-project/    ← target project
   ```

2. Run the bootstrap script from the **target project root**:
   ```bash
   ../spiderweb/bootstrap.sh .
   ```
   Or from anywhere, specify the target path:
   ```bash
   ../spiderweb/bootstrap.sh /path/to/target
   ```

3. The script outputs progress for each step and prints next steps on completion.

4. After bootstrapping, verify:
   ```bash
   node Docs/scripts/serve.mjs
   ```
   Open `http://localhost:4040` and browse to `epics/v0.0-baseline/phase-0/sprint-0-bootstrap/sprint.html`

5. Populate Sprint 0 with your project's actual tasks (edit `Docs/epics/v0.0-baseline/phase-0/sprint-0-bootstrap/sprint.html`)

6. Validate: `node Docs/scripts/validate-docs.mjs`

## What Gets Created

```
my-project/
  Docs/
    css/                  design-tokens.css, docs-base.css, docs-print.css, docs-schema.js
    scripts/              8 .mjs scripts + package.json + vitest config
    templates/            8 HTML boilerplate files
    epics/
      v0.0-baseline/
        epic-overview.html   Pre-populated epic overview
        phase-0/
          sprint-0-bootstrap/
            sprint.html      Pre-populated sprint plan with tasks
    architecture/
    audits/
    references/
    playbooks/
    index.html              Auto-generated root index
  .opencode/
    skills/                 7 spiderweb skill files
    rules/                  spiderweb rule file
  AGENTS.md                Appended with Spiderweb docs section
```

## Key Behaviors

- Safe to re-run: does not overwrite existing files in the target (it will overwrite copied CSS/scripts/templates but not user-edited docs)
- Warns (but continues) if target doesn't have `.git/` or `package.json`
- Generates `index.html` files at root, epic, and phase levels
- The bootstrap script itself lives in the spiderweb repo at `bootstrap.sh`

## Files Referenced
- `bootstrap.sh` (in spiderweb repo root)
- `Docs/css/*` (copied to target)
- `Docs/scripts/*` (copied to target)
- `Docs/templates/*` (copied to target)
- `.opencode/skills/*` (copied to target)
- `.opencode/rules/*` (copied to target)
