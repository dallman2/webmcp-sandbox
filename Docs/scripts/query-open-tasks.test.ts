import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { queryOpenTasks } from './query-open-tasks.mjs';

let tmpDir: string;

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

const FIXTURE_SPRINT = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Test Sprint</title></head>
<body>
<article data-doc-type="sprint-plan" data-epic="v1.0-local-canvas" data-phase="5" data-sprint="0" data-status="planned">
<header><h1>Sprint 5: Test</h1></header>
<section id="objective"><h2>Objective</h2></section>
<section id="execution-plan">
<h2>Execution Plan</h2>
<ol>
<li data-task-id="0.1"><input type="checkbox" checked><div><strong>Done task</strong><data data-files="foo.ts"></data></div></li>
<li data-task-id="0.2"><input type="checkbox"><div><strong>Open task</strong><data data-files="bar.ts"></data></div></li>
<li data-task-id="0.3"><input type="checkbox"><div><strong>Also open</strong><data data-files="baz.ts"></data></div></li>
</ol>
</section>
<section id="verification">
<h2>Verification</h2>
<ul>
<li><input type="checkbox" checked><span>Verified</span></li>
<li><input type="checkbox"><span>Not verified</span></li>
</ul>
</section>
<nav class="breadcrumb" aria-label="Breadcrumb"></nav>
</article>
</body>
</html>`;

const FIXTURE_ALL_DONE = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>All Done</title></head>
<body>
<article data-doc-type="sprint-plan" data-epic="v1.0-local-canvas" data-phase="5" data-sprint="1" data-status="completed">
<header><h1>Sprint 5.1: All Done</h1></header>
<section id="objective"><h2>Objective</h2></section>
<section id="execution-plan">
<h2>Execution Plan</h2>
<ol>
<li data-task-id="0.1"><input type="checkbox" checked><div><strong>Done 1</strong></div></li>
<li data-task-id="0.2"><input type="checkbox" checked><div><strong>Done 2</strong></div></li>
</ol>
</section>
<section id="verification"><h2>Verification</h2></section>
<nav class="breadcrumb" aria-label="Breadcrumb"></nav>
</article>
</body>
</html>`;

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'query-test-'));
  const sprintDir = resolve(tmpDir, 'epics/v1.0-local-canvas/phase-5/sprint-0-distiller');
  await ensureDir(sprintDir);
  await writeFile(resolve(sprintDir, 'sprint.html'), FIXTURE_SPRINT);

  const sprintDir2 = resolve(tmpDir, 'epics/v1.0-local-canvas/phase-5/sprint-1-testing');
  await ensureDir(sprintDir2);
  await writeFile(resolve(sprintDir2, 'sprint.html'), FIXTURE_ALL_DONE);
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('queryOpenTasks', () => {
  it('returns the correct number of open tasks', async () => {
    const result = await queryOpenTasks({ docsRoot: tmpDir });
    expect(result.total_open).toBe(2);
  });

  it('has correct task details', async () => {
    const result = await queryOpenTasks({ docsRoot: tmpDir });
    expect(result.tasks).toHaveLength(2);
    const ids = result.tasks.map(t => t.task_id).sort();
    expect(ids).toEqual(['0.2', '0.3']);
  });

  it('includes file paths in task data', async () => {
    const result = await queryOpenTasks({ docsRoot: tmpDir });
    const task02 = result.tasks.find(t => t.task_id === '0.2');
    expect(task02).toBeTruthy();
    expect(task02!.files).toContain('bar.ts');
  });

  it('filters by epic', async () => {
    const result = await queryOpenTasks({ docsRoot: tmpDir, epic: 'v1.0-local-canvas' });
    expect(result.total_open).toBe(2);
  });

  it('returns zero for non-matching epic', async () => {
    const result = await queryOpenTasks({ docsRoot: tmpDir, epic: 'nonexistent' });
    expect(result.total_open).toBe(0);
  });

  it('ignores non-sprint-plan files', async () => {
    // Write a non-sprint-plan HTML file
    await ensureDir(resolve(tmpDir, 'architecture'));
    await writeFile(resolve(tmpDir, 'architecture/test.html'), `<!DOCTYPE html>
<html><body><article data-doc-type="reference" data-epic="v0.0">
<section id="objective"><h2>Not a sprint</h2></section>
</article></body></html>`);

    const result = await queryOpenTasks({ docsRoot: tmpDir });
    expect(result.total_open).toBe(2); // still 2, new file ignored
  });
});
