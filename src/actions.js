// Rovo actions. The same functions back three surfaces:
//   1. the "Decision Keeper" Rovo agent,
//   2. the rovo:mcp server (Claude Code, Cursor, any MCP client),
//   3. other Rovo agents that reuse them as tools.
// Each returns plain text, which is what agents read best.

import { checkAgainstDecisions, formatFindings } from './lib/check';
import { listDecisions, getDecision } from './lib/store';
import { rankDecisions } from './lib/text';
import { readIssueText } from './lib/jira';

function formatDecision(d) {
  return (
    `[${d.id}] ${d.title} (${d.status}, ${d.date || 'undated'})\n` +
    `  Decision: ${d.decision}\n` +
    (d.alternativesRejected?.length ? `  Rejected: ${d.alternativesRejected.join('; ')}\n` : '') +
    `  Why: ${d.rationale}\n` +
    `  Quote: "${d.quote}"\n` +
    `  Source: ${d.pageTitle}${d.pageUrl ? ` — ${d.pageUrl}` : ''}`
  );
}

/** search-decisions: find recorded decisions about a topic. */
export async function searchDecisions(payload) {
  const query = (payload?.query || '').trim();
  const all = await listDecisions();
  if (all.length === 0) return 'No team decisions are recorded yet.';
  const hits = query ? rankDecisions(query, all, 8).filter((d) => d._score > 0) : all.slice(0, 8);
  if (hits.length === 0) return `No recorded decision matches "${query}".`;
  return hits.map(formatDecision).join('\n\n');
}

/** get-decision: full record for one decision id. */
export async function getDecisionById(payload) {
  const d = await getDecision(String(payload?.decisionId || ''));
  return d ? formatDecision(d) : `No decision with id "${payload?.decisionId}".`;
}

/** check-plan: check an implementation plan / proposal before work starts. */
export async function checkPlan(payload) {
  const plan = (payload?.plan || '').trim();
  if (plan.length < 20) return 'Please provide the plan as a few sentences describing what you intend to build or change.';
  const result = await checkAgainstDecisions(plan);
  const head =
    result.verdict === 'conflict'
      ? 'STOP: the plan conflicts with recorded team decisions. Ask the user before proceeding.'
      : 'OK: no conflicts with recorded team decisions.';
  return `${head}\n${formatFindings(result)}`;
}

/** check-issue: check a Jira issue (key given, or the issue the agent is open on). */
export async function checkIssue(payload) {
  const issueKey = payload?.issueKey || payload?.context?.jira?.issueKey;
  if (!issueKey) return 'Which Jira issue should I check? Please give an issue key like PROJ-123.';
  const text = await readIssueText(issueKey, { asUser: true });
  const result = await checkAgainstDecisions(text);
  return `${issueKey}: ${formatFindings(result)}`;
}
