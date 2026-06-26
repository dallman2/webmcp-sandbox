---
name: spiderweb-query
description: Use when the user asks what work is undone, what tasks are open, "what's remaining?", or needs an inventory of unchecked tasks across epics/phases/sprints.
---

# spiderweb-query — Open Task Inventory

Reports all unchecked tasks from the Docs/ HTML tree, grouped by epic → phase → sprint.

## Tools

- **Script**: `Docs/scripts/query-open-tasks.mjs`
- **DOM parsing**: `linkedom`
- **Input**: Walk all HTML files, find `<li data-task-id>` with unchecked `<input type="checkbox">`
- **Output**: JSON grouped by `total_open`, then `epics → phases → sprints → tasks`

## Flags

| Flag | Purpose |
|------|---------|
| `--epic <name>` | Filter to a single epic |
| `--phase <num>` | Filter to a single phase (requires `--epic`) |

## Workflow

1. Run `node Docs/scripts/query-open-tasks.mjs [--epic <name>] [--phase <num>]`
2. Parse the JSON output
3. Present a readable summary to the user:

```
Open Tasks by Epic:
  v1.0-local-canvas
    Phase 4
      Sprint 1: Core Foundation (3 open)
        Task 1.1: Set up Express server [docs: epics/v1.0-local-canvas/phase-4/sprint-1-core-foundation/sprint.html]
        Task 1.2: Configure Postgres pool
        Task 1.3: Set up Redis client
```

4. If output is empty (no unchecked tasks): report "All tasks are complete across all sprints."

## Key Behaviors

- Only queries sprint-plan documents — does not check epic overview acceptance criteria, audit checklists, or other doc types
- Tasks with no checkbox or with `checked` attribute are excluded
- The `doc_path` value is relative to `Docs/` — the sprint plan containing the task
- The `files` array in JSON lists file paths from the task's `<data data-files="...">` attribute

## Files Referenced
- `Docs/scripts/query-open-tasks.mjs`
- All `Docs/epics/**/*.html` files (read, not written)
