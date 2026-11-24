// Backend for the UI Kit screens (Jira issue panel + Confluence registry page).

import Resolver from '@forge/resolver';
import { checkAgainstDecisions } from './lib/check';
import { findDecisionPages } from './lib/confluence';
import { syncPage } from './lib/extract';
import { readIssueText } from './lib/jira';
import { getCachedCheck, getSettings, listDecisions, saveSettings, setCachedCheck, removePage } from './lib/store';
import { hash } from './lib/text';

const resolver = new Resolver();

/**
 * Issue panel: return the cached check for this issue if the text is unchanged,
 * otherwise run a fresh check. `force` re-runs even when cached.
 */
resolver.define('getIssueCheck', async ({ payload, context }) => {
  const issueKey = context.extension?.issue?.key;
  if (!issueKey) throw new Error('No issue in context');
  // Read as the viewing user so we never show content they can't see.
  const text = await readIssueText(issueKey, { asUser: true });
  const textHash = hash(text);
  const cached = await getCachedCheck(issueKey);
  if (!payload?.force && cached?.hash === textHash) return { ...cached.result, checkedAt: cached.at, cached: true };

  const result = await checkAgainstDecisions(text);
  const at = new Date().toISOString();
  await setCachedCheck(issueKey, { hash: textHash, result, at });
  return { ...result, checkedAt: at, cached: false };
});

resolver.define('listDecisions', async () => listDecisions());

resolver.define('findPages', async () => findDecisionPages());

resolver.define('syncPage', async ({ payload }) => syncPage(String(payload.pageId), { force: !!payload.force }));

resolver.define('removePage', async ({ payload }) => {
  await removePage(String(payload.pageId));
  return true;
});

resolver.define('getSettings', async () => getSettings());

resolver.define('saveSettings', async ({ payload }) => saveSettings(payload));

export const handler = resolver.getDefinitions();
