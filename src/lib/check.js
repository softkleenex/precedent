// Check a piece of text (a Jira issue, or a coding agent's implementation plan)
// against the team's recorded decisions.

import { structuredCall } from './llm';
import { clip, quoteAppearsIn, rankDecisions } from './text';
import { listDecisions } from './store';

const SYSTEM = `You review a proposed piece of work against a team's recorded decisions.
For each decision that the work clearly touches, classify the relation:
- "conflicts": the work would do something the decision rules out, or contradicts it.
- "revisits": the work proposes to ADOPT an alternative the team explicitly rejected.
- "follows": the work is in the decision's area and complies with it.
Rules:
- Respect each decision's "exceptions" and scope. Work that falls under an exception (e.g. an internal-only tool when the rule is about partner-facing APIs, or a JSONB column when the decision allows it) is "follows", not a conflict.
- Research, spikes, analyses or discussions that only evaluate an option without adopting it are NOT conflicts. Report them as "follows" only if the decision's "revisitWhen" condition is what they investigate; otherwise skip.
- Migrating AWAY from a superseded/rejected option toward the decided one is "follows".
- Only report decisions that the work actually touches. Most decisions are unrelated; skip them.
- "workQuote" MUST be copied word-for-word from the WORK text and show the part that relates to the decision.
- "explanation" is one short sentence a developer can act on.
- Decision text may be in English and the work in another language (e.g. Korean); compare meaning, and quote the work in its original language.
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
    exceptions: d.exceptions || undefined,
    revisitWhen: d.revisitWhen || undefined,
    status: d.status,
  };
}

/**
 * @param {string} workText - issue summary + description, or a plan
 * @returns {{ verdict: 'clear'|'conflict'|'no-decisions', findings: object[], considered: number }}
 */
export async function checkAgainstDecisions(workText, { model, decisions } = {}) {
  const all = decisions || (await listDecisions());
  if (all.length === 0) return { verdict: 'no-decisions', findings: [], considered: 0 };

  const candidates = rankDecisions(workText, all, 25);
  const byId = Object.fromEntries(all.map((d) => [d.id, d]));

  let findings;
  try {
    ({ findings = [] } = await structuredCall({
    name: 'report_findings',
    system: SYSTEM,
    user: `TEAM DECISIONS (JSON):\n${JSON.stringify(candidates.map(describe))}\n\nWORK:\n"""\n${clip(workText, 8000)}\n"""`,
    schema: SCHEMA,
    maxTokens: 1500,
    model,
  }));
  } catch (e) {
    // Atlassian's AI moderation can refuse a prompt (e.g. the issue contains personal data).
    // We still help by listing decisions that share keywords, without claiming a conflict.
    if (/disallowed/i.test(e.message)) {
      const related = candidates.filter((d) => d._score > 0).slice(0, 3);
      return {
        verdict: 'unavailable',
        reason: e.message.replace(/^.*disallowed:\s*/i, '') || 'moderation',
        findings: [],
        related: related.map((d) => ({ decisionId: d.id, decisionTitle: d.title, pageTitle: d.pageTitle, pageUrl: d.pageUrl })),
        considered: candidates.length,
      };
    }
    throw e;
  }

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
  if (result.verdict === 'unavailable') {
    const rel = (result.related || []).map((r) => `"${r.decisionTitle}"`).join(', ');
    return `Atlassian AI moderation declined to analyse this text (${result.reason}). It may contain personal data. ${
      rel ? `Decisions that share keywords and may be relevant: ${rel}.` : ''
    }`;
  }
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
