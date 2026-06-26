#!/usr/bin/env node
// convert-md-to-html.mjs — Convert a markdown file to semantically valid HTML.
// Usage: node Docs/scripts/convert-md-to-html.mjs <input.md> [output.html] [--doc-type <type>]

import { parseHTML } from 'linkedom';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, relative, dirname, basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import MarkdownIt from 'markdown-it';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DOCS_ROOT = resolve(__dirname, '..');

const md = new MarkdownIt({ html: false, linkify: true, typographer: true });

function cssPath(depthFromDocs) {
  if (depthFromDocs === 0) return 'css/docs-base.css';
  const up = '../'.repeat(depthFromDocs);
  return `${up}css/docs-base.css`;
}

function depthFromDocs(filePath, docsRoot) {
  const rel = relative(docsRoot, filePath);
  const parts = rel.split('/');
  return parts.length - 1;
}

function detectDocType(filePath, docsRoot) {
  const rel = relative(docsRoot, filePath);
  const dir = dirname(rel);
  const base = basename(rel);

  // Filename-based detection (takes precedence over directory)
  if (base === 'README.md') return 'sprint-plan';
  if (base === 'epic-overview.md') return 'epic-overview';
  if (base === 'epic-backlog.md') return 'epic-backlog';
  if (base === 'risk-registry.md') return 'risk-registry';
  if (base === 'RESIDUAL.md') return 'residual';
  if (base.includes('retrospective')) return 'retrospective';

  // Supplementary sprint doc (non-README in sprint dir)
  if (dir.match(/sprint-/) && !base.startsWith('README')) {
    return 'reference';
  }

  // Directory-based fallback
  if (dir.startsWith('audits/') || dir === 'audits') return 'audit';
  if (dir.startsWith('references/') || dir === 'references') return 'reference';
  if (dir.startsWith('architecture/') || dir === 'architecture') return 'reference';

  return 'reference';
}

function extractMetadata(filePath, docsRoot, docType) {
  const rel = relative(docsRoot, filePath);
  const parts = rel.split('/');

  const meta = { epic: null, phase: null, sprint: null };

  if (parts[0] === 'epics' && parts.length > 1) {
    meta.epic = parts[1];

    const phaseIdx = parts.findIndex((p) => /^phase-\d/.test(p));
    if (phaseIdx !== -1) {
      meta.phase = parts[phaseIdx].replace('phase-', '');
    }

    const sprintIdx = parts.findIndex((p) => /^sprint-/.test(p));
    if (sprintIdx !== -1) {
      const sprintMatch = parts[sprintIdx].match(/^sprint-([\d.]+)/);
      if (sprintMatch) meta.sprint = sprintMatch[1];
    }
  } else {
    // Non-epic docs: use the top-level directory as contextual epic
    if (parts[0] && parts[0] !== '.') {
      meta.epic = parts[0];
    }
  }

  return meta;
}

