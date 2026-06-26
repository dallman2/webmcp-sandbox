#!/usr/bin/env node
// query-open-tasks.mjs — Extract all unchecked tasks from the Docs/ HTML tree.
// Usage: node Docs/scripts/query-open-tasks.mjs [--epic <name>] [--phase <num>]

import { parseHTML } from 'linkedom';
import { readFile } from 'node:fs/promises';
import { resolve, relative, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdir } from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_ROOT = resolve(__dirname, '..');

async function* walkHtml(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      yield* walkHtml(full);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      yield full;
    }
  }
}

export async function queryOpenTasks(opts = {}) {
  const docsRoot = opts.docsRoot || DOCS_ROOT;
  const epicFilter = opts.epic || null;
  const phaseFilter = opts.phase != null ? String(opts.phase) : null;

  const tasks = [];
  let total = 0;

  for await (const filePath of walkHtml(docsRoot)) {
    const html = await readFile(filePath, 'utf-8');
    const { document } = parseHTML(html);

    const article = document.querySelector('article[data-doc-type]');
    if (!article) continue;

    const docType = article.getAttribute('data-doc-type');
    if (docType !== 'sprint-plan') continue;

    // Skip template files — they contain placeholder data
    const rel = relative(DOCS_ROOT, filePath);
    if (rel.startsWith('templates/')) continue;

    const epic = article.getAttribute('data-epic');
    if (epicFilter && epic !== epicFilter) continue;

    const phase = article.getAttribute('data-phase');
    if (phaseFilter !== null && phase !== phaseFilter) continue;

    const taskItems = document.querySelectorAll('li[data-task-id]');
    for (const li of taskItems) {
      const checkbox = li.querySelector('input[type="checkbox"]');
      if (!checkbox || checkbox.hasAttribute('checked')) continue;

      const taskId = li.getAttribute('data-task-id');
      const strongEl = li.querySelector('strong');
      const label = strongEl ? strongEl.textContent.trim() : '';
      const dataEl = li.querySelector('data[data-files]');
      const files = dataEl ? dataEl.getAttribute('data-files').trim().split(/\s+/) : [];

      tasks.push({
        task_id: taskId,
        label,
        files,
        doc_path: relative(DOCS_ROOT, filePath),
        epic,
        phase,
        sprint: article.getAttribute('data-sprint'),
      });
      total++;
    }
  }

  return { total_open: total, tasks };
}

function printReport(result) {
  const grouped = {};
  for (const t of result.tasks) {
    const ep = t.epic || 'unknown';
    const ph = t.phase || 'unknown';
    const sp = t.sprint || 'unknown';
    grouped[ep] = grouped[ep] || {};
    grouped[ep][`phase-${ph}`] = grouped[ep][`phase-${ph}`] || {};
    grouped[ep][`phase-${ph}`][`sprint-${sp}`] = grouped[ep][`phase-${ph}`][`sprint-${sp}`] || [];
    grouped[ep][`phase-${ph}`][`sprint-${sp}`].push({
      task_id: t.task_id,
      label: t.label,
      files: t.files,
      doc_path: t.doc_path,
    });
  }
  console.log(JSON.stringify({ total_open: result.total_open, epics: grouped }, null, 2));
}

// CLI
const args = process.argv.slice(2);
const opts = {};
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--epic' && i + 1 < args.length) opts.epic = args[++i];
  else if (args[i] === '--phase' && i + 1 < args.length) opts.phase = args[++i];
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('query-open-tasks.mjs')) {
  const result = await queryOpenTasks(opts);
  printReport(result);
}
