---
name: spiderweb-update
description: Use when the user asks to mark a task complete, "task X.Y is done", or needs to flip task checkboxes. Also handles unchecking tasks and auto-setting sprint/phase/epic completion status.
---

# spiderweb-update — Mark Tasks Complete

Flips task checkboxes in sprint plans via a JSON manifest. Auto-sets `data-status="completed"` on the sprint when all tasks are checked. Then regenerates indexes so phase/epic/root status reflect the change.

## Tools

| Script | Role |
|--------|------|
| `mark-tasks-complete.mjs` | Flip checkboxes, auto-set sprint status |
| `generate-index.mjs` | Regenerate all index.html pages |
| `validate-docs.mjs` | Confirm docs are still valid |

## Manifest Format

The script reads a JSON manifest from stdin or a `--file` argument:

```json
{
  "tasks": [
    { "doc": "epics/<epic>/<phase>/<sprint-dir>/sprint.html", "task_id": "1.1" },
    { "doc": "epics/<epic>/<phase>/<sprint-dir>/sprint.html", "task_id": "1.2" }
  ]
}
```

The `doc` path is relative to `Docs/`.

## Flags

| Flag | Purpose |
|------|---------|
| `--file <path>` | Read manifest from a JSON file instead of stdin |
| `--uncheck` | Uncheck tasks instead of checking them (reverse operation) |

## Workflow: Mark Tasks Complete

1. Identify which tasks are done. Get the sprint's `sprint.html` path and the task IDs.
2. Build the JSON manifest with the correct `doc` (relative to `Docs/`) and `task_id` values.
3. Pipe to the script:
   ```bash
   echo '{"tasks":[{"doc":"epics/v1.0-local-canvas/phase-0/sprint-0-repo-setup/sprint.html","task_id":"1.1"},{"doc":"epics/v1.0-local-canvas/phase-0/sprint-0-repo-setup/sprint.html","task_id":"1.2"}]}' | node Docs/scripts/mark-tasks-complete.mjs
   ```
4. The script outputs a JSON array of results. Check for:
   - `"status":"checked"` — success
   - `"status":"not_found"` — task ID doesn't exist in that sprint
   - `"status":"no_checkbox"` — the `<li>` exists but has no checkbox
   - `"status":"sprint_completed"` — bonus: the sprint is now fully complete

5. After marking, run the post-update pipeline:
   ```bash
   node Docs/scripts/generate-index.mjs
   node Docs/scripts/validate-docs.mjs
   ```

## Workflow: Uncheck a Task (Reverse)

1. Build the same manifest format
2. Add `--uncheck` flag:
   ```bash
   echo '{"tasks":[{"doc":"epics/.../sprint.html","task_id":"1.1"}]}' | node Docs/scripts/mark-tasks-complete.mjs --uncheck
   ```
3. This removes the `checked` attribute and reverts sprint status from `completed` to `active` if needed.
4. Run post-update pipeline.

## Auto-Completion Logic

The script checks: if ALL `<li data-task-id>` items in the sprint have `checked` checkboxes → sets `data-status="completed"` on the sprint `<article>`.

The `generate-index.mjs` script then cascades this: if all sprints in a phase are completed → phase is completed; if all phases in an epic are completed → epic is completed.

## Key Behaviors

- Only operates on sprint-plan documents (`data-doc-type="sprint-plan"`)
- Only flips checkboxes on `<li data-task-id>` items — does not touch verification checkboxes in the acceptance criteria section
- The `doc` path in the manifest is relative to `Docs/`, not the repo root
- The script rewrites the entire HTML file — it serializes the DOM back to HTML with `<!DOCTYPE html>` prepended
- Always run `generate-index.mjs` after marking tasks — phase/epic/root indexes need to reflect new status

## Files Referenced
- `Docs/scripts/mark-tasks-complete.mjs`
- `Docs/scripts/generate-index.mjs`
- `Docs/scripts/validate-docs.mjs`
- Target sprint files (read + write)
- All index files (written by generate-index.mjs)
