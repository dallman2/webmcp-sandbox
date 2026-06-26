import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateDocs } from './validate-docs.mjs';

let tmpDir: string;

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

const VALID_SPRINT = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Valid Sprint</title></head>
<body>
<article data-doc-type="sprint-plan" data-epic="v1.0" data-phase="0" data-sprint="0" data-status="planned">
<header><h1>Sprint 0: Test</h1></header>
<section id="objective"><h2>Obj</h2></section>
<section id="execution-plan"><h2>EP</h2>
<ol><li data-task-id="0.1"><input type="checkbox"><div>Task</div></li></ol>
</section>
<section id="verification"><h2>Ver</h2></section>
</article>
<nav class="breadcrumb" aria-label="Breadcrumb"></nav>
</body></html>`;

const MISSING_SECTION = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Bad Sprint</title></head>
<body>
<article data-doc-type="sprint-plan" data-epic="v1.0" data-phase="0" data-sprint="0" data-status="planned">
<header><h1>Sprint</h1></header>
<section id="objective"><h2>Obj</h2></section>
</article>
<nav class="breadcrumb" aria-label="Breadcrumb"></nav>
</body></html>`;

const BROKEN_LINK = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Broken Link</title></head>
<body>
<article data-doc-type="reference" data-epic="v1.0">
<header><h1>Ref</h1></header>
<a href="nonexistent.html">broken</a>
</article>
<nav class="breadcrumb" aria-label="Breadcrumb"></nav>
</body></html>`;

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'validate-test-'));
  await ensureDir(resolve(tmpDir, 'epics/v1.0'));

  await writeFile(resolve(tmpDir, 'valid.html'), VALID_SPRINT);
  await writeFile(resolve(tmpDir, 'missing-section.html'), MISSING_SECTION);
  await writeFile(resolve(tmpDir, 'broken-link.html'), BROKEN_LINK);
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('validateDocs', () => {
  it('returns zero violations for valid docs', async () => {
    const { violations, filesValid } = await validateDocs({ docsRoot: tmpDir });
    expect(filesValid).toBeGreaterThanOrEqual(1);
    expect(violations.filter(v => v.file === 'valid.html').length).toBe(0);
  });

  it('detects missing required sections', async () => {
    const { violations } = await validateDocs({ docsRoot: tmpDir });
    const fileViolations = violations.filter(v => v.file === 'missing-section.html');
    expect(fileViolations.length).toBeGreaterThan(0);
    expect(fileViolations.some(v => v.violation.includes('execution-plan'))).toBe(true);
    expect(fileViolations.some(v => v.violation.includes('verification'))).toBe(true);
  });

  it('detects broken links', async () => {
    const { violations } = await validateDocs({ docsRoot: tmpDir });
    const linkViolations = violations.filter(v => v.violation.includes('Broken link'));
    expect(linkViolations.length).toBeGreaterThan(0);
  });

  it('reports correct file count', async () => {
    const { filesChecked } = await validateDocs({ docsRoot: tmpDir });
    expect(filesChecked).toBe(3);
  });
});
