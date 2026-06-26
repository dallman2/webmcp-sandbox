# Spiderweb Docs Rule

When a repository has `Docs/css/docs-base.css` and `Docs/scripts/serve.mjs` present at its root, the following spiderweb agent skills are available:

- `spiderweb` — System overview, directory layout, script index, skill map
- `spiderweb-bootstrap` — Initialize the Docs/ tree in a target repo (one-command setup)
- `spiderweb-query` — Report open tasks across all epics/phases/sprints
- `spiderweb-validate` — Validate doc schema, links, breadcrumbs, epic directories
- `spiderweb-scaffold` — Create epics, phases, sprints, tasks from templates
- `spiderweb-update` — Mark tasks complete via JSON manifest, auto-set completion status
- `spiderweb-drift` — Cross-reference data-files against filesystem, validate test commands
- `spiderweb-serve` — Start static file server on localhost:4040

Load `spiderweb` first whenever the user's query involves documentation in this repo. Then load additional skills based on the user's intent.
