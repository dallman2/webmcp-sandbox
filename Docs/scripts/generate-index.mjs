#!/usr/bin/env node
// generate-index.mjs — Regenerate all index.html navigation pages in Docs/.
// Usage: node Docs/scripts/generate-index.mjs [--dry-run]

import { parseHTML } from 'linkedom';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve, relative, dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stat as statAsync } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_ROOT = resolve(__dirname, '..');

// Title resolution: DOCS_TITLE env → .spiderweb.json → repo dir name → "Documentation"
function resolveTitle(docsRoot) {
  if (process.env.DOCS_TITLE) return process.env.DOCS_TITLE;
  try {
    const config = JSON.parse(readFileSync(join(docsRoot, '..', '.spiderweb.json'), 'utf-8'));
    if (config.title) return config.title;
  } catch {}
  try {
    const repoBasename = basename(resolve(docsRoot, '..'));
    if (repoBasename) return repoBasename;
  } catch {}
  return 'Documentation';
}

function cssPath(depth) {
  const up = '../'.repeat(depth);
  return up + 'css/docs-base.css';
}

async function sprintInfo(sprintDir) {
  const sprintFile = resolve(sprintDir, 'sprint.html');
  try {
    const html = await readFile(sprintFile, 'utf-8');
    const { document } = parseHTML(html);
    const article = document.querySelector('article');
    if (!article) return null;
    const h1 = document.querySelector('h1');

    // Collect all real checkboxes — exclude those inside <code> or <pre>
    // (which are inline code examples, not actual task items).
    const allCheckboxes = [...document.querySelectorAll('li[data-task-id] input[type="checkbox"]')].filter(cb => {
      let el = cb.parentElement;
      while (el) {
        if (el.tagName === 'CODE' || el.tagName === 'PRE') return false;
        el = el.parentElement;
      }
      return true;
    });

    const checkedCount = allCheckboxes.filter(cb => cb.hasAttribute('checked')).length;
    const totalCount = allCheckboxes.length;

    // Compute status from checkbox state when checkboxes exist.
    let realStatus = article.getAttribute('data-status') || 'unknown';
    if (totalCount > 0) {
      if (checkedCount === totalCount) {
        realStatus = 'completed';
      } else if (checkedCount > 0) {
        realStatus = 'active';
      } else {
        realStatus = 'planned';
      }
    }

    return {
      name: h1 ? h1.textContent.trim() : basename(sprintDir),
      status: realStatus,
      sprint: article.getAttribute('data-sprint'),
      phase: article.getAttribute('data-phase'),
    };
  } catch {
    return null;
  }
}

function statusSort(a, b) {
  const order = { active: 0, planned: 1, completed: 2, blocked: 3, backlog: 4 };
  return (order[a] ?? 5) - (order[b] ?? 5);
}

async function discoverTree(docsRoot) {
  const epics = [];
  const architectures = [];
  const audits = [];
  const references = [];

  const topEntries = await readdir(docsRoot, { withFileTypes: true });
  for (const entry of topEntries) {
    if (!entry.isDirectory() || entry.name.startsWith('.') || entry.name === 'node_modules' || entry.name === 'scripts' || entry.name === 'css' || entry.name === 'templates') continue;

    if (entry.name === 'epics') {
      const epicEntries = await readdir(resolve(docsRoot, 'epics'), { withFileTypes: true });
      for (const epicEntry of epicEntries) {
        if (!epicEntry.isDirectory()) continue;
        const epicDir = resolve(docsRoot, 'epics', epicEntry.name);
        const phases = [];

        const phaseEntries = await readdir(epicDir, { withFileTypes: true });
        for (const phaseEntry of phaseEntries) {
          if (!phaseEntry.isDirectory() || !phaseEntry.name.startsWith('phase-')) continue;
          const phaseDir = resolve(epicDir, phaseEntry.name);
          const phaseNum = phaseEntry.name.replace('phase-', '');
          const sprints = [];

          const sprintEntries = await readdir(phaseDir, { withFileTypes: true });
          for (const sprintEntry of sprintEntries) {
            if (!sprintEntry.isDirectory() || !sprintEntry.name.startsWith('sprint-')) continue;
            const sprintDir = resolve(phaseDir, sprintEntry.name);
            const info = await sprintInfo(sprintDir);
            if (info) sprints.push({ ...info, folder: sprintEntry.name });
          }

          if (sprints.length > 0) {
            phases.push({ num: phaseNum, folder: phaseEntry.name, sprints });
          }
        }

        if (phases.length > 0) {
          epics.push({ name: epicEntry.name, folder: epicEntry.name, phases });
        }
      }
    } else if (entry.name === 'architecture') {
      const archFiles = await readdir(resolve(docsRoot, 'architecture'), { withFileTypes: true });
      for (const f of archFiles) {
        if (f.isFile() && f.name.endsWith('.html')) {
          architectures.push(f.name);
        }
      }
    } else if (entry.name === 'audits') {
      const auditFiles = await readdir(resolve(docsRoot, 'audits'), { withFileTypes: true });
      for (const f of auditFiles) {
        if (f.isFile() && f.name.endsWith('.html')) {
          audits.push(f.name);
        }
      }
    } else if (entry.name === 'references') {
      const refFiles = await readdir(resolve(docsRoot, 'references'), { withFileTypes: true });
      for (const f of refFiles) {
        if (f.isFile() && f.name.endsWith('.html')) {
          references.push(f.name);
        }
      }
    }
  }

  return { epics, architectures, audits, references };
}

