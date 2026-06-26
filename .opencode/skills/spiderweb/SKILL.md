---
name: spiderweb
description: Use when the user first asks about spiderweb docs, needs to understand the system, or asks "how do I use the docs?". Load this skill before any other spiderweb skill to establish context.
---

# Spiderweb Overview

## What Spiderweb Is

Spiderweb is an HTML-based planning-and-documentation system designed for use by AI agents. It uses semantic `<article>`, `<section>`, and `data-*` attributes to make docs machine-queryable. Agents (including you) can discover open work, validate doc integrity, scaffold new epics/sprints, mark tasks complete, and detect drift between docs and the codebase — all via deterministic scripts.

## Directory Layout

```
Docs/
  css/                  design-tokens.css, docs-base.css, docs-print.css, docs-schema.js
  scripts/              8 standalone ESM scripts + vitest suites
  templates/            8 HTML boilerplate templates
  epics/<epic>/
    epic-overview.html  Prose specification for the epic
    epic-backlog.html   Deferred features (optional)
    risk-registry.html  Active risks and open questions (optional)
    index.html          Auto-generated phase listing
    phase-<N>/
      index.html        Auto-generated sprint listing
      sprint-<N>-<name>/
        sprint.html     Sprint execution plan with tasks
        retrospective.html
  architecture/         System architecture docs
  audits/               Audit reports
  references/           External references and research notes
  playbooks/            Intent-based e2e test documents
  index.html            Auto-generated root index
```

## Hierarchy: Epic → Phase → Sprint → Task

Every sprint plan is the core work unit. Each sprint contains numbered task items (`<li data-task-id="X.Y">`) with checkboxes. Agents mark tasks complete; the system auto-calculates sprint/phase/epic completion status.

## data-* Attribute Taxonomy

| Attribute | Values |
|-----------|--------|
| `data-doc-type` | `sprint-plan`, `epic-overview`, `epic-index`, `phase-index`, `root-index`, `audit`, `reference`, `retrospective`, `residual`, `risk-registry`, `epic-backlog`, `playbook`, `playbook-index` |
| `data-epic` | e.g. `v1.0-local-canvas` |
| `data-phase` | e.g. `0` |
| `data-sprint` | e.g. `0`, `1.1` |
| `data-status` | `planned`, `active`, `completed`, `blocked`, `backlog`, `draft` |
| `data-task-id` | e.g. `1.1`, `2.3` |
| `data-files` | Space-separated file paths relative to repo root |

## Script Index

| Script | Purpose | When to invoke |
|--------|---------|----------------|
| `query-open-tasks.mjs` | List all unchecked tasks grouped by epic/phase/sprint | "What's undone?" |
| `validate-docs.mjs` | Check schema conformance, links, breadcrumbs | After any doc mutation |
| `generate-index.mjs` | Regenerate all index.html pages | After hierarchy changes |
| `mark-tasks-complete.mjs` | Flip task checkboxes | After completing code work |
| `check-doc-drift.mjs` | Cross-reference data-files against filesystem | "Has code diverged from docs?" |
| `populate-data-files.mjs` | Extract file paths from task prose | After writing new tasks |
| `serve.mjs` | Static file server on localhost:4040 | "Show me the docs" |
| `convert-md-to-html.mjs` | One-time markdown → HTML migration | Bootstrapping from legacy docs |

All scripts are standalone Node.js ESM. Run with:
```bash
node Docs/scripts/<name>.mjs [flags]
```

## Skill Map — Which Skill Loads Next

Based on user intent, load the appropriate skill:

| Intent | Skill to load |
|--------|---------------|
| "Bootstrap docs into my repo" or "Set up spiderweb" | `spiderweb-bootstrap` |
| "What work is undone?" or "Show me open tasks" | `spiderweb-query` |
| "Create a new epic/sprint" or "Scaffold X" | `spiderweb-scaffold` |
| "Mark task X done" or "Task N.M is complete" | `spiderweb-update` |
| "Are the docs valid?" or after any doc edit | `spiderweb-validate` |
| "Has code diverged from docs?" or "Check drift" | `spiderweb-drift` |
| "Show me the docs" or "Serve docs" | `spiderweb-serve` |
| "How do I use spiderweb?" or anything else | You're already here |
