import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { checkDocDrift } from './check-doc-drift.mjs';
import { parseHTML } from 'linkedom';

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

function buildSprintHtml(epic: string, phase: string, sprint: string, extras: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Sprint</title></head>
<body>
<article data-doc-type="sprint-plan" data-epic="${epic}" data-phase="${phase}" data-sprint="${sprint}" data-status="planned">
<header><h1>Sprint ${sprint}</h1></header>
<section id="execution-plan"><h2>Execution Plan</h2>
<ol>
<li data-task-id="0.1"><input type="checkbox"><div><strong>Task 0.1</strong><data data-files="src/deleted-file.ts"></data></div></li>
<li data-task-id="0.2"><input type="checkbox"><div><strong>Task 0.2</strong><data data-files="package.json"></data></div></li>
<li data-task-id="0.3"><input type="checkbox"><div><strong>Task 0.3</strong>: <data data-files=""></data></div></li>
<li data-task-id="0.4"><input type="checkbox"><div><strong>Task 0.4</strong></div></li>
</ol>
</section>
${extras}
<nav class="breadcrumb" aria-label="Breadcrumb">
  <a href="../index.html">Epic</a>
  <span aria-hidden="true"> / </span>
  <span aria-current="page">Sprint</span>
</nav>
</article>
</body></html>`;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function parseDoc(html: string) {
  const { document } = parseHTML(html);
  return document;
}

describe('checkDocDrift — Category 1: File Existence', () => {
  let docsRoot: string;
  let repoRoot: string;

  beforeAll(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'drift-repo-'));
    docsRoot = resolve(repoRoot, 'Docs');
    await ensureDir(docsRoot);
  });

  afterAll(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  it('flags missing files', async () => {
    const html = buildSprintHtml('v1.0', '0', '0', '');
    await ensureDir(resolve(docsRoot, 'epics/v1.0/phase-0/sprint-0'));
    await writeFile(resolve(docsRoot, 'epics/v1.0/phase-0/sprint-0/sprint.html'), html);

    const findings = await checkDocDrift({ docsRoot, repoRoot });
    const cat1 = findings.categories['1_file_existence'];

    const missing = cat1.filter(f => f.path === 'src/deleted-file.ts');
    expect(missing.length).toBe(1);
    expect(missing[0].status).toBe('missing');
  });

  it('does NOT flag existing files', async () => {
    // Create the file that will be referenced
    await writeFile(resolve(repoRoot, 'package.json'), JSON.stringify({ name: 'test', scripts: {} }));

    const findings = await checkDocDrift({ docsRoot, repoRoot });
    const cat1 = findings.categories['1_file_existence'];

    const existing = cat1.filter(f => f.path === 'package.json');
    expect(existing.length).toBe(0);
  });

  it('skips empty data-files attributes', async () => {
    const findings = await checkDocDrift({ docsRoot, repoRoot });
    const cat1 = findings.categories['1_file_existence'];

    const empty = cat1.filter(f => f.task_id === '0.3');
    expect(empty.length).toBe(0);
  });

  it('skips tasks with no data-files element', async () => {
    const findings = await checkDocDrift({ docsRoot, repoRoot });
    const cat1 = findings.categories['1_file_existence'];

    const noData = cat1.filter(f => f.task_id === '0.4');
    expect(noData.length).toBe(0);
  });

  it('skips glob patterns', async () => {
    const html = buildSprintHtml('v1.0', '0', '1', `
<section id="execution-plan-extras"><ol>
<li data-task-id="1.1"><input type="checkbox"><div><strong>Task 1.1</strong>: <data data-files="apps/**/*.ts Docs/**/*.html"></data></div></li>
</ol></section>`);
    await ensureDir(resolve(docsRoot, 'epics/v1.0/phase-0/sprint-1'));
    await writeFile(resolve(docsRoot, 'epics/v1.0/phase-0/sprint-1/sprint.html'), html);

    const findings = await checkDocDrift({ docsRoot, repoRoot });
    const cat1 = findings.categories['1_file_existence'];
    const globs = cat1.filter(f => f.path.includes('*'));
    expect(globs.length).toBe(0);
  });
});

describe('checkDocDrift — Category 2: Test Commands', () => {
  let docsRoot: string;
  let repoRoot: string;

  beforeAll(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'drift-cmd-'));
    docsRoot = resolve(repoRoot, 'Docs');
    await ensureDir(docsRoot);

    // Create a valid package with a test script
    await ensureDir(resolve(repoRoot, 'apps/backend'));
    await writeFile(resolve(repoRoot, 'apps/backend/package.json'), JSON.stringify({
      name: '@caroline/backend',
      scripts: { test: 'vitest', build: 'tsup', typecheck: 'tsc --noEmit', dev: 'tsx watch' },
    }));
    await writeFile(resolve(repoRoot, 'pnpm-workspace.yaml'), 'packages:\n  - apps/*\n  - packages/*');
  });

  afterAll(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  function buildCmdHtml(cmds: string) {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Sprint</title></head>
<body>
<article data-doc-type="sprint-plan" data-epic="v1.0" data-phase="0" data-sprint="0" data-status="planned">
<header><h1>Sprint 0</h1></header>
<section id="execution-plan"><h2>EP</h2>
<ol><li data-task-id="0.1"><input type="checkbox"><div><strong>Task</strong></div></li></ol>
</section>
<section id="verification"><h2>Verification</h2>
<ul>
${cmds}
</ul>
</section>
<nav class="breadcrumb" aria-label="Breadcrumb"></nav>
</article>
</body></html>`;
  }

  it('flags stale test command (package not found)', async () => {
    const html = buildCmdHtml(`<li><code>pnpm --filter @caroline/missing test --run</code></li>`);
    await ensureDir(resolve(docsRoot, 'epics/v1.0/phase-0/sprint-0'));
    await writeFile(resolve(docsRoot, 'epics/v1.0/phase-0/sprint-0/sprint.html'), html);

    const findings = await checkDocDrift({ docsRoot, repoRoot });
    const cat2 = findings.categories['2_test_commands'];
    expect(cat2.length).toBe(1);
    expect(cat2[0].status).toBe('package_not_found');
  });

  it('does NOT flag valid test command', async () => {
    const html = buildCmdHtml(`<li><code>pnpm --filter @caroline/backend test --run</code></li>`);
    const sprintNum = '1';
    await ensureDir(resolve(docsRoot, `epics/v1.0/phase-0/sprint-${sprintNum}`));
    await writeFile(resolve(docsRoot, `epics/v1.0/phase-0/sprint-${sprintNum}/sprint.html`), html);

    const findings = await checkDocDrift({ docsRoot, repoRoot });
    const cat2 = findings.categories['2_test_commands'];
    const fromThisSprint = cat2.filter(f => f.doc.includes(`sprint-${sprintNum}`));
    expect(fromThisSprint.length).toBe(0);
  });

  it('skips pnpm exec commands', async () => {
    const html = buildCmdHtml(`<li><code>pnpm --filter @caroline/backend exec tsc -b</code></li>`);
    const sprintNum = '2';
    await ensureDir(resolve(docsRoot, `epics/v1.0/phase-0/sprint-${sprintNum}`));
    await writeFile(resolve(docsRoot, `epics/v1.0/phase-0/sprint-${sprintNum}/sprint.html`), html);

    const findings = await checkDocDrift({ docsRoot, repoRoot });
    const cat2 = findings.categories['2_test_commands'];
    const fromThisSprint = cat2.filter(f => f.doc.includes(`sprint-${sprintNum}`));
    expect(fromThisSprint.length).toBe(0);
  });

  it('flags node command referencing missing script', async () => {
    const html = buildCmdHtml(`<li><code>node Docs/scripts/nonexistent.mjs</code></li>`);
    const sprintNum = '3';
    await ensureDir(resolve(docsRoot, `epics/v1.0/phase-0/sprint-${sprintNum}`));
    await writeFile(resolve(docsRoot, `epics/v1.0/phase-0/sprint-${sprintNum}/sprint.html`), html);

    const findings = await checkDocDrift({ docsRoot, repoRoot });
    const cat2 = findings.categories['2_test_commands'];
    const fromThisSprint = cat2.filter(f => f.doc.includes(`sprint-${sprintNum}`));
    expect(fromThisSprint.length).toBe(1);
    expect(fromThisSprint[0].status).toBe('script_not_found');
  });

  it('does NOT flag node command referencing existing script', async () => {
    await ensureDir(resolve(repoRoot, 'Docs/scripts'));
    await writeFile(resolve(repoRoot, 'Docs/scripts/exists.mjs'), '// test');

    const html = buildCmdHtml(`<li><code>node Docs/scripts/exists.mjs</code></li>`);
    const sprintNum = '4';
    await ensureDir(resolve(docsRoot, `epics/v1.0/phase-0/sprint-${sprintNum}`));
    await writeFile(resolve(docsRoot, `epics/v1.0/phase-0/sprint-${sprintNum}/sprint.html`), html);

    const findings = await checkDocDrift({ docsRoot, repoRoot });
    const cat2 = findings.categories['2_test_commands'];
    const fromThisSprint = cat2.filter(f => f.doc.includes(`sprint-${sprintNum}`));
    expect(fromThisSprint.length).toBe(0);
  });

  it('skips npx commands (cannot validate statically)', async () => {
    const html = buildCmdHtml(`<li><code>npx vitest run Docs/scripts/</code></li>`);
    const sprintNum = '5';
    await ensureDir(resolve(docsRoot, `epics/v1.0/phase-0/sprint-${sprintNum}`));
    await writeFile(resolve(docsRoot, `epics/v1.0/phase-0/sprint-${sprintNum}/sprint.html`), html);

    const findings = await checkDocDrift({ docsRoot, repoRoot });
    const cat2 = findings.categories['2_test_commands'];
    const fromThisSprint = cat2.filter(f => f.doc.includes(`sprint-${sprintNum}`));
    expect(fromThisSprint.length).toBe(0);
  });

  it('ignores commands outside verification section', async () => {
    const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Sprint</title></head>
<body>
<article data-doc-type="sprint-plan" data-epic="v1.0" data-phase="0" data-sprint="6" data-status="planned">
<header><h1>Sprint 6</h1></header>
<section id="execution-plan"><h2>EP</h2>
<ol><li data-task-id="0.1"><input type="checkbox"><div><strong>Task</strong>: Run <code>pnpm --filter @caroline/missing test</code></div></li></ol>
</section>
<nav class="breadcrumb" aria-label="Breadcrumb"></nav>
</article>
</body></html>`;
    const sprintNum = '6';
    await ensureDir(resolve(docsRoot, `epics/v1.0/phase-0/sprint-${sprintNum}`));
    await writeFile(resolve(docsRoot, `epics/v1.0/phase-0/sprint-${sprintNum}/sprint.html`), html);

    const findings = await checkDocDrift({ docsRoot, repoRoot });
    const cat2 = findings.categories['2_test_commands'];
    const fromThisSprint = cat2.filter(f => f.doc.includes(`sprint-${sprintNum}`));
    expect(fromThisSprint.length).toBe(0);
  });
});

describe('checkDocDrift — Category 3: External Links', () => {
  let docsRoot: string;
  let repoRoot: string;

  beforeAll(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), 'drift-link-'));
    docsRoot = resolve(repoRoot, 'Docs');
    await ensureDir(docsRoot);

    // Create an existing file for valid external link
    await ensureDir(resolve(repoRoot, 'apps/backend/src'));
    await writeFile(resolve(repoRoot, 'apps/backend/src/exists.ts'), 'export const x = 1;');
  });

  afterAll(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  function buildLinkSprintHtml(linkHtml: string) {
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Sprint</title></head>
<body>
<article data-doc-type="sprint-plan" data-epic="v1.0" data-phase="0" data-sprint="0" data-status="planned">
<header><h1>Sprint 0</h1></header>
<section id="execution-plan"><h2>EP</h2>
<ol><li data-task-id="0.1"><input type="checkbox"><div><strong>Task</strong>: ${linkHtml}</div></li></ol>
</section>
<nav class="breadcrumb" aria-label="Breadcrumb"></nav>
</article>
</body></html>`;
  }

  it('flags broken external link', async () => {
    // Sprint plan is at Docs/epics/v1.0/phase-0/sprint-0/sprint.html (depth 5 inside Docs)
    // Need 5 '../' to reach repo root, then apps/backend/src/nonexistent.ts
    const html = buildLinkSprintHtml('See <a href="../../../../../apps/backend/src/nonexistent.ts">file</a>');
    const sprintNum = '0';
    await ensureDir(resolve(docsRoot, `epics/v1.0/phase-0/sprint-${sprintNum}`));
    await writeFile(resolve(docsRoot, `epics/v1.0/phase-0/sprint-${sprintNum}/sprint.html`), html);

    const findings = await checkDocDrift({ docsRoot, repoRoot });
    const cat3 = findings.categories['3_external_links'];
    const fromThisSprint = cat3.filter(f => f.doc.includes(`sprint-${sprintNum}`));
    expect(fromThisSprint.length).toBe(1);
    expect(fromThisSprint[0].status).toBe('broken');
  });

  it('does NOT flag valid external link', async () => {
    const html = buildLinkSprintHtml('See <a href="../../../../../apps/backend/src/exists.ts">file</a>');
    const sprintNum = '1';
    await ensureDir(resolve(docsRoot, `epics/v1.0/phase-0/sprint-${sprintNum}`));
    await writeFile(resolve(docsRoot, `epics/v1.0/phase-0/sprint-${sprintNum}/sprint.html`), html);

    const findings = await checkDocDrift({ docsRoot, repoRoot });
    const cat3 = findings.categories['3_external_links'];
    const fromThisSprint = cat3.filter(f => f.doc.includes(`sprint-${sprintNum}`));
    expect(fromThisSprint.length).toBe(0);
  });

  it('skips links within Docs/ tree', async () => {
    const html = buildLinkSprintHtml('See <a href="epics/v1.0/index.html">file</a>');
    const sprintNum = '2';
    await ensureDir(resolve(docsRoot, `epics/v1.0/phase-0/sprint-${sprintNum}`));
    await writeFile(resolve(docsRoot, `epics/v1.0/phase-0/sprint-${sprintNum}/sprint.html`), html);

    const findings = await checkDocDrift({ docsRoot, repoRoot });
    const cat3 = findings.categories['3_external_links'];
    const fromThisSprint = cat3.filter(f => f.doc.includes(`sprint-${sprintNum}`));
    expect(fromThisSprint.length).toBe(0);
  });

  it('skips http/https links', async () => {
    const html = buildLinkSprintHtml('See <a href="https://example.com/file.ts">file</a>');
    const sprintNum = '3';
    await ensureDir(resolve(docsRoot, `epics/v1.0/phase-0/sprint-${sprintNum}`));
    await writeFile(resolve(docsRoot, `epics/v1.0/phase-0/sprint-${sprintNum}/sprint.html`), html);

    const findings = await checkDocDrift({ docsRoot, repoRoot });
    const cat3 = findings.categories['3_external_links'];
    const fromThisSprint = cat3.filter(f => f.doc.includes(`sprint-${sprintNum}`));
    expect(fromThisSprint.length).toBe(0);
  });
});

