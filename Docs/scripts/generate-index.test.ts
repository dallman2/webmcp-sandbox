import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { generateIndexes } from './generate-index.mjs';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';

let tmpDir: string;

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

const SPRINT_HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Sprint 0: Test Sprint</title></head>
<body>
<article data-doc-type="sprint-plan" data-epic="v1.0-test" data-phase="0" data-sprint="0" data-status="completed">
<header><h1>Sprint 0: Test Sprint</h1></header>
<section id="objective"><h2>Obj</h2></section>
<section id="execution-plan"><h2>EP</h2></section>
<section id="verification"><h2>Ver</h2></section>
<nav class="breadcrumb" aria-label="Breadcrumb"></nav>
</article>
</body></html>`;

const SPRINT2_HTML = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Sprint 1: Second Sprint</title></head>
<body>
<article data-doc-type="sprint-plan" data-epic="v1.0-test" data-phase="0" data-sprint="1" data-status="planned">
<header><h1>Sprint 1: Second Sprint</h1></header>
<section id="objective"><h2>Obj</h2></section>
<section id="execution-plan"><h2>EP</h2></section>
<section id="verification"><h2>Ver</h2></section>
<nav class="breadcrumb" aria-label="Breadcrumb"></nav>
</article>
</body></html>`;

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'generate-test-'));
  const sprintDir = resolve(tmpDir, 'epics/v1.0-test/phase-0/sprint-0-name');
  await ensureDir(sprintDir);
  await writeFile(resolve(sprintDir, 'sprint.html'), SPRINT_HTML);

  const sprintDir2 = resolve(tmpDir, 'epics/v1.0-test/phase-0/sprint-1-name');
  await ensureDir(sprintDir2);
  await writeFile(resolve(sprintDir2, 'sprint.html'), SPRINT2_HTML);
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('generateIndexes', () => {
  it('generates root index with epic listed', async () => {
    await generateIndexes({ docsRoot: tmpDir });

    const rootHtml = await readFile(resolve(tmpDir, 'index.html'), 'utf-8');
    expect(rootHtml).toContain('v1.0-test');
    expect(rootHtml).toContain('root-index');
  });

  it('generates epic index with phases', async () => {
    const epicHtml = await readFile(resolve(tmpDir, 'epics/v1.0-test/index.html'), 'utf-8');
    const { document } = parseHTML(epicHtml);
    const article = document.querySelector('article');
    expect(article!.getAttribute('data-doc-type')).toBe('epic-index');
    expect(epicHtml).toContain('Phase 0');
  });

  it('generates phase index with sprints', async () => {
    const phaseHtml = await readFile(resolve(tmpDir, 'epics/v1.0-test/phase-0/index.html'), 'utf-8');
    const { document } = parseHTML(phaseHtml);
    const article = document.querySelector('article');
    expect(article!.getAttribute('data-doc-type')).toBe('phase-index');
    expect(phaseHtml).toContain('Test Sprint');
    expect(phaseHtml).toContain('Second Sprint');
  });

  it('generates phase index with sprints', async () => {
    const phaseHtml = await readFile(resolve(tmpDir, 'epics/v1.0-test/phase-0/index.html'), 'utf-8');
    const doc = parseHTML(phaseHtml);
    const article = doc.document.querySelector('article');
    expect(article!.getAttribute('data-doc-type')).toBe('phase-index');
    expect(phaseHtml).toContain('Test Sprint');
    expect(phaseHtml).toContain('Second Sprint');
  });

  it('correctly sets sprint status in phase index', async () => {
    const phaseHtml = await readFile(resolve(tmpDir, 'epics/v1.0-test/phase-0/index.html'), 'utf-8');
    // One sprint is completed, one is planned
    const completedCount = (phaseHtml.match(/data-status="completed"/g) || []).length;
    const plannedCount = (phaseHtml.match(/data-status="planned"/g) || []).length;
    expect(completedCount).toBeGreaterThanOrEqual(1);
    expect(plannedCount).toBeGreaterThanOrEqual(1);
  });

  it('dry-run does not write files', async () => {
    // Use a different tmp dir
    const dryDir = resolve(tmpDir, 'dry-run-test');
    await ensureDir(dryDir);
    await generateIndexes({ docsRoot: dryDir, dryRun: true });

    try {
      await readFile(resolve(dryDir, 'index.html'), 'utf-8');
      expect.fail('File should not exist in dry-run mode');
    } catch {
      // Expected — file not created
    }
  });

  it('uses correct CSS path depths', async () => {
    const rootHtml = await readFile(resolve(tmpDir, 'index.html'), 'utf-8');
    expect(rootHtml).toContain('href="css/docs-base.css"');
    const epicHtml = await readFile(resolve(tmpDir, 'epics/v1.0-test/index.html'), 'utf-8');
    expect(epicHtml).toContain('href="../../css/docs-base.css"');
    const phaseHtml = await readFile(resolve(tmpDir, 'epics/v1.0-test/phase-0/index.html'), 'utf-8');
    expect(phaseHtml).toContain('href="../../../css/docs-base.css"');
  });
});
