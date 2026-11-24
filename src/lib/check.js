// Check a piece of text (a Jira issue, or a coding agent's implementation plan)
// against the team's recorded decisions. Deterministic: see rules.js.

import { ruleCheck } from './rules.js';
import { listDecisions } from './store.js';

/**
 * @param {string} workText - issue summary + description, or a plan
 * @returns {{ verdict: 'clear'|'conflict'|'no-decisions', findings: object[], related: object[], considered: number }}
 */
export async function checkAgainstDecisions(workText, { decisions } = {}) {
  const all = decisions || (await listDecisions());
  return ruleCheck(workText, all);
}

/** Human/agent-readable summary used by Rovo actions, MCP tools and logs. */
export function formatFindings(result) {
  if (result.verdict === 'no-decisions') {
    return 'No team decisions are recorded yet. Label Confluence pages with "decision" or "adr" and run a sync in Precedent.';
  }
  const label = { conflicts: 'CONFLICTS WITH', revisits: 'REVISITS A REJECTED OPTION IN' };
  const parts = result.findings.map(
    (f) =>
      `- ${label[f.relation]} decision "${f.decisionTitle}" (${f.date || 'undated'})\n` +
      `  Work says: "${f.workQuote}"\n` +
      `  Decision says: "${f.decisionQuote}"\n` +
      `  Why it matters: ${f.explanation}\n` +
      `  Source: ${f.pageTitle}${f.pageUrl ? ` — ${f.pageUrl}` : ''}`
  );
  if (result.related?.length) {
    parts.push(
      'Related decisions to compare against (automatic rules did not flag these; read them and judge):\n' +
        result.related
          .map((r) => `- "${r.decisionTitle}": ${r.decision}${r.pageUrl ? ` — ${r.pageUrl}` : ''}`)
          .join('\n')
    );
  }
  if (parts.length === 0) return `No recorded decision is affected (checked ${result.considered} decisions).`;
  return parts.join('\n');
}