describe('checkDocDrift — Output & Boundaries', () => {
  it('produces HTML audit report with --audit-output', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'drift-audit-'));
    const docsRoot = resolve(repoRoot, 'Docs');
    try {
      await ensureDir(docsRoot);

      const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Sprint</title></head>
<body>
<article data-doc-type="sprint-plan" data-epic="v1.0" data-phase="0" data-sprint="0" data-status="planned">
<header><h1>Sprint 0</h1></header>
<section id="execution-plan"><h2>EP</h2>
<ol>
<li data-task-id="0.1"><input type="checkbox"><div><strong>Task</strong><data data-files="missing.ts"></data></div></li>
</ol>
</section>
<nav class="breadcrumb" aria-label="Breadcrumb"></nav>
</article>
</body></html>`;
      await ensureDir(resolve(docsRoot, 'epics/v1.0/phase-0/sprint-0'));
      await writeFile(resolve(docsRoot, 'epics/v1.0/phase-0/sprint-0/sprint.html'), html);

      const { checkDocDrift } = await import('./check-doc-drift.mjs');
      const findings = await checkDocDrift({ docsRoot, repoRoot });

      expect(findings.categories['1_file_existence'].length).toBe(1);

      // Verify audit HTML generation
      const { buildHtmlAudit } = await import('./check-doc-drift.mjs');
      const auditHtml = buildHtmlAudit(findings);
      expect(auditHtml).toContain('data-doc-type="audit"');
      expect(auditHtml).toContain('missing.ts');
      expect(auditHtml).toContain('<section id="summary">');
      expect(auditHtml).toContain('<section id="recommendations">');
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('skips template files in templates/ directory', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'drift-tmpl-'));
    const docsRoot = resolve(repoRoot, 'Docs');
    try {
      const templateHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Template Sprint</title></head>
<body>
<article data-doc-type="sprint-plan" data-epic="v1.0" data-phase="0" data-sprint="0">
<header><h1>Sprint</h1></header>
<section id="execution-plan"><h2>EP</h2>
<ol>
<li data-task-id="0.1"><input type="checkbox"><div><strong>Task</strong><data data-files="nonexistent.ts"></data></div></li>
</ol>
</section>
</article>
</body></html>`;
      await ensureDir(resolve(docsRoot, 'templates'));
      await writeFile(resolve(docsRoot, 'templates/sprint-plan.html'), templateHtml);

      const { checkDocDrift } = await import('./check-doc-drift.mjs');
      const findings = await checkDocDrift({ docsRoot, repoRoot });

      expect(findings.categories['1_file_existence'].length).toBe(0);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

  it('skips EPIC_NAME placeholder sprint plans', async () => {
    const repoRoot = await mkdtemp(join(tmpdir(), 'drift-epicname-'));
    const docsRoot = resolve(repoRoot, 'Docs');
    try {
      const placeholderHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Placeholder</title></head>
<body>
<article data-doc-type="sprint-plan" data-epic="EPIC_NAME" data-phase="N" data-sprint="N">
<header><h1>Template</h1></header>
<section id="execution-plan"><h2>EP</h2>
<ol>
<li data-task-id="0.1"><input type="checkbox"><div><strong>Task</strong><data data-files="nonexistent.ts"></data></div></li>
</ol>
</section>
</article>
</body></html>`;
      await ensureDir(resolve(docsRoot, 'epics/EPIC_NAME/phase-N/sprint-N'));
      await writeFile(resolve(docsRoot, 'epics/EPIC_NAME/phase-N/sprint-N/sprint.html'), placeholderHtml);

      const { checkDocDrift } = await import('./check-doc-drift.mjs');
      const findings = await checkDocDrift({ docsRoot, repoRoot });

      expect(findings.categories['1_file_existence'].length).toBe(0);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});