function buildRootIndex(tree, title) {
  const escapedTitle = title.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const epicsHtml = tree.epics.map(e => {
    const sprintCount = e.phases.reduce((s, p) => s + p.sprints.length, 0);
    const statuses = e.phases.flatMap(p => p.sprints.map(s => s.status));
    const status = statuses.includes('active') ? 'active' : statuses.every(s => s === 'completed') ? 'completed' : 'planned';
    return `<tr>
        <td><a href="epics/${e.folder}/index.html">${e.name}</a></td>
        <td>${e.phases.length} phases</td>
        <td>${sprintCount} sprints</td>
        <td data-status="${status}">${status.charAt(0).toUpperCase() + status.slice(1)}</td>
      </tr>`;
  }).join('\n');

  const archHtml = tree.architectures.map(f => `<li><a href="architecture/${f}">${f.replace('.html', '')}</a></li>`).join('\n');
  const auditHtml = tree.audits.map(f => `<li><a href="audits/${f}">${f.replace('.html', '')}</a></li>`).join('\n');
  const refHtml = tree.references.map(f => `<li><a href="references/${f}">${f.replace('.html', '')}</a></li>`).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapedTitle}</title>
<link rel="stylesheet" href="css/docs-base.css">
</head>
<body>
<article data-doc-type="root-index" data-status="${tree.epics.some(e => e.phases.some(p => p.sprints.some(s => s.status === 'active'))) ? 'active' : tree.epics.every(e => e.phases.every(p => p.sprints.every(s => s.status === 'completed'))) ? 'completed' : 'planned'}">
<header><h1>${escapedTitle}</h1></header>

<section>
  <h2>Epics</h2>
  <table>
    <thead><tr><th>Epic</th><th>Size</th><th>Sprints</th><th>Status</th></tr></thead>
    <tbody>${epicsHtml}</tbody>
  </table>
</section>

<section>
  <h2>Architecture</h2>
  <ul>${archHtml || '<li>None</li>'}</ul>
</section>

<section>
  <h2>Audits</h2>
  <ul>${auditHtml || '<li>None</li>'}</ul>
</section>

<section>
  <h2>References</h2>
  <ul>${refHtml || '<li>None</li>'}</ul>
</section>
</article>
<nav class="breadcrumb" aria-label="Breadcrumb">
  <span aria-current="page">Docs Home</span>
</nav>
</body>
</html>\n`;
}

function statusCounter(sprints) {
  const p = sprints.filter(s => s.status === 'planned').length;
  const a = sprints.filter(s => s.status === 'active').length;
  const c = sprints.filter(s => s.status === 'completed').length;
  return `<span class="counter planned">${p}</span>/<span class="counter active">${a}</span>/<span class="counter completed">${c}</span>`;
}

function buildEpicIndex(epic) {
  const phasesHtml = epic.phases.map(p => {
    const statuses = p.sprints.map(s => s.status);
    const status = statuses.includes('active') ? 'active' : statuses.every(s => s === 'completed') ? 'completed' : statuses.some(s => s === 'completed') ? 'active' : 'planned';
    return `<tr>
        <td><a href="${p.folder}/index.html">Phase ${p.num}</a></td>
        <td>${p.sprints.length} sprints</td>
        <td>${statusCounter(p.sprints)}</td>
        <td data-status="${status}">${status.charAt(0).toUpperCase() + status.slice(1)}</td>
      </tr>`;
  }).join('\n');

  // Compute epic status from phase statuses (derived from sprint statuses)
  const allPhaseStatuses = epic.phases.map(p => {
    const ss = p.sprints.map(s => s.status);
    return ss.includes('active') ? 'active' : ss.every(s => s === 'completed') ? 'completed' : ss.some(s => s === 'completed') ? 'active' : 'planned';
  });
  const epicStatus = allPhaseStatuses.includes('active') ? 'active' : allPhaseStatuses.every(s => s === 'completed') ? 'completed' : 'planned';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${epic.name} — Phases</title>
<link rel="stylesheet" href="${cssPath(2)}">
</head>
<body>
<article data-doc-type="epic-index" data-epic="${epic.name}" data-status="${epicStatus}">
<header><h1>${epic.name}</h1></header>

<section>
  <h2>Phases</h2>
  <table>
    <thead><tr><th>Phase</th><th>Sprints</th><th>P / A / C</th><th>Status</th></tr></thead>
    <tbody>${phasesHtml}</tbody>
  </table>
</section>

<nav class="breadcrumb" aria-label="Breadcrumb">
  <a href="../../index.html">Docs Home</a>
  <span aria-hidden="true"> / </span>
  <span aria-current="page">${epic.name}</span>
</nav>
</article>
</body>
</html>\n`;
}

