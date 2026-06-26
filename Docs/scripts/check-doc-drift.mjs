#!/usr/bin/env node
// check-doc-drift.mjs — Mechanical drift detection for docs against the codebase.
// Usage: node Docs/scripts/check-doc-drift.mjs [--audit-output <path>] [--repo-root <path>]

import { parseHTML } from 'linkedom';
import { readFile, writeFile, mkdir, readdir, stat } from 'node:fs/promises';
import { resolve, relative, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { statSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_ROOT = resolve(__dirname, '..');

// Detects repo root: --repo-root flag → SPIDERWEB_REPO_ROOT env → walk up for .git/ → package.json → null
function findRepoRoot(opts = {}) {
  // 1. Explicit CLI flag
  if (opts.repoRoot) return resolve(opts.repoRoot);

  // 2. Environment variable
  if (process.env.SPIDERWEB_REPO_ROOT) return resolve(process.env.SPIDERWEB_REPO_ROOT);

  // 3. Walk up from Docs/ looking for .git/ then package.json
  let dir = resolve(DOCS_ROOT, '..');
  for (let i = 0; i < 10; i++) {
    try { statSync(join(dir, '.git')); return dir; } catch {}
    try { statSync(join(dir, 'package.json')); return dir; } catch {}
    const parent = resolve(dir, '..');
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

let _cachedRepoRoot = null;async function* walkHtml(dir) {
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

function resolvePackageDir(repoRoot, pkgName) {
  if (!repoRoot) return [];
  const name = pkgName.replace(/^@[\w-]+\//, '');
  return [join(repoRoot, 'apps', name), join(repoRoot, 'packages', name)];
}

async function findPackageDir(repoRoot, pkgName) {
  for (const dir of resolvePackageDir(repoRoot, pkgName)) {
    if (await fileExists(dir)) return dir;
  }
  return null;
}

async function findRootPackageDir(repoRoot) {
  if (!repoRoot) return null;
  const pkgPath = join(repoRoot, 'package.json');
  if (await fileExists(pkgPath)) return repoRoot;
  return null;
}

const PNPM_FILTER_RE = /pnpm\s+(?:--filter\s+(@[\w\/-]+)\s+)?(?:exec\s+)?(\S+)/;
const NODE_SCRIPT_RE = /node\s+(Docs\/scripts\/\S+\.mjs)/;
const NPX_RE = /npx\s+(\S+)/;

export async function checkDocDrift(opts = {}) {
  const docsRoot = opts.docsRoot || DOCS_ROOT;
  const repoRoot = opts.repoRoot || findRepoRoot(opts);

  const findings = {
    categories: {
      '1_file_existence': [],
      '2_test_commands': [],
      '3_external_links': [],
    },
    summary: { total: 0 },
  };

  for await (const filePath of walkHtml(docsRoot)) {
    const relPath = relative(docsRoot, filePath);

    // Skip template files
    if (relPath.startsWith('templates/')) continue;

    const html = await readFile(filePath, 'utf-8');
    const { document } = parseHTML(html);

    const article = document.querySelector('article[data-doc-type="sprint-plan"]');
    if (!article) continue;

    // Skip sprint plans from templates directory or with placeholder epic
    const epic = article.getAttribute('data-epic');
    if (!epic || epic === 'EPIC_NAME') continue;

    checkFileExistence(document, relPath, repoRoot, findings);
    checkTestCommands(document, relPath, repoRoot, findings);
    checkExternalLinks(document, relPath, filePath, docsRoot, repoRoot, findings);
  }

  // Resolve async checks
  await resolveFileChecks(findings, repoRoot);
  await resolveTestCommands(findings, repoRoot);
  await resolveExternalLinks(findings, docsRoot);

  findings.summary.total =
    findings.categories['1_file_existence'].length +
    findings.categories['2_test_commands'].length +
    findings.categories['3_external_links'].length;

  return findings;
}

function checkFileExistence(document, relPath, repoRoot, findings) {
  const taskItems = document.querySelectorAll('li[data-task-id]');
  for (const li of taskItems) {
    const dataEl = li.querySelector('data[data-files]');
    if (!dataEl) continue;

    const filesStr = dataEl.getAttribute('data-files') || '';
    if (!filesStr.trim()) continue;

    const paths = filesStr.trim().split(/\s+/);
    for (const p of paths) {
      if (!p) continue;
      const full = resolve(repoRoot, p);
      findings.categories['1_file_existence'].push({
        doc: relPath,
        task_id: li.getAttribute('data-task-id'),
        path: p,
        status: 'checking',
      });
    }
  }
}

async function resolveFileChecks(findings, repoRoot) {
  const cat1 = findings.categories['1_file_existence'];
  const resolved = [];
  for (const f of cat1) {
    // Skip glob patterns — can't stat those
    if (f.path.includes('*') || f.path.includes('?')) continue;

    const full = resolve(repoRoot, f.path);
    f.resolved = full;
    f.status = (await fileExists(full)) ? 'exists' : 'missing';
    if (f.status !== 'exists') resolved.push(f);
  }
  findings.categories['1_file_existence'] = resolved;
}

function checkTestCommands(document, relPath, repoRoot, findings) {
  const verifSection = document.getElementById('verification');
  if (!verifSection) return;

  const codes = verifSection.querySelectorAll('code');
  for (const code of codes) {
    const text = code.textContent.trim();
    if (!text) continue;

    // Only process commands, not inline file paths
    if (/^(pnpm|npm|yarn|bun|npx|node)\s/.test(text)) {
      findings.categories['2_test_commands'].push({
        doc: relPath,
        command: text,
        status: 'pending_validation',
      });
    }
  }
}

async function resolveTestCommands(findings, repoRoot) {
  const cat2 = findings.categories['2_test_commands'];
  const resolved = [];
  for (const f of cat2) {
    const text = f.command;

    // pnpm --filter @scope/name <script>
    if (text.startsWith('pnpm')) {
      const filterMatch = text.match(/--filter\s+(@[\w\/-]+)/);
      if (filterMatch) {
        const pkgName = filterMatch[1];
        let scriptPart = text.replace(/pnpm\s+--filter\s+@[\w\/-]+\s+/, '');
        if (scriptPart.startsWith('exec ')) continue;
        const scriptMatch = scriptPart.match(/^(\S+)/);
        const scriptName = scriptMatch ? scriptMatch[1] : null;
        const pkgDir = await findPackageDir(repoRoot, pkgName);
        if (!pkgDir) {
          resolved.push({ ...f, status: 'package_not_found', detail: `Package '${pkgName}' does not exist in apps/ or packages/` });
          continue;
        }
        if (scriptName && !isCommonScript(scriptName)) {
          const result = await checkScriptExists(join(pkgDir, 'package.json'), scriptName);
          if (result) { resolved.push(result); continue; }
        }
        continue;
      }
      // pnpm <script> (no filter — check root package.json)
      let scriptPart = text.replace(/^pnpm\s+/, '');
      if (scriptPart.startsWith('exec ')) continue;
      const scriptMatch = scriptPart.match(/^(\S+)/);
      const scriptName = scriptMatch ? scriptMatch[1] : null;
      if (scriptName && !isCommonScript(scriptName)) {
        const pkgDir = await findRootPackageDir(repoRoot);
        if (pkgDir) {
          const result = await checkScriptExists(join(pkgDir, 'package.json'), scriptName);
          if (result) { resolved.push(result); continue; }
        }
      }
      continue;
    }

    // npm run <script>
    if (text.startsWith('npm')) {
      const parts = text.split(/\s+/);
      const runIdx = parts.indexOf('run');
      const scriptName = runIdx !== -1 && parts[runIdx + 1] ? parts[runIdx + 1] : null;
      if (scriptName && !isCommonScript(scriptName)) {
        const pkgDir = await findRootPackageDir(repoRoot);
        if (pkgDir) {
          const result = await checkScriptExists(join(pkgDir, 'package.json'), scriptName);
          if (result) { resolved.push(result); continue; }
        }
      }
      continue;
    }

    // yarn <script>
    if (text.startsWith('yarn')) {
      const parts = text.split(/\s+/);
      const scriptName = parts[1];
      if (scriptName && !isCommonScript(scriptName) && scriptName !== 'run' && !scriptName.startsWith('--')) {
        const pkgDir = await findRootPackageDir(repoRoot);
        if (pkgDir) {
          const result = await checkScriptExists(join(pkgDir, 'package.json'), scriptName);
          if (result) { resolved.push(result); continue; }
        }
      }
      continue;
    }

    // bun run <script>
    if (text.startsWith('bun')) {
      const parts = text.split(/\s+/);
      const runIdx = parts.indexOf('run');
      const scriptName = runIdx !== -1 && parts[runIdx + 1] ? parts[runIdx + 1] : null;
      if (scriptName && !isCommonScript(scriptName)) {
        const pkgDir = await findRootPackageDir(repoRoot);
        if (pkgDir) {
          const result = await checkScriptExists(join(pkgDir, 'package.json'), scriptName);
          if (result) { resolved.push(result); continue; }
        }
      }
      continue;
    }

    // node Docs/scripts/<name>.mjs
    if (text.startsWith('node')) {
      const m = text.match(/node\s+(Docs\/scripts\/[^\s]+\.mjs)/);
      if (m) {
        const scriptPath = join(repoRoot, m[1]);
        if (!(await fileExists(scriptPath))) {
          resolved.push({ ...f, status: 'script_not_found', detail: `Script '${m[1]}' does not exist` });
          continue;
        }
      }
      continue;
    }

    // npx — skip (can't statically validate)
    if (text.startsWith('npx')) continue;
  }
  findings.categories['2_test_commands'] = resolved;
}

function isCommonScript(name) {
  return ['test', 'build', 'typecheck', 'dev', 'start', 'exec', 'lint', 'serve'].includes(name);
}

async function checkScriptExists(pkgJsonPath, scriptName) {
  try {
    const pkgJson = JSON.parse(await readFile(pkgJsonPath, 'utf-8'));
    if (!pkgJson.scripts || !pkgJson.scripts[scriptName]) {
      return { status: 'script_not_found', detail: `Script '${scriptName}' not defined in package.json` };
    }
  } catch {
    return { status: 'package_json_read_error', detail: `Cannot read ${pkgJsonPath}` };
  }
  return null;
}

function checkExternalLinks(document, relPath, docPath, docsRoot, repoRoot, findings) {
  const links = document.querySelectorAll('a[href]');
  for (const a of links) {
    const href = a.getAttribute('href');
    if (!href || href.startsWith('http://') || href.startsWith('https://') || href.startsWith('#')) continue;

    const targetAbs = resolve(docsRoot, dirname(relPath), href);
    // Resolve the canonical path
    const normalized = resolve(targetAbs);

    // Skip if target is within Docs/
    if (normalized.startsWith(docsRoot)) continue;

    // Target is outside Docs/, check if it exists
    findings.categories['3_external_links'].push({
      doc: relPath,
      href,
      resolved: normalized,
      status: 'checking',
    });
  }
}

async function resolveExternalLinks(findings, docsRoot) {
  const cat3 = findings.categories['3_external_links'];
  for (const f of cat3) {
    f.status = (await fileExists(f.resolved)) ? 'exists' : 'broken';
  }
  findings.categories['3_external_links'] = cat3.filter(f => f.status !== 'exists');
}

export function buildHtmlAudit(findings, opts = {}) {
  const now = new Date().toISOString().split('T')[0];
  const total = findings.summary.total;

  const cat1 = findings.categories['1_file_existence'];
  const cat2 = findings.categories['2_test_commands'];
  const cat3 = findings.categories['3_external_links'];

  function buildTable(rows, headers) {
    if (rows.length === 0) return '<p>No findings.</p>';
    let html = '<table><thead><tr>';
    for (const h of headers) html += `<th>${h}</th>`;
    html += '</tr></thead><tbody>';
    for (const r of rows) {
      html += '<tr>';
      for (const h of headers) {
        const key = h.toLowerCase().replace(/\s+/g, '_');
        html += `<td>${escapeHtml(String(r[key] || ''))}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    return html;
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Doc Drift Audit — ${now}</title>
<link rel="stylesheet" href="../css/docs-base.css">
</head>
<body>

  <article data-doc-type="audit" data-epic="${opts.epic || 'audits'}" data-status="active">

<header>
  <h1>Doc Drift Audit — ${now}</h1>
  <div class="meta"><span>Total findings: ${total}</span></div>
</header>

<section id="summary">
  <h2>Summary</h2>
  <p>Automated drift detection run on ${now}. Checked three categories:</p>
  <ul>
    <li><strong>Category 1 — File Existence:</strong> ${cat1.length} findings</li>
    <li><strong>Category 2 — Test Commands:</strong> ${cat2.length} findings</li>
    <li><strong>Category 3 — External Links:</strong> ${cat3.length} findings</li>
  </ul>
</section>

<section id="categories">
  <h2>Category 1: File Existence</h2>
  ${buildTable(cat1, ['Doc', 'Task ID', 'Path', 'Status'])}

  <h2>Category 2: Test Commands</h2>
  ${buildTable(cat2, ['Doc', 'Command', 'Status', 'Detail'])}

  <h2>Category 3: External Links</h2>
  ${buildTable(cat3, ['Doc', 'Href', 'Resolved', 'Status'])}
</section>

<section id="recommendations">
  <h2>Recommendations</h2>
  ${total === 0
    ? '<p>All checks passed. No drift detected.</p>'
    : `<p>Review the ${total} finding(s) above. Update affected sprint plans to reflect current file locations, test commands, and cross-document links.</p>`
  }
</section>

<nav class="breadcrumb" aria-label="Breadcrumb">
  <a href="../index.html">Docs Home</a>
  <span aria-hidden="true"> / </span>
  <span aria-current="page">Doc Drift Audit — ${now}</span>
</nav>

</article>

</body>
</html>
`;
}

function printFindings(findings) {
  console.log(JSON.stringify(findings, null, 2));
}

// CLI
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('check-doc-drift.mjs')) {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--audit-output' && i + 1 < args.length) opts.auditOutput = args[++i];
    else if (args[i] === '--repo-root' && i + 1 < args.length) opts.repoRoot = args[++i];
  }

  const findings = await checkDocDrift(opts);

  printFindings(findings);

  if (opts.auditOutput) {
    const html = buildHtmlAudit(findings, opts);
    await mkdir(dirname(resolve(opts.auditOutput)), { recursive: true });
    await writeFile(resolve(opts.auditOutput), html, 'utf-8');
    console.log(`\nAudit written to: ${opts.auditOutput}`);
  }

  process.exit(findings.summary.total > 0 ? 1 : 0);
}
