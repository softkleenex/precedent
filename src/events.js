// Product event handlers: keep the registry fresh and flag new issues automatically.

import { checkAgainstDecisions } from './lib/check.js';
import { DECISION_LABELS, pageLabels } from './lib/confluence.js';
import { syncPage } from './lib/extract.js';
import { addFindingsComment, readIssueText } from './lib/jira.js';
import { getPageRecord, getSettings, removePage, setCachedCheck } from './lib/store.js';
import { hash } from './lib/text.js';
import { RULES_VERSION } from './lib/rules.js';

/** Confluence page created/updated: re-extract if it is (or was) a decision page. */
export async function onPageChanged(event) {
  const pageId = String(event?.content?.id || '');
  if (!pageId) return;
  const title = event?.content?.title || '';
  const labels = await pageLabels(pageId);
  const isDecisionPage = labels.some((l) => DECISION_LABELS.includes(l)) || /\b(ADR|Decision)\b/i.test(title);
  const known = await getPageRecord(pageId);

  if (isDecisionPage) {
    const result = await syncPage(pageId);
    console.log(`Synced page ${pageId}: ${result.count} decisions`);
  } else if (known) {
    // The page lost its decision label: forget its decisions.
    await removePage(pageId);
  }
}

/** Jira issue created: check it and comment if it conflicts with a decision. */
export async function onIssueCreated(event) {
  const issueKey = event?.issue?.key;
  if (!issueKey) return;
  const settings = await getSettings();
  if (!settings.autoComment) return;

  const text = await readIssueText(issueKey);
  const result = await checkAgainstDecisions(text);
  await setCachedCheck(issueKey, { hash: hash(`${RULES_VERSION}:${text}`), result, at: new Date().toISOString() });
  console.log(`Checked ${issueKey}: ${result.verdict}, ${result.findings.length} findings`);
  if (result.verdict === 'conflict') {
    await addFindingsComment(issueKey, result.findings);
    console.log(`Commented on ${issueKey}: ${result.findings.length} findings`);
  }
}
