#!/usr/bin/env node
// mark-tasks-complete.mjs — Flip task checkboxes in HTML doc files.
// Usage:
//   echo '{"tasks":[...]}' | node Docs/scripts/mark-tasks-complete.mjs
//   node Docs/scripts/mark-tasks-complete.mjs --file manifest.json
//   node Docs/scripts/mark-tasks-complete.mjs --uncheck  (to reverse)

import { parseHTML } from 'linkedom';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_ROOT = resolve(__dirname, '..');

async function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

export async function markTasks(manifest, opts = {}) {
  const uncheck = opts.uncheck || false;
  const docsRoot = opts.docsRoot || DOCS_ROOT;
  const results = [];
  const updatesByFile = {};

  // Group by doc_path
  for (const entry of manifest.tasks) {
    const { doc, task_id: taskId } = entry;
    if (!updatesByFile[doc]) updatesByFile[doc] = new Set();
    updatesByFile[doc].add(taskId);
  }

  for (const [docRel, taskIds] of Object.entries(updatesByFile)) {
    const docPath = resolve(docsRoot, docRel);
    const html = await readFile(docPath, 'utf-8');
    const { document } = parseHTML(html);

    const article = document.querySelector('article[data-doc-type="sprint-plan"]');
    if (!article) {
      results.push({ doc: docRel, status: 'error', message: 'Not a sprint-plan' });
      continue;
    }

    let changedCount = 0;
    for (const taskId of taskIds) {
      const li = article.querySelector(`li[data-task-id="${taskId}"]`);
      if (!li) {
        results.push({ doc: docRel, task_id: taskId, status: 'not_found' });
        continue;
      }
      const checkbox = li.querySelector('input[type="checkbox"]');
      if (!checkbox) {
        results.push({ doc: docRel, task_id: taskId, status: 'no_checkbox' });
        continue;
      }

      if (uncheck) {
        checkbox.removeAttribute('checked');
      } else {
        checkbox.setAttribute('checked', '');
      }
      changedCount++;
      results.push({ doc: docRel, task_id: taskId, status: uncheck ? 'unchecked' : 'checked' });
    }

    // If all tasks are now complete, update sprint status
    if (!uncheck) {
      const allTasks = article.querySelectorAll('li[data-task-id] input[type="checkbox"]');
      const allChecked = [...allTasks].every(cb => cb.hasAttribute('checked'));
      if (allChecked && allTasks.length > 0) {
        article.setAttribute('data-status', 'completed');
        results.push({ doc: docRel, status: 'sprint_completed' });
      }
    } else {
      // Revert sprint status when unchecking if it was "completed"
      const currentStatus = article.getAttribute('data-status');
      if (currentStatus === 'completed') {
        const allTasks = article.querySelectorAll('li[data-task-id] input[type="checkbox"]');
        const hasAnyChecked = [...allTasks].some(cb => cb.hasAttribute('checked'));
        article.setAttribute('data-status', hasAnyChecked ? 'active' : 'planned');
        results.push({ doc: docRel, status: `sprint_reverted_to_${hasAnyChecked ? 'active' : 'planned'}` });
      }
    }

    // Serialize back
    const serializer = document.constructor.prototype.toString;
    let output = serializer ? serializer.call(document) : document.documentElement.outerHTML;
    // linkedom may not serialize <!DOCTYPE>, prepend it
    if (!output.startsWith('<!DOCTYPE')) {
      output = '<!DOCTYPE html>\n' + output;
    }
    await writeFile(docPath, output, 'utf-8');
  }

  return results;
}

// CLI — runs only when executed directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('mark-tasks-complete.mjs')) {
  const args = process.argv.slice(2);
  const uncheck = args.includes('--uncheck');
  const fileFlagIdx = args.indexOf('--file');
  let manifest;

  if (fileFlagIdx !== -1 && fileFlagIdx + 1 < args.length) {
    const filePath = args[fileFlagIdx + 1];
    manifest = JSON.parse(await readFile(filePath, 'utf-8'));
  } else if (!process.stdin.isTTY) {
    const stdinData = await readStdin();
    if (stdinData.trim()) {
      manifest = JSON.parse(stdinData);
    }
  }

  if (!manifest) {
    console.error('Usage: mark-tasks-complete.mjs [--file manifest.json] [--uncheck]');
    console.error('       echo \'{"tasks":[...]}\' | node mark-tasks-complete.mjs');
    process.exit(1);
  }

  const results = await markTasks(manifest, { uncheck });
  console.log(JSON.stringify(results, null, 2));
}
