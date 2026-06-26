import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { markTasks } from './mark-tasks-complete.mjs';
import { parseHTML } from 'linkedom';
import { readFile } from 'node:fs/promises';

let tmpDir: string;

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

const SPRINT_HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Sprint</title></head>
<body>
<article data-doc-type="sprint-plan" data-epic="v1.0" data-phase="0" data-sprint="0" data-status="planned">
<header><h1>Sprint 0: Test</h1></header>
<section id="objective"><h2>Obj</h2></section>
<section id="execution-plan"><h2>EP</h2>
<ol>
<li data-task-id="0.1"><input type="checkbox"><div><strong>Task 0.1</strong></div></li>
<li data-task-id="0.2"><input type="checkbox" checked><div><strong>Task 0.2</strong></div></li>
<li data-task-id="0.3"><input type="checkbox"><div><strong>Task 0.3</strong></div></li>
</ol>
</section>
<section id="verification"><h2>Ver</h2></section>
</article>
<nav class="breadcrumb" aria-label="Breadcrumb"></nav>
</body></html>`;

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'mark-test-'));
  await ensureDir(resolve(tmpDir, 'sprint-dir'));
  await writeFile(resolve(tmpDir, 'sprint-dir/sprint.html'), SPRINT_HTML);
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

function parseDoc(html: string) {
  const { document } = parseHTML(html);
  return document;
}

describe('markTasks', () => {
  it('marks a task as checked', async () => {
    const manifest = { tasks: [{ doc: 'sprint-dir/sprint.html', task_id: '0.1' }] };
    const results = await markTasks(manifest, { docsRoot: tmpDir });
    const changed = results.filter(r => r.status === 'checked');
    expect(changed).toHaveLength(1);
    expect(changed[0].task_id).toBe('0.1');
  });

  it('actually flips the checkbox in the file', async () => {
    const html = await readFile(resolve(tmpDir, 'sprint-dir/sprint.html'), 'utf-8');
    const doc = parseDoc(html);
    const cb = doc.querySelector('li[data-task-id="0.1"] input[type="checkbox"]');
    expect(cb).toBeTruthy();
    expect(cb!.hasAttribute('checked')).toBe(true);
    // Verify 0.2 was already checked and stays checked
    const cb2 = doc.querySelector('li[data-task-id="0.2"] input[type="checkbox"]');
    expect(cb2!.hasAttribute('checked')).toBe(true);
  });

  it('updates sprint status when all tasks complete', async () => {
    // Now mark the remaining task (0.3)
    const manifest = { tasks: [{ doc: 'sprint-dir/sprint.html', task_id: '0.3' }] };
    const results = await markTasks(manifest, { docsRoot: tmpDir });
    const sprintComplete = results.find(r => r.status === 'sprint_completed');
    expect(sprintComplete).toBeTruthy();

    const html = await readFile(resolve(tmpDir, 'sprint-dir/sprint.html'), 'utf-8');
    const doc = parseDoc(html);
    const article = doc.querySelector('article');
    expect(article!.getAttribute('data-status')).toBe('completed');
  });

  it('reports not_found for nonexistent task', async () => {
    const manifest = { tasks: [{ doc: 'sprint-dir/sprint.html', task_id: '99.9' }] };
    const results = await markTasks(manifest, { docsRoot: tmpDir });
    expect(results[0].status).toBe('not_found');
  });

  it('reports error for non-sprint-plan doc', async () => {
    // Create a non-sprint doc
    await writeFile(resolve(tmpDir, 'other.html'), `<!DOCTYPE html>
<html><body><article data-doc-type="reference" data-epic="v1.0"></article></body></html>`);
    const manifest = { tasks: [{ doc: 'other.html', task_id: '0.1' }] };
    const results = await markTasks(manifest, { docsRoot: tmpDir });
    expect(results[0].status).toBe('error');
  });
});