function sprintNameFromDir(filePath, docsRoot) {
  const rel = relative(docsRoot, filePath);
  const parts = rel.split('/');
  const sprintIdx = parts.findIndex((p) => /^sprint-/.test(p));
  if (sprintIdx === -1) return null;
  const dirName = parts[sprintIdx];
  return dirName
    .replace(/^sprint-[\d.]+-?/, '')
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function buildBreadcrumb(meta, docType, sprintTitle, depth) {
  const crumbs = [];

  // Non-epic docs: link to root index
  const isEpicDoc = meta.epic && meta.epic !== 'architecture' && meta.epic !== 'audits' && meta.epic !== 'references';

  if (isEpicDoc) {
    const upToEpic = '../'.repeat(Math.max(0, depth - 2));
    crumbs.push({ label: meta.epic, href: `${upToEpic}index.html` });
  } else {
    const upToRoot = '../'.repeat(depth);
    crumbs.push({ label: 'Docs Home', href: `${upToRoot}index.html` });
  }

  if (meta.phase && meta.sprint) {
    crumbs.push({ label: `Phase ${meta.phase}`, href: '../index.html' });
  } else if (meta.phase && !meta.sprint && docType === 'residual') {
    crumbs.push({ label: `Phase ${meta.phase}`, href: '../index.html' });
  }

  const label = sprintTitle || docType.replace('-', ' ');
  crumbs.push({ label, current: true });

  const links = crumbs
    .map((c) => {
      if (c.current) return `<span aria-current="page">${c.label}</span>`;
      return `<a href="${c.href}">${c.label}</a>`;
    })
    .join('\n  <span aria-hidden="true"> / </span>\n  ');

  return `<nav class="breadcrumb" aria-label="Breadcrumb">\n  ${links}\n</nav>`;
}

function processCheckboxes(document) {
  const lis = document.querySelectorAll('li');
  for (const li of lis) {
    const text = li.textContent || '';
    const match = text.match(/^\s*\[(x| )\]\s*/i);
    if (!match) continue;

    const isChecked = match[1].toLowerCase() === 'x';
    const prefixLen = match[0].length;

    // Remove the [x] / [ ] prefix from the first text node
    const walker = document.createTreeWalker(li, 4 /* NodeFilter.SHOW_TEXT */);
    const firstText = walker.nextNode();
    if (firstText && firstText.textContent) {
      const stripped = firstText.textContent.slice(prefixLen);
      firstText.textContent = stripped;
      // Remove the text node if it became empty
      if (firstText.textContent === '' && firstText.parentNode) {
        firstText.parentNode.removeChild(firstText);
      }
    }

    // Prepend checkbox input
    const checkbox = document.createElement('input');
    checkbox.setAttribute('type', 'checkbox');
    if (isChecked) checkbox.setAttribute('checked', '');

    const first = li.firstChild;
    li.insertBefore(checkbox, first);
    if (first) {
      li.insertBefore(document.createTextNode(' '), first);
    }
  }
}

function deriveTaskIds(document) {
  let currentSectionNum = null;
  let taskCounter = {};

  const body = document.body;
  if (!body) return;

  const walker = document.createTreeWalker(body, 1 /* NodeFilter.SHOW_ELEMENT */);
  const nodes = [];
  let node;
  while ((node = walker.nextNode())) {
    nodes.push(node);
  }

  for (const el of nodes) {
    const tag = el.tagName;
    const text = (el.textContent || '').trim();

    if (tag === 'H2' || tag === 'H3' || tag === 'H4') {
      const numMatch = text.match(/^(\d+)\.\s/);
      if (numMatch) {
        currentSectionNum = parseInt(numMatch[1], 10);
        taskCounter[currentSectionNum] = 0;
      } else if (tag === 'H2') {
        // Reset section tracking on non-numbered h2 headings
        currentSectionNum = null;
      }
    }

    if (tag === 'LI') {
      const checkbox = el.querySelector('input[type="checkbox"]');
      if (checkbox && currentSectionNum !== null) {
        taskCounter[currentSectionNum] = (taskCounter[currentSectionNum] || 0) + 1;
        const taskId = `${currentSectionNum}.${taskCounter[currentSectionNum]}`;
        el.setAttribute('data-task-id', taskId);
      }
    }
  }
}

function stripFirstH1(document) {
  const body = document.body;
  if (!body) return null;

  const firstH1 = body.querySelector('h1');
  if (!firstH1) return null;

  const title = firstH1.textContent.trim();
  firstH1.remove();
  return title;
}

function buildSprintPlanTemplate(title, meta, bodyContent, cssHref, breadcrumbHtml) {
  let cleanTitle = title.replace(/^Sprint\s+[\d.]+\s*:\s*/i, '').trim();
  const sprintLabel = meta.sprint ? `Sprint ${meta.sprint}` : '';
  const fullTitle = cleanTitle ? `${sprintLabel}: ${cleanTitle}` : sprintLabel;
  const dependsOn = meta.phase === '0' ? 'Phase 0' : `Phase ${meta.phase} Sprint 0`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${fullTitle} — Phase ${meta.phase} — ${meta.epic}</title>
<link rel="stylesheet" href="${cssHref}">
</head>
<body>

<article data-doc-type="sprint-plan" data-epic="${meta.epic || ''}" data-phase="${meta.phase || ''}" data-sprint="${meta.sprint || ''}" data-status="active">

<header>
  <h1>${fullTitle || sprintLabel || 'Sprint'}</h1>
  <div class="meta">
    <span>Phase: ${meta.phase || ''}</span>
    <span>Sprint: ${meta.sprint || ''}</span>
    <span>Depends on: ${dependsOn}</span>
  </div>
</header>

${bodyContent}

${breadcrumbHtml}

</article>

</body>
</html>
`;
}

function buildGenericTemplate(docType, title, meta, bodyContent, cssHref, breadcrumbHtml) {
  const attrs = [`data-doc-type="${docType}"`];
  if (meta.epic) attrs.push(`data-epic="${meta.epic}"`);
  if (meta.phase) attrs.push(`data-phase="${meta.phase}"`);
  if (meta.sprint) attrs.push(`data-sprint="${meta.sprint}"`);
  attrs.push('data-status="active"');

  let metaHtml = '';
  if (docType === 'epic-overview') {
    metaHtml = `<div class="meta">
    <span>Epic: ${meta.epic || ''}</span>
  </div>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} — ${meta.epic || 'Docs'}</title>
<link rel="stylesheet" href="${cssHref}">
</head>
<body>

<article ${attrs.join(' ')}>

<header>
  <h1>${title}</h1>
  ${metaHtml}
</header>

${bodyContent}

${breadcrumbHtml}

</article>

</body>
</html>
`;
}

function determineOutputStatus(document) {
  const article = document.querySelector('article');
  if (!article) return 'active';

  const docType = article.getAttribute('data-doc-type');
  if (docType !== 'sprint-plan') return 'active';

  const checkboxes = document.querySelectorAll('li[data-task-id] input[type="checkbox"]');
  if (checkboxes.length === 0) return 'active';

  let allChecked = true;
  for (const cb of checkboxes) {
    if (!cb.hasAttribute('checked')) {
      allChecked = false;
      break;
    }
  }

  return allChecked ? 'completed' : 'active';
}

function fixMarkdownLinks(document, inputPath, docsRoot) {
  const links = document.querySelectorAll('a[href]');
  for (const a of links) {
    const href = a.getAttribute('href');
    if (!href || href.startsWith('http://') || href.startsWith('https://')) continue;
    // Replace .md references with .html (handles .md, .md#, .md? etc.)
    const fixed = href.replace(/\.md\b/g, '.html');
    if (fixed !== href) {
      a.setAttribute('href', fixed);
    }
  }
}

function fixOutputStatus(html, status) {
  return html.replace(/data-status="active"/, `data-status="${status}"`);
}

const SECTION_ID_MAP = {
  'objective': 'objective',
  'rationale': 'rationale',
  'rationale-context': 'rationale-and-context',
  'rationale-and-context': 'rationale-and-context',
  'scope': 'scope',
  'in-scope': 'in-scope',
  'out-of-scope': 'out-of-scope',
  'tech-stack': 'tech-stack',
  'execution-plan': 'execution-plan',
  'tasks': 'execution-plan',
  'execution': 'execution-plan',
  'verification': 'verification',
  'verification-acceptance-criteria': 'verification',
  'verification-and-acceptance-criteria': 'verification',
  'acceptance-criteria': 'verification',
  'vision': 'vision',
  'phase-structure': 'phase-structure',
  'summary': 'summary',
  'recommendations': 'recommendations',
  'risks': 'risks',
  'backlog': 'backlog',
  'overview': 'overview',
  'categories': 'categories',
};

function normalizeHeadingId(text) {
  const cleaned = text
    .toLowerCase()
    .replace(/&amp;/g, 'and')
    .replace(/&/g, 'and')
    .replace(/^[\d.]+\s*/, '')  // strip leading numbers like "1. ", "2.3.1 "
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  // Check the full cleaned text against the map
  if (SECTION_ID_MAP[cleaned]) return SECTION_ID_MAP[cleaned];

  // Try partial matches for compound names
  for (const [key, value] of Object.entries(SECTION_ID_MAP)) {
    if (cleaned.includes(key) && key.length > 3) return value;
  }

  return cleaned;
}

function ensureSectionIds(document) {
  const headings = document.body.querySelectorAll('h2, h3, h4');
  for (const h of headings) {
    if (!h.id) {
      const text = (h.textContent || '').trim();
      const id = normalizeHeadingId(text);
      if (id) h.setAttribute('id', id);
    }
  }
}

function wrapSections(document) {
  const body = document.body;
  if (!body) return;

  const h2s = body.querySelectorAll('h2');
  for (const h2 of h2s) {
    // Skip if the h2 is already inside a section (e.g., in a template-provided section)
    if (h2.closest('section')) continue;

    const section = document.createElement('section');
    const id = h2.getAttribute('id');
    if (id) section.setAttribute('id', id);

    // Collect siblings from this h2 until the next h2 or end
    let next = h2;
    h2.parentNode.insertBefore(section, h2);
    section.appendChild(h2);

    next = section.nextSibling;
    while (next && next !== h2) {
      const current = next;
      next = current.nextSibling;

      // Stop before the next h2, or before the breadcrumb nav, or before another section
      if (current.nodeType === 1 /* ELEMENT_NODE */) {
        const el = current;
        if (el.tagName === 'H2' || el.tagName === 'SECTION' || (el.tagName === 'NAV' && el.classList.contains('breadcrumb'))) {
          break;
        }
      }

      section.appendChild(current);
    }
  }
}

/**
 * Convert a markdown file to HTML.
 * @param {string} inputPath - absolute path to the .md file
 * @param {string} outputPath - absolute path for the output .html file
 * @param {object} opts - { docsRoot?, docType? }
 * @returns {object} { outputPath, docType, meta, title }
 */
export async function convertMdToHtml(inputPath, outputPath, opts = {}) {
  const docsRoot = opts.docsRoot || DOCS_ROOT;
  const markdown = await readFile(inputPath, 'utf-8');

  const docType = opts.docType || detectDocType(inputPath, docsRoot);
  const meta = extractMetadata(inputPath, docsRoot, docType);

  // Render markdown to HTML
  let bodyHtml = md.render(markdown);

  // Parse with linkedom for post-processing
  const wrapperDoc = parseHTML(`<html><body>${bodyHtml}</body></html>`).document;
  const body = wrapperDoc.body;

  // Strip first h1 (old document title) and capture its text
  let title = stripFirstH1(wrapperDoc);
  if (!title) {
    title = sprintNameFromDir(inputPath, docsRoot) || basename(inputPath, '.md');
  }

  // Process checkboxes
  processCheckboxes(wrapperDoc);

  // Derive task IDs from section headers
  deriveTaskIds(wrapperDoc);

  // Add section IDs from heading text
  ensureSectionIds(wrapperDoc);

  // Fix .md links pointing to converted files → .html
  fixMarkdownLinks(wrapperDoc, inputPath, docsRoot);

  // Wrap h2 groups in <section> elements
  wrapSections(wrapperDoc);

  // Extract the body content (without <body> wrapper)
  const bodyContent = body.innerHTML.trim();

  // Compute CSS path
  const depth = depthFromDocs(outputPath, docsRoot);
  const cssHref = cssPath(depth);

  // Build breadcrumb
  const breadcrumbHtml = buildBreadcrumb(meta, docType, title, depth);

  // Build the full HTML document
  let html;
  if (docType === 'sprint-plan') {
    html = buildSprintPlanTemplate(title, meta, bodyContent, cssHref, breadcrumbHtml);
  } else {
    html = buildGenericTemplate(docType, title, meta, bodyContent, cssHref, breadcrumbHtml);
  }

  // Fix status to match checkbox state
  const outputDoc = parseHTML(html).document;
  const status = determineOutputStatus(outputDoc);
  html = fixOutputStatus(html, status);

  // Ensure output directory exists
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html, 'utf-8');

  return { outputPath, docType, meta, title, status };
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  const cliOpts = {};

  let inputPath = null;
  let outputPath = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--doc-type' && i + 1 < args.length) {
      cliOpts.docType = args[++i];
    } else if (!inputPath) {
      inputPath = resolve(args[i]);
    } else if (!outputPath) {
      outputPath = resolve(args[i]);
    }
  }

  if (!inputPath) {
    console.error('Usage: node Docs/scripts/convert-md-to-html.mjs <input.md> [output.html] [--doc-type <type>]');
    process.exit(1);
  }

  if (!outputPath) {
    outputPath = inputPath.replace(/\.md$/, '.html');
    // README.md in sprint dir → sprint.html
    if (outputPath.endsWith('/README.html') && detectDocType(inputPath, DOCS_ROOT) === 'sprint-plan') {
      outputPath = outputPath.replace(/\/README\.html$/, '/sprint.html');
    }
  }

  const result = await convertMdToHtml(inputPath, outputPath, cliOpts);
  console.log(`Converted: ${relative(process.cwd(), inputPath)} → ${relative(process.cwd(), result.outputPath)}`);
  console.log(`  Doc type: ${result.docType}`);
  console.log(`  Status: ${result.status}`);
  if (result.meta.epic) console.log(`  Epic: ${result.meta.epic}`);
  if (result.meta.phase) console.log(`  Phase: ${result.meta.phase}`);
  if (result.meta.sprint) console.log(`  Sprint: ${result.meta.sprint}`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('convert-md-to-html.mjs')) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
