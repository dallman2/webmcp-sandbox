#!/usr/bin/env node
// populate-data-files.mjs — Populate data-files attributes on task items in sprint plans.
// Usage: node Docs/scripts/populate-data-files.mjs [--dry-run] [--epic <name>]

import { parseHTML } from 'linkedom';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readdir } from 'node:fs/promises';

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

const KNOWN_DIR_PREFIXES = /^(apps|packages|Docs|src|scripts|k8s|tests?|config)\//;

const KNOWN_CONFIG_FILES = /^(pnpm-workspace\.yaml|pnpm-lock\.yaml|package\.json|tsconfig(\.[a-z]+)?\.json|vitest\.config\.[a-z]+|vite\.config\.[a-z]+|Dockerfile(\.\w+)?|\.dockerignore|\.gitignore|\.env(\.\w+)?|\.env\.example|eslint\.config\.[a-z]+|\.eslintrc(\.[a-z]+)?|\.prettierrc(\.[a-z]+)?|Makefile|README\.md|CHANGELOG\.md|AGENTS\.md|DESIGN\.md|\.nvmrc|\.editorconfig|\.npmrc|\.node-version|nginx\.conf)$/i;

const KNOWN_EXTENSIONS = /\.(?:tsx?|jsx?|mjs|cjs|json|ya?ml|html?|css|scss|less|md|sql|toml|env|conf|txt|csv|svg|png|jpe?g|gif|webp|ico|mp[34]|wav|ogg|webm|otf|ttf|woff2?|xml|lock|prisma|graphql|gql|proto|hbs|ejs|pug|haml)$/;

const BARE_PATH_REGEX = /(?:apps|packages|Docs|src|scripts|k8s|tests?)\/[\w\/\-.]+\.\w{1,6}/g;

const NON_PATH_SET = new Set([
  'openai', 'express', 'react', 'tldraw', 'linkedom', 'mediasoup',
  'vitest', 'supertest', 'passport', 'drizzle', 'redis', 'postgres',
  'automerge', 'three', 'pnpm', 'docker', 'kubernetes', 'kubernetes',
  'loki', 'grafana', 'tempo', 'mimir', 'node', 'typescript',
  'pino', 'winston', 'baseten', 'assemblyai', 'gemini', 'claude',
  'opencode', 'tailwind', 'vite', 'eslint', 'medplum', 'nginx',
  'ffmpeg', 'opus', 'assemblyai', 'webrtc', 'mcp',
  'create_node', 'update_node', 'link_nodes', 'group_elements',
  'createRoot', 'StrictMode', 'BrowserRouter', 'IntersectionObserver',
  'useScrollEngine', 'useFrame', 'useThree', 'Canvas',
  'useTranscription', 'Producer', 'Consumer', 'Worker', 'Router',
  'TranscriptionManager', 'TranscriptionService', 'AssemblyAIProvider',
  'AudioContext', 'MediaStream', 'MediaRecorder', 'EventSource',
  'getUserMedia', 'navigator', 'window', 'document',
  'try_files', 'proxy_pass', 'uri', 'index',
  '.module.css', 'theme.css', 'Header.css', 'Button.module.css', 'Dialog.module.css',
]);

function looksLikeFilePath(text) {
  const trimmed = text.trim();
  if (!trimmed) return false;

  if (trimmed.startsWith('@')) return false;
  if (trimmed.startsWith('/')) return false;
  if (trimmed.startsWith('$')) return false;
  if (trimmed.includes(':')) return false;
  if (/^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s/.test(trimmed)) return false;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return false;

  if (NON_PATH_SET.has(trimmed)) return false;

  if (trimmed.length < 3) return false;

  if (KNOWN_DIR_PREFIXES.test(trimmed)) return true;

  if (KNOWN_EXTENSIONS.test(trimmed) && !/^[a-z]+-[a-z]/.test(trimmed)) {
    return true;
  }

  if (KNOWN_CONFIG_FILES.test(trimmed)) return true;

  return false;
}

function extractCodePaths(li) {
  const codes = li.querySelectorAll('code');
  const paths = new Set();
  for (const code of codes) {
    const text = code.textContent.trim();
    if (looksLikeFilePath(text)) {
      paths.add(text);
    }
  }
  return [...paths];
}

function extractBarePaths(text) {
  const paths = new Set();

  let match;
  BARE_PATH_REGEX.lastIndex = 0;
  while ((match = BARE_PATH_REGEX.exec(text)) !== null) {
    const p = match[0];
    if (looksLikeFilePath(p)) paths.add(p);
  }

  KNOWN_CONFIG_FILES.lastIndex = 0;
  while ((match = KNOWN_CONFIG_FILES.exec(text)) !== null) {
    const p = match[0];
    if (looksLikeFilePath(p)) paths.add(p);
  }

  return [...paths];
}

