// Confluence access: find decision pages and read their content.

import api, { route } from '@forge/api';
import { storageToText } from './text.js';

// A page is treated as a decision source if it carries one of these labels
// or its title looks like an Architecture Decision Record.
export const DECISION_LABELS = ['decision', 'decisions', 'adr', 'architecture-decision'];
const CQL = `type = page AND (label in (${DECISION_LABELS.map((l) => `"${l}"`).join(', ')}) OR title ~ "ADR" OR title ~ "Decision") ORDER BY lastmodified DESC`;

/** Search Confluence for candidate decision pages (metadata only). */
export async function findDecisionPages(limit = 50) {
  const res = await api
    .asApp()
    .requestConfluence(route`/wiki/rest/api/search?cql=${CQL}&limit=${limit}`, {
      headers: { Accept: 'application/json' },
    });
  if (!res.ok) throw new Error(`Confluence search failed (${res.status}): ${await res.text()}`);
  const json = await res.json();
  return (json.results || [])
    .filter((r) => r.content?.id)
    .map((r) => ({ id: String(r.content.id), title: r.content.title || r.title }));
}

/** Read one page with its storage-format body, converted to plain text. */
export async function readPage(pageId) {
  const res = await api
    .asApp()
    .requestConfluence(route`/wiki/api/v2/pages/${pageId}?body-format=storage`, {
      headers: { Accept: 'application/json' },
    });
  if (!res.ok) throw new Error(`Could not read page ${pageId} (${res.status})`);
  const page = await res.json();
  const base = page._links?.base || '';
  return {
    id: String(page.id),
    title: page.title,
    version: page.version?.number,
    createdAt: page.createdAt,
    url: page._links?.webui ? `${base}${page._links.webui}` : undefined,
    storage: page.body?.storage?.value || '',
    text: storageToText(page.body?.storage?.value || ''),
  };
}

/** Labels on a page, used by the page-updated event to decide whether to re-sync. */
export async function pageLabels(pageId) {
  const res = await api
    .asApp()
    .requestConfluence(route`/wiki/api/v2/pages/${pageId}/labels`, { headers: { Accept: 'application/json' } });
  if (!res.ok) return [];
  const json = await res.json();
  return (json.results || []).map((l) => l.name);
}
