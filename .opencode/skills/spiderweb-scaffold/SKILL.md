---
name: spiderweb-scaffold
description: Use when the user asks to create a new epic, phase, sprint, or add tasks to an existing sprint. Handles template copying, data-* attribute population, data-files extraction, index regeneration, and validation.
---

# spiderweb-scaffold — Create Epics, Phases, Sprints, Tasks

Creates new doc artifacts in the `Docs/` hierarchy. Operates on templates from `Docs/templates/` and populates them with correct `data-*` attributes and content.

## Tools

| Script | Role |
|--------|------|
| Template copy (manual edit) | Copy template HTML → update placeholders → write to correct path |
| `populate-data-files.mjs` | Extract file paths from task prose into `data-files` attributes |
| `generate-index.mjs` | Regenerate all index.html navigation pages |
| `validate-docs.mjs` | Confirm the new artifact is schema-compliant |

## Template-to-Path Mapping

| What to create | Copy template | Destination |
|----------------|---------------|-------------|
| New sprint | `Docs/templates/sprint-plan.html` | `Docs/epics/<epic>/<phase>/<sprint-dir>/sprint.html` |
| New epic overview | `Docs/templates/epic-overview.html` | `Docs/epics/<epic>/epic-overview.html` |
| New epic backlog | `Docs/templates/epic-backlog.html` | `Docs/epics/<epic>/epic-backlog.html` |
| New risk registry | `Docs/templates/risk-registry.html` | `Docs/epics/<epic>/risk-registry.html` |
| New audit | `Docs/templates/audit.html` | `Docs/audits/<name>.html` |
| New reference | `Docs/templates/reference.html` | `Docs/references/<name>.html` |

## Workflow: New Sprint

1. Determine the correct destination path. Sprint directories follow the pattern:
   `Docs/epics/<epic>/phase-<N>/sprint-<N>-<kebab-name>/sprint.html`
2. Copy `Docs/templates/sprint-plan.html` to the destination
3. Update all placeholders in the copied file:
   - `<title>`: `Sprint N: Sprint Title — Phase N — EPIC_NAME`
   - `<article data-epic="...">`, `data-phase="...">`, `data-sprint="...">`, `data-status="planned">`
   - `<link rel="stylesheet" href="...">` — calculate correct relative depth to `Docs/css/docs-base.css`
   - `<h1>`: `Sprint N: Sprint Title`
   - Meta spans: Phase, Sprint, Depends-on values
   - Breadcrumb: links to epic index, phase index, current page
   - Section content: objective, rationale, scope, tech stack

### CSS Path Depth Calculation

Count the number of directory levels from the sprint's location up to `Docs/`:

```
Docs/epics/<epic>/phase-<N>/sprint-<N>-<name>/sprint.html
     ^1      ^2       ^3            ^4
```

4 levels up → `../../../../css/docs-base.css`

For simpler: count `/` segments in the relative path from `Docs/`. Each segment is one `../`.

4. Add task items. Each task follows this format:
   ```html
   <li data-task-id="1.1">
     <input type="checkbox">
     <div>
       <strong>Task 1.1: Task Title</strong>
       <data data-files="path/to/file.ts other/file.ts"></data>
       <p>Task description. Mention specific files in <code>code</code> tags for auto-population.</p>
     </div>
   </li>
   ```
5. After writing the file, run the post-scaffold pipeline:
   ```bash
   node Docs/scripts/populate-data-files.mjs --epic <epic-name>
   node Docs/scripts/generate-index.mjs
   node Docs/scripts/validate-docs.mjs --verbose
   ```
6. Fix any validation violations. Re-run validate until clean.

## Workflow: New Epic

1. Create the epic directory: `Docs/epics/<epic-name>/`
2. Create `phase-0/` inside it
3. Create the first sprint inside phase-0 (follow "New Sprint" workflow above)
4. Copy `Docs/templates/epic-overview.html` to `Docs/epics/<epic-name>/epic-overview.html`
5. Update placeholders: title, `data-epic`, `data-status`, content sections
6. Run post-scaffold pipeline

## Workflow: Add Task to Existing Sprint

1. Read the sprint's `sprint.html`
2. Add a new `<li data-task-id="X.Y">` with checkbox inside the appropriate `<ol>` in the execution plan section
3. Assign the next available task ID (e.g., if last task was 2.3, new task is 2.4)
4. Run `populate-data-files.mjs --epic <name>` to auto-fill `data-files`
5. Run `validate-docs.mjs` to confirm no violations

## Key Behaviors

- Never overwrite existing files without confirmation
- The `data-task-id` must be unique within the sprint
- Task numbers are `section.task` (e.g., tasks under `<h3>3. Group Name</h3>` get IDs `3.1`, `3.2`, ...)
- CSS path depth: count slashes from `Docs/` to the sprint directory, multiply by `../`
- Sprint directory name is `sprint-<number>-<kebab-name>` (e.g., `sprint-0-core-foundation`)

## Files Referenced
- `Docs/templates/sprint-plan.html`
- `Docs/templates/epic-overview.html`
- `Docs/templates/epic-backlog.html`
- `Docs/templates/risk-registry.html`
- `Docs/templates/audit.html`
- `Docs/templates/reference.html`
- `Docs/scripts/populate-data-files.mjs`
- `Docs/scripts/generate-index.mjs`
- `Docs/scripts/validate-docs.mjs`