export async function populateDataFiles(opts = {}) {
  const docsRoot = opts.docsRoot || DOCS_ROOT;
  const dryRun = opts.dryRun || false;
  const epicFilter = opts.epic || null;

  const stats = {
    sprintsScanned: 0,
    tasksProcessed: 0,
    tasksPopulated: 0,
    tasksAlreadyHadData: 0,
    tasksNoPathsFound: 0,
    sprintsModified: 0,
    bySprint: {},
  };

  for await (const filePath of walkHtml(docsRoot)) {
    const html = await readFile(filePath, 'utf-8');
    const { document } = parseHTML(html);

    const article = document.querySelector('article[data-doc-type="sprint-plan"]');
    if (!article) continue;

    const epic = article.getAttribute('data-epic');
    if (!epic || epic === 'EPIC_NAME') continue;
    if (epicFilter && epic !== epicFilter) continue;

    const phase = article.getAttribute('data-phase');
    const sprint = article.getAttribute('data-sprint');
    const sprintKey = `${epic || 'unknown'}/phase-${phase}/sprint-${sprint}`;

    stats.sprintsScanned++;
    let sprintTasksPopulated = 0;
    let sprintTaskCount = 0;

    const taskItems = document.querySelectorAll('li[data-task-id]');
    for (const li of taskItems) {
      sprintTaskCount++;
      stats.tasksProcessed++;

      const existingData = li.querySelector('data[data-files]');
      if (existingData && existingData.getAttribute('data-files')?.trim()) {
        stats.tasksAlreadyHadData++;
        continue;
      }

      const codePaths = extractCodePaths(li);
      const textContent = li.textContent || '';
      const barePaths = extractBarePaths(textContent);

      const allPaths = [...new Set([...codePaths, ...barePaths])]
        .map(p => p.replace(/\/$/, ''))
        .filter(Boolean)
        .sort();

      if (allPaths.length === 0) {
        stats.tasksNoPathsFound++;
        continue;
      }

      const pathStr = allPaths.join(' ');

      if (existingData) {
        existingData.setAttribute('data-files', pathStr);
      } else {
        const dataEl = document.createElement('data');
        dataEl.setAttribute('data-files', pathStr);

        const strong = li.querySelector('strong');
        if (strong && strong.parentNode === li) {
          li.insertBefore(dataEl, strong.nextSibling);
        } else {
          li.appendChild(dataEl);
        }
      }

      stats.tasksPopulated++;
      sprintTasksPopulated++;
    }

    stats.bySprint[sprintKey] = {
      tasks: sprintTaskCount,
      populated: sprintTasksPopulated,
    };

    if (sprintTasksPopulated > 0) {
      stats.sprintsModified++;
    }

    if (!dryRun && sprintTasksPopulated > 0) {
      const serializer = document.constructor.prototype.toString;
      let output = serializer ? serializer.call(document) : document.documentElement.outerHTML;
      if (!output.startsWith('<!DOCTYPE')) {
        output = '<!DOCTYPE html>\n' + output;
      }
      await writeFile(filePath, output, 'utf-8');
    }
  }

  return stats;
}

function printReport(stats, dryRun) {
  const prefix = dryRun ? '[DRY RUN] ' : '';
  console.log(`${prefix}Scanned ${stats.sprintsScanned} sprint plans`);
  console.log(`${prefix}Processed ${stats.tasksProcessed} task items`);
  console.log(`${prefix}Skipped ${stats.tasksAlreadyHadData} (already had data-files)`);
  console.log(`${prefix}Populated ${stats.tasksPopulated} task items`);
  console.log(`${prefix}No paths found for ${stats.tasksNoPathsFound} task items`);
  console.log(`${prefix}Modified ${stats.sprintsModified} sprint files`);

  if (Object.keys(stats.bySprint).length > 0) {
    console.log(`\n${prefix}Per-sprint breakdown:`);
    for (const [key, s] of Object.entries(stats.bySprint)) {
      const flag = s.populated > 0 ? (dryRun ? ' [would modify]' : ' [modified]') : '';
      console.log(`  ${key}: ${s.populated}/${s.tasks} tasks populated${flag}`);
    }
  }
}

// CLI
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('populate-data-files.mjs')) {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') opts.dryRun = true;
    else if (args[i] === '--epic' && i + 1 < args.length) opts.epic = args[++i];
  }

  const stats = await populateDataFiles(opts);
  printReport(stats, opts.dryRun);
}
