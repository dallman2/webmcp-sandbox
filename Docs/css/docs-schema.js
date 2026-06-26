// docs-schema.js — Semantic schema for Caroline HTML documentation
// Used by validate-docs.mjs, query-open-tasks.mjs, and template tests.
// Works in both browser (as <script type="module">) and Node.js (with linkedom).
// Does NOT import any third-party modules — operates on plain DOM interfaces.

export const DOC_TYPES = {
  SPRINT_PLAN: 'sprint-plan',
  EPIC_OVERVIEW: 'epic-overview',
  EPIC_BACKLOG: 'epic-backlog',
  RISK_REGISTRY: 'risk-registry',
  AUDIT: 'audit',
  REFERENCE: 'reference',
  RETROSPECTIVE: 'retrospective',
  RESIDUAL: 'residual',
  PHASE_INDEX: 'phase-index',
  EPIC_INDEX: 'epic-index',
  ROOT_INDEX: 'root-index',
  PLAYBOOK: 'playbook',
  PLAYBOOK_INDEX: 'playbook-index',
};

export const STATUS_VALUES = ['active', 'completed', 'planned', 'blocked', 'backlog', 'draft'];

// Required data-* attributes on the root <article> element for each doc type
export const REQUIRED_ATTRS = {
  'sprint-plan': ['data-doc-type', 'data-epic', 'data-phase', 'data-sprint', 'data-status'],
  'epic-overview': ['data-doc-type', 'data-epic', 'data-status'],
  'epic-backlog': ['data-doc-type', 'data-epic', 'data-status'],
  'risk-registry': ['data-doc-type', 'data-epic', 'data-status'],
  'audit': ['data-doc-type', 'data-epic'],
  'reference': ['data-doc-type', 'data-epic'],
  'retrospective': ['data-doc-type', 'data-epic', 'data-phase', 'data-sprint', 'data-status'],
  'residual': ['data-doc-type', 'data-epic', 'data-phase', 'data-status'],
  'phase-index': ['data-doc-type', 'data-epic', 'data-phase', 'data-status'],
  'epic-index': ['data-doc-type', 'data-epic'],
  'root-index': ['data-doc-type'],
  'playbook': ['data-doc-type', 'data-playbook-name', 'data-status'],
  'playbook-index': ['data-doc-type', 'data-status'],
};

// Required <section id="..."> elements for each doc type
export const REQUIRED_SECTIONS = {
  'sprint-plan': ['objective', 'execution-plan', 'verification'],
  'epic-overview': ['vision', 'scope', 'phase-structure'],
  'epic-backlog': ['backlog'],
  'risk-registry': ['risks'],
  'audit': ['summary', 'recommendations'],
  'reference': [],
  'retrospective': [],
  'residual': ['objective', 'categories'],
  'phase-index': ['sprints'],
  'epic-index': [],
  'root-index': [],
  'playbook': ['objective', 'steps'],
  'playbook-index': [],
};

/**
 * Validates an <article> element against the semantic schema.
 * The element must have data-doc-type set.
 * Returns an array of violation strings (empty = valid).
 *
 * @param {Element} article — the root <article> element of a doc page
 * @returns {string[]}
 */
export function validateDocType(article) {
  /** @type {string[]} */
  const violations = [];

  const docType = article.getAttribute('data-doc-type');

  if (!docType) {
    violations.push('Missing data-doc-type attribute on <article>');
    return violations;
  }

  const knownTypes = Object.values(DOC_TYPES);
  if (!knownTypes.includes(docType)) {
    violations.push(`Unknown data-doc-type: "${docType}". Valid types: ${knownTypes.join(', ')}`);
    return violations;
  }

  // Check required attributes
  const requiredAttrs = REQUIRED_ATTRS[docType] || [];
  for (const attr of requiredAttrs) {
    const value = article.getAttribute(attr);
    if (value === null || value === '') {
      violations.push(`Missing required attribute: ${attr}`);
    }
  }

  // Check status value if present
  const status = article.getAttribute('data-status');
  if (status && !STATUS_VALUES.includes(status)) {
    violations.push(`Invalid data-status: "${status}". Must be one of: ${STATUS_VALUES.join(', ')}`);
  }

  // Check required sections
  const requiredSections = REQUIRED_SECTIONS[docType] || [];
  for (const sectionId of requiredSections) {
    const section = article.querySelector(`section[id="${sectionId}"]`);
    if (!section) {
      violations.push(`Missing required section: <section id="${sectionId}">`);
    }
  }

  // Sprint-plan specific: every li[data-task-id] must have a checkbox
  if (docType === 'sprint-plan') {
    const taskItems = article.querySelectorAll('li[data-task-id]');
    for (const li of taskItems) {
      const taskId = li.getAttribute('data-task-id');
      const checkbox = li.querySelector('input[type="checkbox"]');
      if (!checkbox) {
        violations.push(`Task li[data-task-id="${taskId}"] is missing <input type="checkbox">`);
      }
    }
  }

  return violations;
}

/**
 * Validates that the document has a breadcrumb <nav aria-label="Breadcrumb">
 * @param {Document|Element} doc — the document or root element
 * @returns {string[]}
 */
export function validateBreadcrumb(doc) {
  const nav = doc.querySelector('nav.breadcrumb[aria-label="Breadcrumb"]');
  if (!nav) {
    return ['Missing breadcrumb: <nav class="breadcrumb" aria-label="Breadcrumb">'];
  }
  return [];
}

/**
 * Convenience: parse an HTML string and validate it.
 * Requires a DOM parser (linkedom in Node, DOMParser in browser).
 *
 * @param {string} html   — full HTML document string
 * @param {object} parser — { parseHTML(html: string): Document }  (e.g. linkedom)
 * @returns {string[]}
 */
export function validateHtmlString(html, parser) {
  const doc = parser.parseHTML(html);
  const article = doc.querySelector('article[data-doc-type]');
  if (!article) {
    return ['No <article data-doc-type="..."> found in document'];
  }
  const violations = validateDocType(article);
  violations.push(...validateBreadcrumb(doc));
  return violations;
}