function buildPhaseIndex(epic, phase) {
  const sprintsHtml = phase.sprints.map(s => `<tr>
        <td><a href="${s.folder}/sprint.html">${s.sprint ? 'Sprint ' + s.sprint : ''}</a></td>
        <td>${s.name.replace(/^Sprint [\d.]+:?\s*/, '')}</td>
        <td data-status="${s.status}">${s.status.charAt(0).toUpperCase() + s.status.slice(1)}</td>
      </tr>`).join('\n');

  // Compute phase status from sprint statuses
  const statuses = phase.sprints.map(s => s.status);
  const completedCount = statuses.filter(s => s === 'completed').length;
  const activeCount = statuses.filter(s => s === 'active').length;
  const total = statuses.length;
  // All done → completed. Any active → active. Mix of completed+planned → active. All planned → planned.
  const phaseStatus = completedCount === total ? 'completed'
    : activeCount > 0 ? 'active'
    : completedCount > 0 ? 'active'
    : 'planned';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Phase ${phase.num} — ${epic.name}</title>
<link rel="stylesheet" href="${cssPath(3)}">
</head>
<body>
<article data-doc-type="phase-index" data-epic="${epic.name}" data-phase="${phase.num}" data-status="${phaseStatus}">
<header><h1>Phase ${phase.num}</h1></header>

<section id="sprints">
  <h2>Sprints</h2>
  <table>
    <thead><tr><th>Sprint</th><th>Name</th><th>Status</th></tr></thead>
    <tbody>${sprintsHtml}</tbody>
  </table>
</section>

<nav class="breadcrumb" aria-label="Breadcrumb">
  <a href="../index.html">${epic.name}</a>
  <span aria-hidden="true"> / </span>
  <span aria-current="page">Phase ${phase.num}</span>
</nav>
</article>
</body>
</html>\n`;
}

export async function generateIndexes(opts = {}) {
  const dryRun = opts.dryRun || false;
  const docsRoot = opts.docsRoot || DOCS_ROOT;
  const title = opts.title || resolveTitle(docsRoot);
  const tree = await discoverTree(docsRoot);

  // Root index
  const rootHtml = buildRootIndex(tree, title);
  const rootPath = resolve(docsRoot, 'index.html');
  if (dryRun) {
    console.log(`[DRY RUN] Would write ${relative(docsRoot, rootPath)} (${rootHtml.length} bytes)`);
  } else {
    await writeFile(rootPath, rootHtml, 'utf-8');
    console.log(`Wrote ${relative(docsRoot, rootPath)}`);
  }

  for (const epic of tree.epics) {
    // Epic index
    const epicHtml = buildEpicIndex(epic);
    const epicPath = resolve(docsRoot, 'epics', epic.folder, 'index.html');
    if (dryRun) {
      console.log(`[DRY RUN] Would write ${relative(docsRoot, epicPath)}`);
    } else {
      await writeFile(epicPath, epicHtml, 'utf-8');
      console.log(`Wrote ${relative(docsRoot, epicPath)}`);
    }

    for (const phase of epic.phases) {
      const phaseHtml = buildPhaseIndex(epic, phase);
      const phasePath = resolve(docsRoot, 'epics', epic.folder, phase.folder, 'index.html');
      if (dryRun) {
        console.log(`[DRY RUN] Would write ${relative(docsRoot, phasePath)}`);
      } else {
        await writeFile(phasePath, phaseHtml, 'utf-8');
        console.log(`Wrote ${relative(docsRoot, phasePath)}`);
      }
    }
  }

  console.log(`\nGenerated indexes for ${tree.epics.length} epic(s), ${tree.epics.reduce((s, e) => s + e.phases.length, 0)} phase(s).`);
}

// CLI
const dryRun = process.argv.includes('--dry-run');

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('generate-index.mjs')) {
  await generateIndexes({ dryRun });
}
