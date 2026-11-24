// Sync Confluence pages into the decision registry.
// Extraction is deterministic (see parse.js): no LLM calls, no cost, and every
// field is copied from the page, so the registry cannot contain invented decisions.

import { readPage } from './confluence.js';
import { parseDecisions } from './parse.js';
import { getPageRecord, replacePageDecisions } from './store.js';

/** Parse one page into decision records with page metadata attached. */
export function extractDecisions(page) {
  return parseDecisions(page).map((d) => ({
    ...d,
    pageId: page.id,
    pageTitle: page.title,
    pageUrl: page.url,
    extractedAt: new Date().toISOString(),
  }));
}

/**
 * Sync one page into the registry. Skips pages whose version hasn't changed
 * since the last sync (unless force=true).
 */
export async function syncPage(pageId, { force = false } = {}) {
  const page = await readPage(pageId);
  const previous = await getPageRecord(pageId);
  if (!force && previous && previous.version === page.version) {
    return { pageId, title: page.title, skipped: true, count: previous.decisionIds.length };
  }
  const decisions = extractDecisions(page);
  await replacePageDecisions(page, decisions);
  return { pageId, title: page.title, skipped: false, count: decisions.length };
}
