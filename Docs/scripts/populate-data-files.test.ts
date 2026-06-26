import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { populateDataFiles } from './populate-data-files.mjs';
import { parseHTML } from 'linkedom';

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

function buildSprintHtml(epic: string, phase: string, sprint: string, bodyContent: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Sprint</title></head>
<body>
<article data-doc-type="sprint-plan" data-epic="${epic}" data-phase="${phase}" data-sprint="${sprint}" data-status="planned">
<header><h1>Sprint ${sprint}</h1></header>
<section id="execution-plan"><h2>Execution Plan</h2>
<ol>
${bodyContent}
</ol>
</section>
</article>
<nav class="breadcrumb" aria-label="Breadcrumb"></nav>
</body></html>`;
}

function parseDoc(html: string) {
  const { document } = parseHTML(html);
  return document;
}

describe('populateDataFiles — core extraction', () => {
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'populate-core-'));
  });

  afterAll(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  async function setupSprint(sprint: string, bodyContent: string) {
    await ensureDir(resolve(tmpDir, `epics/v1.0/phase-0/sprint-${sprint}`));
    await writeFile(
      resolve(tmpDir, `epics/v1.0/phase-0/sprint-${sprint}/sprint.html`),
      buildSprintHtml('v1.0', '0', sprint, bodyContent)
    );
  }

  it('extracts path from <code> element with known directory prefix', async () => {
    await setupSprint('0',
      `<li data-task-id="0.1"><input type="checkbox"><div><strong>Task 0.1</strong>: Create <code>apps/backend/src/server.ts</code></div></li>`
    );

    await populateDataFiles({ docsRoot: tmpDir });

    const updated = await readFile(resolve(tmpDir, 'epics/v1.0/phase-0/sprint-0/sprint.html'), 'utf-8');
    const doc = parseDoc(updated);
    const dataEl = doc.querySelector('li[data-task-id="0.1"] data[data-files]');
    expect(dataEl).toBeTruthy();
    expect(dataEl!.getAttribute('data-files')).toBe('apps/backend/src/server.ts');
  });

  it('extracts path from bare text with known directory prefix', async () => {
    await setupSprint('1',
      `<li data-task-id="0.1"><input type="checkbox"><div><strong>Task 0.1</strong>: Update the types in packages/shared/src/types.ts</div></li>`
    );

    await populateDataFiles({ docsRoot: tmpDir });

    const updated = await readFile(resolve(tmpDir, 'epics/v1.0/phase-0/sprint-1/sprint.html'), 'utf-8');
    const doc = parseDoc(updated);
    const dataEl = doc.querySelector('li[data-task-id="0.1"] data[data-files]');
    expect(dataEl).toBeTruthy();
    expect(dataEl!.getAttribute('data-files')).toContain('packages/shared/src/types.ts');
  });

  it('does NOT match library name in <code> (no extension, no path separator)', async () => {
    await setupSprint('2',
      `<li data-task-id="0.1"><input type="checkbox"><div><strong>Task 0.1</strong>: Set up the <code>openai</code> client</div></li>`
    );

    await populateDataFiles({ docsRoot: tmpDir });

    const updated = await readFile(resolve(tmpDir, 'epics/v1.0/phase-0/sprint-2/sprint.html'), 'utf-8');
    const doc = parseDoc(updated);
    const dataEl = doc.querySelector('li[data-task-id="0.1"] data[data-files]');
    expect(dataEl).toBeNull();
  });

  it('leaves data-files empty when task has no file references', async () => {
    await setupSprint('3',
      `<li data-task-id="0.1"><input type="checkbox"><div><strong>Task 0.1</strong>: Verify all containers are healthy</div></li>`
    );

    await populateDataFiles({ docsRoot: tmpDir });

    const updated = await readFile(resolve(tmpDir, 'epics/v1.0/phase-0/sprint-3/sprint.html'), 'utf-8');
    const doc = parseDoc(updated);
    const dataEl = doc.querySelector('li[data-task-id="0.1"] data[data-files]');
    expect(dataEl).toBeNull();
  });

  it('does NOT overwrite existing data-files values', async () => {
    await setupSprint('4',
      `<li data-task-id="0.1"><input type="checkbox"><div><strong>Task 0.1</strong>: <data data-files="existing.ts"></data> Update the old file</div></li>`
    );

    await populateDataFiles({ docsRoot: tmpDir });

    const updated = await readFile(resolve(tmpDir, 'epics/v1.0/phase-0/sprint-4/sprint.html'), 'utf-8');
    const doc = parseDoc(updated);
    const dataEl = doc.querySelector('li[data-task-id="0.1"] data[data-files]');
    expect(dataEl).toBeTruthy();
    expect(dataEl!.getAttribute('data-files')).toBe('existing.ts');
  });

  it('extracts multiple paths and joins them space-separated', async () => {
    await setupSprint('5',
      `<li data-task-id="0.1"><input type="checkbox"><div><strong>Task 0.1</strong>: Create <code>apps/web/src/App.tsx</code> and update <code>apps/web/src/index.css</code></div></li>`
    );

    await populateDataFiles({ docsRoot: tmpDir });

    const updated = await readFile(resolve(tmpDir, 'epics/v1.0/phase-0/sprint-5/sprint.html'), 'utf-8');
    const doc = parseDoc(updated);
    const dataEl = doc.querySelector('li[data-task-id="0.1"] data[data-files]');
    expect(dataEl).toBeTruthy();
    const files = dataEl!.getAttribute('data-files')!.split(' ').sort();
    expect(files).toEqual(['apps/web/src/App.tsx', 'apps/web/src/index.css']);
  });

  it('--dry-run reports changes without writing files', async () => {
    await setupSprint('6',
      `<li data-task-id="0.1"><input type="checkbox"><div><strong>Task 0.1</strong>: Create <code>apps/backend/src/index.ts</code></div></li>`
    );

    const stats = await populateDataFiles({ docsRoot: tmpDir, dryRun: true });

    expect(stats.tasksPopulated).toBeGreaterThanOrEqual(1);

    const unchanged = await readFile(resolve(tmpDir, 'epics/v1.0/phase-0/sprint-6/sprint.html'), 'utf-8');
    const doc = parseDoc(unchanged);
    const dataEl = doc.querySelector('li[data-task-id="0.1"] data[data-files]');
    expect(dataEl).toBeNull();
  });

  it('populates empty data-files attribute', async () => {
    await setupSprint('7',
      `<li data-task-id="0.1"><input type="checkbox"><div><strong>Task 0.1</strong>: <data data-files=""></data> Update <code>packages/shared/src/config.ts</code></div></li>`
    );

    await populateDataFiles({ docsRoot: tmpDir });

    const updated = await readFile(resolve(tmpDir, 'epics/v1.0/phase-0/sprint-7/sprint.html'), 'utf-8');
    const doc = parseDoc(updated);
    const dataEl = doc.querySelector('li[data-task-id="0.1"] data[data-files]');
    expect(dataEl).toBeTruthy();
    expect(dataEl!.getAttribute('data-files')).toBe('packages/shared/src/config.ts');
  });

  it('includes directory paths from code blocks', async () => {
    await setupSprint('8',
      `<li data-task-id="0.1"><input type="checkbox"><div><strong>Task 0.1</strong>: Create <code>apps/ascent/</code> directory tree</div></li>`
    );

    await populateDataFiles({ docsRoot: tmpDir });

    const updated = await readFile(resolve(tmpDir, 'epics/v1.0/phase-0/sprint-8/sprint.html'), 'utf-8');
    const doc = parseDoc(updated);
    const dataEl = doc.querySelector('li[data-task-id="0.1"] data[data-files]');
    expect(dataEl).toBeTruthy();
    expect(dataEl!.getAttribute('data-files')).toBe('apps/ascent');
  });
});

describe('populateDataFiles — filtering and boundaries', () => {
  it('supports --epic filter to target a specific epic', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'populate-epic-'));
    try {
      const html1 = buildSprintHtml('v1.0', '0', '0',
        `<li data-task-id="0.1"><input type="checkbox"><div><strong>Task</strong>: Create <code>apps/v1/src/index.ts</code></div></li>`
      );
      const html2 = buildSprintHtml('v2.0', '0', '0',
        `<li data-task-id="0.1"><input type="checkbox"><div><strong>Task</strong>: Create <code>apps/v2/src/index.ts</code></div></li>`
      );
      await ensureDir(resolve(tmpDir, 'epics/v1.0/phase-0/sprint-0'));
      await ensureDir(resolve(tmpDir, 'epics/v2.0/phase-0/sprint-0'));
      await writeFile(resolve(tmpDir, 'epics/v1.0/phase-0/sprint-0/sprint.html'), html1);
      await writeFile(resolve(tmpDir, 'epics/v2.0/phase-0/sprint-0/sprint.html'), html2);

      const stats = await populateDataFiles({ docsRoot: tmpDir, epic: 'v1.0', dryRun: true });

      expect(stats.sprintsScanned).toBe(1);
      expect(stats.tasksPopulated).toBe(1);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('ignores non-sprint-plan articles', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'populate-nonsprint-'));
    try {
      const nonSprint = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Not a Sprint</title></head>
<body>
<article data-doc-type="epic-overview" data-epic="v1.0" data-status="active">
<header><h1>Overview</h1></header>
<section id="execution-plan"><h2>EP</h2>
<ol>
<li data-task-id="0.1"><input type="checkbox"><div><strong>Task</strong>: Create <code>apps/web/src/main.tsx</code></div></li>
</ol>
</section>
</article>
</body></html>`;
      await ensureDir(resolve(tmpDir, 'epics/v1.0'));
      await writeFile(resolve(tmpDir, 'epics/v1.0/epic-overview.html'), nonSprint);

      const stats = await populateDataFiles({ docsRoot: tmpDir });

      expect(stats.sprintsScanned).toBe(0);
      expect(stats.tasksProcessed).toBe(0);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('skips template sprint plans with EPIC_NAME placeholder', async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), 'populate-template-'));
    try {
      const templateHtml = buildSprintHtml('EPIC_NAME', 'N', 'N',
        `<li data-task-id="0.1"><input type="checkbox"><div><strong>Template task</strong>: <code>apps/foo/bar.ts</code></div></li>`
      );
      await ensureDir(resolve(tmpDir, 'templates'));
      await writeFile(resolve(tmpDir, 'templates/sprint-plan.html'), templateHtml);

      const stats = await populateDataFiles({ docsRoot: tmpDir });

      expect(stats.sprintsScanned).toBe(0);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});
