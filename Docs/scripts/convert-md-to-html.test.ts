import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import { convertMdToHtml } from './convert-md-to-html.mjs';

let tmpDir: string;

async function ensureDir(dir: string) {
  await mkdir(dir, { recursive: true });
}

function parseHtmlFile(html: string) {
  return parseHTML(html).document;
}

beforeAll(async () => {
  tmpDir = await mkdtemp(join(tmpdir(), 'convert-test-'));
});

afterAll(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

describe('convertMdToHtml — doc type detection', () => {
  it('detects sprint-plan from README.md in sprint directory', async () => {
    const input = resolve(tmpDir, 'epics/v1.0-local-canvas/phase-5/sprint-0-distiller/README.md');
    const output = resolve(tmpDir, 'epics/v1.0-local-canvas/phase-5/sprint-0-distiller/sprint.html');
    await ensureDir(resolve(tmpDir, 'epics/v1.0-local-canvas/phase-5/sprint-0-distiller'));
    await writeFile(input, '# Sprint 5: Test\n\n## Objective\n\nTest content.\n');

    const result = await convertMdToHtml(input, output, { docsRoot: tmpDir });
    expect(result.docType).toBe('sprint-plan');
    expect(result.meta.epic).toBe('v1.0-local-canvas');
    expect(result.meta.phase).toBe('5');
    expect(result.meta.sprint).toBe('0');
  });

  it('detects epic-overview from epic-overview.md', async () => {
    const input = resolve(tmpDir, 'epics/v1.0-local-canvas/epic-overview.md');
    const output = resolve(tmpDir, 'epics/v1.0-local-canvas/epic-overview.html');
    await ensureDir(resolve(tmpDir, 'epics/v1.0-local-canvas'));
    await writeFile(input, '# Epic Test\n\n## Vision\n\nTest.\n');

    const result = await convertMdToHtml(input, output, { docsRoot: tmpDir });
    expect(result.docType).toBe('epic-overview');
    expect(result.meta.epic).toBe('v1.0-local-canvas');
  });

  it('detects epic-backlog from epic-backlog.md', async () => {
    const input = resolve(tmpDir, 'epics/v1.1-cloud-collaboration/epic-backlog.md');
    const output = resolve(tmpDir, 'epics/v1.1-cloud-collaboration/epic-backlog.html');
    await ensureDir(resolve(tmpDir, 'epics/v1.1-cloud-collaboration'));
    await writeFile(input, '# Backlog\n\n## Section\n\nTest.\n');

    const result = await convertMdToHtml(input, output, { docsRoot: tmpDir });
    expect(result.docType).toBe('epic-backlog');
  });

  it('detects risk-registry from risk-registry.md', async () => {
    const input = resolve(tmpDir, 'epics/v1.2-ascent-landing/risk-registry.md');
    const output = resolve(tmpDir, 'epics/v1.2-ascent-landing/risk-registry.html');
    await ensureDir(resolve(tmpDir, 'epics/v1.2-ascent-landing'));
    await writeFile(input, '# Risk Registry\n\n## Risks\n\nTest.\n');

    const result = await convertMdToHtml(input, output, { docsRoot: tmpDir });
    expect(result.docType).toBe('risk-registry');
  });

  it('detects residual from RESIDUAL.md', async () => {
    const input = resolve(tmpDir, 'epics/v1.2-ascent-landing/phase-1/RESIDUAL.md');
    const output = resolve(tmpDir, 'epics/v1.2-ascent-landing/phase-1/residual.html');
    await ensureDir(resolve(tmpDir, 'epics/v1.2-ascent-landing/phase-1'));
    await writeFile(input, '# Residual\n\n## Category A\n\nTest.\n');

    const result = await convertMdToHtml(input, output, { docsRoot: tmpDir });
    expect(result.docType).toBe('residual');
    expect(result.meta.phase).toBe('1');
  });

  it('detects audit from audits/ directory', async () => {
    const input = resolve(tmpDir, 'audits/test-audit.md');
    const output = resolve(tmpDir, 'audits/test-audit.html');
    await ensureDir(resolve(tmpDir, 'audits'));
    await writeFile(input, '# Audit\n\n## Summary\n\nTest.\n');

    const result = await convertMdToHtml(input, output, { docsRoot: tmpDir });
    expect(result.docType).toBe('audit');
  });

  it('detects reference from references/ and architecture/ directories', async () => {
    const refInput = resolve(tmpDir, 'references/test-ref.md');
    const refOutput = resolve(tmpDir, 'references/test-ref.html');
    await ensureDir(resolve(tmpDir, 'references'));
    await writeFile(refInput, '# Reference\n\nTest.\n');

    const refResult = await convertMdToHtml(refInput, refOutput, { docsRoot: tmpDir });
    expect(refResult.docType).toBe('reference');

    const archInput = resolve(tmpDir, 'architecture/system-overview.md');
    const archOutput = resolve(tmpDir, 'architecture/system-overview.html');
    await ensureDir(resolve(tmpDir, 'architecture'));
    await writeFile(archInput, '# Architecture\n\nTest.\n');

    const archResult = await convertMdToHtml(archInput, archOutput, { docsRoot: tmpDir });
    expect(archResult.docType).toBe('reference');
  });

  it('respects --doc-type override', async () => {
    const input = resolve(tmpDir, 'misc/custom.md');
    const output = resolve(tmpDir, 'misc/custom.html');
    await ensureDir(resolve(tmpDir, 'misc'));
    await writeFile(input, '# Custom\n\nTest.\n');

    const result = await convertMdToHtml(input, output, { docsRoot: tmpDir, docType: 'reference' });
    expect(result.docType).toBe('reference');
  });
});

describe('convertMdToHtml — checkbox conversion', () => {
  it('converts [x] to checked checkbox', async () => {
    const input = resolve(tmpDir, 'epics/test-epic/phase-0/sprint-0-test/README.md');
    const output = resolve(tmpDir, 'epics/test-epic/phase-0/sprint-0-test/sprint.html');
    const md = `# Sprint 0: Test\n\n## Execution Plan\n\n### 1. Test\n\n- [x] Done task\n- [ ] Open task\n\n`;
    await ensureDir(dirname(input));
    await writeFile(input, md);

    await convertMdToHtml(input, output, { docsRoot: tmpDir });
    const html = await readFile(output, 'utf-8');
    const doc = parseHtmlFile(html);

    const lis = doc.querySelectorAll('li[data-task-id]');
    expect(lis.length).toBe(2);

    const done = lis[0].querySelector('input[type="checkbox"]');
    expect(done).toBeTruthy();
    expect(done!.hasAttribute('checked')).toBe(true);

    const open = lis[1].querySelector('input[type="checkbox"]');
    expect(open).toBeTruthy();
    expect(open!.hasAttribute('checked')).toBe(false);
  });

  it('strips [x] / [ ] prefix from text', async () => {
    const input = resolve(tmpDir, 'epics/test-epic/phase-0/sprint-0-strip/README.md');
    const output = resolve(tmpDir, 'epics/test-epic/phase-0/sprint-0-strip/sprint.html');
    const md = `# Sprint 0: Test\n\n## Execution Plan\n\n### 1. Test\n\n- [x] **Bold task**\n\n`;
    await ensureDir(dirname(input));
    await writeFile(input, md);

    await convertMdToHtml(input, output, { docsRoot: tmpDir });
    const html = await readFile(output, 'utf-8');
    const doc = parseHtmlFile(html);

    const li = doc.querySelector('li');
    expect(li!.textContent).toContain('Bold task');
    expect(li!.textContent).not.toMatch(/^\s*\[x\]/);
  });
});

describe('convertMdToHtml — task ID derivation', () => {
  it('derives task IDs from numbered section headers', async () => {
    const input = resolve(tmpDir, 'epics/test-epic/phase-0/sprint-0-ids/README.md');
    const output = resolve(tmpDir, 'epics/test-epic/phase-0/sprint-0-ids/sprint.html');
    const md = `# Sprint 0: Test

## Execution Plan

### 2. Whiteboard Tooling
- [x] Task A
- [x] Task B

### 3. State Awareness
- [x] Task C
`;
    await ensureDir(dirname(input));
    await writeFile(input, md);

    await convertMdToHtml(input, output, { docsRoot: tmpDir });
    const html = await readFile(output, 'utf-8');
    const doc = parseHtmlFile(html);

    const lis = doc.querySelectorAll('li[data-task-id]');
    expect(lis.length).toBe(3);
    expect(lis[0].getAttribute('data-task-id')).toBe('2.1');
    expect(lis[1].getAttribute('data-task-id')).toBe('2.2');
    expect(lis[2].getAttribute('data-task-id')).toBe('3.1');
  });

  it('does not assign task IDs to verification items', async () => {
    const input = resolve(tmpDir, 'epics/test-epic/phase-0/sprint-0-verify/README.md');
    const output = resolve(tmpDir, 'epics/test-epic/phase-0/sprint-0-verify/sprint.html');
    const md = `# Sprint 0: Test

## Execution Plan

### 1. Foundation
- [x] Task 1

## Verification & Acceptance Criteria
- [x] Criterion A
- [ ] Criterion B
`;
    await ensureDir(dirname(input));
    await writeFile(input, md);

    await convertMdToHtml(input, output, { docsRoot: tmpDir });
    const html = await readFile(output, 'utf-8');
    const doc = parseHtmlFile(html);

    // The execution plan task should have a task ID
    const taskItems = doc.querySelectorAll('li[data-task-id]');
    expect(taskItems.length).toBe(1);
    expect(taskItems[0].getAttribute('data-task-id')).toBe('1.1');

    // Verification items should have checkboxes but no task ID
    const allCheckboxItems = doc.querySelectorAll('li input[type="checkbox"]');
    expect(allCheckboxItems.length).toBe(3);
  });
});

describe('convertMdToHtml — heading handling', () => {
  it('strips the first h1 and uses it as the title', async () => {
    const input = resolve(tmpDir, 'epics/test-epic/phase-0/sprint-0-h1/README.md');
    const output = resolve(tmpDir, 'epics/test-epic/phase-0/sprint-0-h1/sprint.html');
    const md = `# Sprint 5: Distiller AI\n\n## Objective\n\nTest content.\n`;
    await ensureDir(dirname(input));
    await writeFile(input, md);

    const result = await convertMdToHtml(input, output, { docsRoot: tmpDir });
    expect(result.title).toBe('Sprint 5: Distiller AI');

    const html = await readFile(output, 'utf-8');
    const doc = parseHtmlFile(html);

    // Template h1 should use cleaned title
    const h1 = doc.querySelector('header h1');
    expect(h1!.textContent).toContain('Distiller AI');

    // Body should not have a duplicate h1
    const articleH1 = doc.querySelector('article > h1');
    expect(articleH1).toBeFalsy();

    // Body should have an h2
    const h2 = doc.querySelector('h2');
    expect(h2).toBeTruthy();
    expect(h2!.textContent).toContain('Objective');
  });

  it('adds id attributes to headings from text', async () => {
    const input = resolve(tmpDir, 'epics/test-epic/phase-0/sprint-0-ids-h/README.md');
    const output = resolve(tmpDir, 'epics/test-epic/phase-0/sprint-0-ids-h/sprint.html');
    const md = `# Test\n\n## Objective\n\n### In-Scope\n\nContent.\n`;
    await ensureDir(dirname(input));
    await writeFile(input, md);

    await convertMdToHtml(input, output, { docsRoot: tmpDir });
    const html = await readFile(output, 'utf-8');

    expect(html).toContain('id="objective"');
    expect(html).toContain('id="in-scope"');
  });
});

describe('convertMdToHtml — template wrapping', () => {
  it('produces HTML that passes schema validation', async () => {
    const { validateHtmlString } = await import('../css/docs-schema.js');
    const { parseHTML: rawParseHTML } = await import('linkedom');
    const parser = { parseHTML: (h: string) => rawParseHTML(h).document };

    const input = resolve(tmpDir, 'epics/test-epic/phase-0/sprint-0-schema/README.md');
    const output = resolve(tmpDir, 'epics/test-epic/phase-0/sprint-0-schema/sprint.html');
    const md = `# Sprint 0: Test

## Objective
Test objectives.

## Execution Plan

### 1. Setup
- [x] Task one
- [ ] Task two

## Verification
- [x] Test passes
`;
    await ensureDir(dirname(input));
    await writeFile(input, md);

    await convertMdToHtml(input, output, { docsRoot: tmpDir });
    const html = await readFile(output, 'utf-8');

    const violations = validateHtmlString(html, parser);
    // Ignore violations about missing data-files (not auto-populated)
    const nonDataFiles = violations.filter(v => !v.includes('data-files'));
    expect(nonDataFiles).toEqual([]);
  });

  it('includes correct breadcrumb for sprint-plan', async () => {
    const input = resolve(tmpDir, 'epics/test-epic/phase-2/sprint-3-test/README.md');
    const output = resolve(tmpDir, 'epics/test-epic/phase-2/sprint-3-test/sprint.html');
    const md = `# Test\n\n## Objective\n\nContent.\n`;
    await ensureDir(dirname(input));
    await writeFile(input, md);

    await convertMdToHtml(input, output, { docsRoot: tmpDir });
    const html = await readFile(output, 'utf-8');

    expect(html).toContain('aria-label="Breadcrumb"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('../../index.html'); // epic index
    expect(html).toContain('../index.html'); // phase index
  });
});

describe('convertMdToHtml — CSS path depth', () => {
  it('computes correct CSS path for different depths', async () => {
    // Depth 4: epics/E/phase-N/sprint-N/sprint.html
    const d4In = resolve(tmpDir, 'epics/t/phase-0/sprint-0-test/README.md');
    const d4Out = resolve(tmpDir, 'epics/t/phase-0/sprint-0-test/sprint.html');
    await ensureDir(dirname(d4In));
    await writeFile(d4In, '# Test\n\n## Objective\n\nContent.\n');
    await convertMdToHtml(d4In, d4Out, { docsRoot: tmpDir });
    const d4html = await readFile(d4Out, 'utf-8');
    expect(d4html).toContain('href="../../../../css/docs-base.css"');

    // Depth 1: audits/audit.html
    const d1In = resolve(tmpDir, 'audits/audit.md');
    const d1Out = resolve(tmpDir, 'audits/audit.html');
    await ensureDir(dirname(d1In));
    await writeFile(d1In, '# Audit\n\n## Summary\n\nContent.\n');
    await convertMdToHtml(d1In, d1Out, { docsRoot: tmpDir });
    const d1html = await readFile(d1Out, 'utf-8');
    expect(d1html).toContain('href="../css/docs-base.css"');

    // Depth 2: epics/E/epic-overview.html
    const d2In = resolve(tmpDir, 'epics/t/epic-overview.md');
    const d2Out = resolve(tmpDir, 'epics/t/epic-overview.html');
    await ensureDir(dirname(d2In));
    await writeFile(d2In, '# Epic\n\n## Vision\n\nContent.\n');
    await convertMdToHtml(d2In, d2Out, { docsRoot: tmpDir });
    const d2html = await readFile(d2Out, 'utf-8');
    expect(d2html).toContain('href="../../css/docs-base.css"');
  });
});

describe('convertMdToHtml — status detection', () => {
  it('sets status to completed when all checkboxes are checked', async () => {
    const input = resolve(tmpDir, 'epics/test-epic/phase-0/sprint-0-done/README.md');
    const output = resolve(tmpDir, 'epics/test-epic/phase-0/sprint-0-done/sprint.html');
    const md = `# Sprint


## Execution Plan

### 1. Done
- [x] All done
- [x] Everything done
`;
    await ensureDir(dirname(input));
    await writeFile(input, md);

    const result = await convertMdToHtml(input, output, { docsRoot: tmpDir });
    expect(result.status).toBe('completed');

    const html = await readFile(output, 'utf-8');
    expect(html).toContain('data-status="completed"');
  });

  it('sets status to active when any checkbox is unchecked', async () => {
    const input = resolve(tmpDir, 'epics/test-epic/phase-0/sprint-0-active/README.md');
    const output = resolve(tmpDir, 'epics/test-epic/phase-0/sprint-0-active/sprint.html');
    const md = `# Sprint

## Execution Plan

### 1. Mixed
- [x] Done
- [ ] Not done
`;
    await ensureDir(dirname(input));
    await writeFile(input, md);

    const result = await convertMdToHtml(input, output, { docsRoot: tmpDir });
    expect(result.status).toBe('active');
  });
});

describe('convertMdToHtml — content preservation', () => {
  it('preserves fenced code blocks', async () => {
    const input = resolve(tmpDir, 'epics/test-epic/phase-0/sprint-0-code/README.md');
    const output = resolve(tmpDir, 'epics/test-epic/phase-0/sprint-0-code/sprint.html');
    const md = `# Test

## Objective

\`\`\`typescript
const x = 1;
console.log(x);
\`\`\`
`;
    await ensureDir(dirname(input));
    await writeFile(input, md);

    await convertMdToHtml(input, output, { docsRoot: tmpDir });
    const html = await readFile(output, 'utf-8');
    expect(html).toContain('<pre>');
    expect(html).toContain('<code');
    expect(html).toContain('const x = 1');
  });

  it('preserves tables', async () => {
    const input = resolve(tmpDir, 'epics/test-epic/phase-0/sprint-0-table/README.md');
    const output = resolve(tmpDir, 'epics/test-epic/phase-0/sprint-0-table/sprint.html');
    const md = `# Test

| Col A | Col B |
|-------|-------|
| Val 1 | Val 2 |
`;
    await ensureDir(dirname(input));
    await writeFile(input, md);

    await convertMdToHtml(input, output, { docsRoot: tmpDir });
    const html = await readFile(output, 'utf-8');
    const doc = parseHtmlFile(html);
    const table = doc.querySelector('table');
    expect(table).toBeTruthy();
  });

  it('handles markdown links', async () => {
    const input = resolve(tmpDir, 'epics/test-epic/phase-0/sprint-0-links/README.md');
    const output = resolve(tmpDir, 'epics/test-epic/phase-0/sprint-0-links/sprint.html');
    const md = `# Test\n\n## Objective\n\nSee [backlog](../epic-backlog.md) for details.\n`;
    await ensureDir(dirname(input));
    await writeFile(input, md);

    await convertMdToHtml(input, output, { docsRoot: tmpDir });
    const html = await readFile(output, 'utf-8');

    const doc = parseHtmlFile(html);
    const link = doc.querySelector('a[href]');
    expect(link).toBeTruthy();
    expect(link!.getAttribute('href')).toBe('../epic-backlog.html');
  });
});

describe('convertMdToHtml — sprint number extraction', () => {
  it('extracts integer sprint numbers', async () => {
    const input = resolve(tmpDir, 'epics/test-epic/phase-0/sprint-7-test/README.md');
    const output = resolve(tmpDir, 'epics/test-epic/phase-0/sprint-7-test/sprint.html');
    await ensureDir(dirname(input));
    await writeFile(input, '# Test\n\n## Objective\n\nContent.\n');

    const result = await convertMdToHtml(input, output, { docsRoot: tmpDir });
    expect(result.meta.sprint).toBe('7');
  });

  it('extracts fractional sprint numbers', async () => {
    const input = resolve(tmpDir, 'epics/test-epic/phase-0/sprint-1.1-test/README.md');
    const output = resolve(tmpDir, 'epics/test-epic/phase-0/sprint-1.1-test/sprint.html');
    await ensureDir(dirname(input));
    await writeFile(input, '# Test\n\n## Objective\n\nContent.\n');

    const result = await convertMdToHtml(input, output, { docsRoot: tmpDir });
    expect(result.meta.sprint).toBe('1.1');
  });
});

describe('dirname() polyfill', () => {
  function dirname(p: string) {
    return p.split('/').slice(0, -1).join('/') || '.';
  }
  it('works', () => {
    expect(dirname('/a/b/c.md')).toBe('/a/b');
    expect(dirname('c.md')).toBe('.');
  });
});
