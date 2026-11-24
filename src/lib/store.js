// Persistence for the decision registry, using Forge Key-Value Storage.
//
// Key layout:
//   decision:<pageId>:<n>  -> one decision extracted from a Confluence page
//   page:<pageId>          -> { version, title, decisionIds } so we skip unchanged pages
//   check:<issueKey>       -> cached conflict check for a Jira issue
//   settings               -> app settings (e.g. auto-comment on new issues)

// Named import: the package's default export is not reliably interop'd by the bundler.
import { kvs, WhereConditions } from '@forge/kvs';

/** Read every value whose key starts with `prefix` (follows pagination). */
async function listByPrefix(prefix) {
  const out = [];
  let cursor;
  do {
    let q = kvs.query().where('key', WhereConditions.beginsWith(prefix)).limit(100);
    if (cursor) q = q.cursor(cursor);
    const page = await q.getMany();
    out.push(...page.results.map((r) => r.value));
    cursor = page.nextCursor;
  } while (cursor);
  return out;
}

export async function listDecisions() {
  const all = await listByPrefix('decision:');
  // Newest decisions first; undated ones last.
  return all.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

export async function getDecision(id) {
  return kvs.get(`decision:${id}`);
}

export async function getPageRecord(pageId) {
  return kvs.get(`page:${pageId}`);
}

/**
 * Replace all decisions stored for a page with a fresh set.
 * Old decisions from the same page are deleted first so edits don't leave stale rows.
 */
export async function replacePageDecisions(page, decisions) {
  const previous = await getPageRecord(page.id);
  for (const id of previous?.decisionIds || []) await kvs.delete(`decision:${id}`);

  const ids = [];
  for (let i = 0; i < decisions.length; i++) {
    const id = `${page.id}:${i + 1}`;
    await kvs.set(`decision:${id}`, { ...decisions[i], id });
    ids.push(id);
  }
  await kvs.set(`page:${page.id}`, {
    pageId: page.id,
    title: page.title,
    version: page.version,
    decisionIds: ids,
    syncedAt: new Date().toISOString(),
  });
  return ids;
}

export async function removePage(pageId) {
  const previous = await getPageRecord(pageId);
  for (const id of previous?.decisionIds || []) await kvs.delete(`decision:${id}`);
  await kvs.delete(`page:${pageId}`);
}

export async function getCachedCheck(issueKey) {
  return kvs.get(`check:${issueKey}`);
}

export async function setCachedCheck(issueKey, value) {
  await kvs.set(`check:${issueKey}`, value);
}

const DEFAULT_SETTINGS = { autoComment: true };

export async function getSettings() {
  return { ...DEFAULT_SETTINGS, ...((await kvs.get('settings')) || {}) };
}

export async function saveSettings(settings) {
  const merged = { ...(await getSettings()), ...settings };
  await kvs.set('settings', merged);
  return merged;
}

/** Counts for the registry header. */
export async function getStats() {
  const [decisions, pages, checks] = await Promise.all([listDecisions(), listByPrefix('page:'), listByPrefix('check:')]);
  return {
    decisions: decisions.length,
    pages: pages.length,
    rejected: decisions.reduce((n, d) => n + (d.alternativesRejected?.length || 0), 0),
    flagged: checks.filter((c) => c?.result?.verdict === 'conflict').length,
  };
}
