// Check a piece of text (a Jira issue, or a coding agent's implementation plan)
// against the team's recorded decisions.

import { structuredCall } from './llm';
import { clip, quoteAppearsIn, rankDecisions } from './text';
import { listDecisions } from './store';

const SYSTEM = `You review a proposed piece of work against a team's recorded decisions.
For each decision that the work clearly touches, classify the relation:
- "conflicts": the work does something the decision rules out, or contradicts it.
- "revisits": the work proposes an alternative the team explicitly rejected, or reopens a settled question.
- "follows": the work is in the decision's area and complies with it (useful context, not a problem).
Rules:
- Only report decisions that the work actually touches. Most decisions will be unrelated; skip them.
- "workQuote" MUST be copied word-for-word from the WORK text and show the part that relates to the decision.
- "explanation" is one short sentence a developer can act on.
- Ignore decisions with status "superseded" unless the work tries to bring them back.
- When unsure, do not report. False alarms erode trust.`;

const SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          decisionId: { type: 'string' },
          relation: { type: 'string', enum: ['conflicts', 'revisits', 'follows'] },
          workQuote: { type: 'string' },
          explanation: { type: 'string' },
        },
        required: ['decisionId', 'relation', 'workQuote', 'explanation'],
      },
    },
  },
  required: ['findings'],
};

/** Compact JSON for the prompt: only fields the model needs. */
function describe(d) {
  return {
    id: d.id,
    title: d.title,
    decision: d.decision,
    rejected: d.alternativesRejected,
    rationale: d.rationale,
    status: d.status,
  };
}

/**
 * @param {string} workText - issue summary + description, or a plan
 * @returns {{ verdict: 'clear'|'conflict'|'no-decisions', findings: object[], considered: number }}
 */
export async function checkAgainstDecisions(workText) {
  const all = await listDecisions();
  if (all.length === 0) return { verdict: 'no-decisions', findings: [], considered: 0 };

  const candidates = rankDecisions(workText, all, 25);
  const byId = Object.fromEntries(all.map((d) => [d.id, d]));

  const { findings = [] } = await structuredCall({
    name: 'report_findings',
    system: SYSTEM,
    user: `TEAM DECISIONS (JSON):\n${JSON.stringify(candidates.map(describe))}\n\nWORK:\n"""\n${clip(workText, 8000)}\n"""`,
    schema: SCHEMA,
    maxTokens: 1500,
  });

  // Evidence gate: keep a finding only if the decision exists and the quoted
  // part of the work is really in the work text.
  const verified = findings
    .filter((f) => byId[f.decisionId] && quoteAppearsIn(f.workQuote, workText))
    .map((f) => {
      const d = byId[f.decisionId];
      return {
        ...f,
        decisionTitle: d.title,
        decision: d.decision,
        decisionQuote: d.quote,
        pageTitle: d.pageTitle,
        pageUrl: d.pageUrl,
        date: d.date,
      };
    });

  // Problems first, context after.
  const order = { conflicts: 0, revisits: 1, follows: 2 };
  verified.sort((a, b) => order[a.relation] - order[b.relation]);
  const hasProblem = verified.some((f) => f.relation !== 'follows');
  return { verdict: hasProblem ? 'conflict' : 'clear', findings: verified, considered: candidates.length };
}

/** Human/agent-readable summary used by Rovo actions, MCP tools and Jira comments. */
export function formatFindings(result) {
  if (result.verdict === 'no-decisions') {
    return 'No team decisions are recorded yet. Label Confluence pages with "decision" or "adr" and run a sync in Precedent.';
  }
  if (result.findings.length === 0) {
    return `No recorded decision is affected (checked ${result.considered} relevant decisions).`;
  }
  const label = { conflicts: 'CONFLICTS WITH', revisits: 'REVISITS A REJECTED OPTION IN', follows: 'FOLLOWS' };
  return result.findings
    .map(
      (f) =>
        `- ${label[f.relation]} decision "${f.decisionTitle}" (${f.date || 'undated'})\n` +
        `  Work says: "${f.workQuote}"\n` +
        `  Decision says: "${f.decisionQuote}"\n` +
        `  Why it matters: ${f.explanation}\n` +
        `  Source: ${f.pageTitle}${f.pageUrl ? ` — ${f.pageUrl}` : ''}`
    )
    .join('\n');
}
