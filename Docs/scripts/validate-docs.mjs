#!/usr/bin/env node
// validate-docs.mjs — Validate all HTML docs in Docs/ against the semantic schema.
// Usage: node Docs/scripts/validate-docs.mjs [--verbose]

import { parseHTML } from 'linkedom';
import { readFile } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdir, stat } from 'node:fs/promises';
import { validateDocType, validateBreadcrumb } from '../css/docs-schema.js';

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

async function fileExists(p) {
  try { await stat(p); return true; } catch { return false; }
}

export async function validateDocs(opts = {}) {
  const verbose = opts.verbose || false;
  const docsRoot = opts.docsRoot || DOCS_ROOT;
  const violations = [];
  let filesChecked = 0;
  let filesValid = 0;

  // Collect all existing file paths for link checking
  const allPaths = new Set();
  for await (const fp of walkHtml(docsRoot)) {
    allPaths.add(relative(docsRoot, fp));
  }
  // Also collect epic directories for data-epic validation
  const epicDirs = new Set();
  try {
    const epicEntries = await readdir(resolve(docsRoot, 'epics'), { withFileTypes: true });
    for (const e of epicEntries) {
      if (e.isDirectory()) epicDirs.add(e.name);
    }
  } catch {}

  // Collect top-level non-epic directories as valid contextual data-epic values
  try {
    const topEntries = await readdir(docsRoot, { withFileTypes: true });
    for (const e of topEntries) {
      if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'scripts' && e.name !== 'css' && e.name !== 'templates' && e.name !== 'epics') {
        epicDirs.add(e.name);
      }
    }
  } catch {}

  for await (const filePath of walkHtml(docsRoot)) {
    filesChecked++;
    const relPath = relative(docsRoot, filePath);
    const html = await readFile(filePath, 'utf-8');
    const { document } = parseHTML(html);

    const article = document.querySelector('article[data-doc-type]');
    if (!article) {
      violations.push({ file: relPath, violation: 'No <article data-doc-type="..."> found' });
      continue;
    }

    // Schema validation
    const schemaViolations = validateDocType(article);
    for (const v of schemaViolations) {
      violations.push({ file: relPath, violation: v });
    }

    // Breadcrumb validation
    const breadcrumbViolations = validateBreadcrumb(document);
    for (const v of breadcrumbViolations) {
      violations.push({ file: relPath, violation: v });
    }

    // Link integrity
    const links = document.querySelectorAll('a[href]');
    for (const a of links) {
      const href = a.getAttribute('href');
      if (!href || href.startsWith('http://') || href.startsWith('https://') || href.startsWith('#')) continue;

      const targetRel = resolve(dirname(filePath), href);
      const targetAbs = resolve(docsRoot, targetRel);
      if (!(await fileExists(targetAbs))) {
        violations.push({ file: relPath, violation: `Broken link: ${href}` });
      }
    }

    // Epic directory validation
    const epic = article.getAttribute('data-epic');
    if (epic && !epicDirs.has(epic) && epic !== 'v0.0') {
      violations.push({ file: relPath, violation: `data-epic "${epic}" does not match any epic directory` });
    }

    if (!schemaViolations.length && !breadcrumbViolations.length) filesValid++;
  }

  if (verbose || violations.length > 0) {
    for (const v of violations) {
      console.log(`${v.file}: ${v.violation}`);
    }
  }

  console.log(`\n${filesChecked} files checked, ${filesValid} valid, ${violations.length} violation(s)`);
  return { filesChecked, filesValid, violations };
}

// CLI
const verbose = process.argv.includes('--verbose');

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('validate-docs.mjs')) {
  const { violations } = await validateDocs({ verbose });
  process.exit(violations.length > 0 ? 1 : 0);
}
