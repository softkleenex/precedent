// Turn a Confluence page into structured, quote-backed decision records.

import { structuredCall } from './llm';
import { clip, quoteAppearsIn } from './text';
import { readPage } from './confluence';
import { getPageRecord, replacePageDecisions } from './store';

const SYSTEM = `You extract team decisions from internal documentation (ADRs, meeting notes, design docs).
A decision is a choice the team has made or explicitly rejected (e.g. "We use PostgreSQL, not MongoDB").
Rules:
- Only extract decisions actually stated in the page. Never infer or invent.
- "quote" MUST be copied word-for-word from the page (one or two sentences) and must state the decision itself.
- "alternativesRejected" lists options the page explicitly says were rejected or ruled out. Empty if none are stated.
- "status": "accepted" for active decisions, "superseded" if the page says it was replaced, "proposed" if not yet agreed.
- "date": the decision date as YYYY-MM-DD if the page states one, otherwise empty string.
- "exceptions": conditions under which the decision does NOT apply, or things it explicitly still allows (e.g. "internal tools may use any API style", "flexible metadata may go in a JSONB column"). Empty string if none.
- "revisitWhen": the condition the page gives for reopening the decision, or empty string.
- "keywords": 3-8 lowercase terms a developer might use when touching this area (technologies, components).
- If the page contains no decisions, return an empty list.`;

const SCHEMA = {
  type: 'object',
  properties: {
    decisions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short name, e.g. "Primary database: PostgreSQL"' },
          decision: { type: 'string', description: 'One sentence stating what was decided' },
          alternativesRejected: { type: 'array', items: { type: 'string' } },
          rationale: { type: 'string', description: 'Why, in one or two sentences, as stated in the page' },
          status: { type: 'string', enum: ['accepted', 'superseded', 'proposed'] },
          date: { type: 'string' },
          quote: { type: 'string', description: 'Verbatim sentence(s) from the page' },
          exceptions: { type: 'string', description: 'What the decision still allows / where it does not apply' },
          revisitWhen: { type: 'string', description: 'Stated condition for revisiting, if any' },
          keywords: { type: 'array', items: { type: 'string' } },
        },
        required: ['title', 'decision', 'alternativesRejected', 'rationale', 'status', 'date', 'quote', 'exceptions', 'revisitWhen', 'keywords'],
      },
    },
  },
  required: ['decisions'],
};

/**
 * Extract decisions from page text. Decisions whose quote cannot be found in the
 * page are dropped: this keeps the registry free of hallucinated decisions.
 */
export async function extractDecisions(page, { model } = {}) {
  const { decisions = [] } = await structuredCall({
    name: 'record_decisions',
    system: SYSTEM,
    user: `Page title: ${page.title}\n\nPage content:\n"""\n${clip(page.text, 14000)}\n"""`,
    schema: SCHEMA,
    maxTokens: 3000,
    model,
  });

  const verified = [];
  const rejected = [];
  for (const d of decisions) {
    (quoteAppearsIn(d.quote, page.text) ? verified : rejected).push(d);
  }
  return {
    verified: verified.map((d) => ({
      ...d,
      date: d.date || (page.createdAt || '').slice(0, 10),
      pageId: page.id,
      pageTitle: page.title,
      pageUrl: page.url,
      extractedAt: new Date().toISOString(),
    })),
    droppedCount: rejected.length,
  };
}

/**
 * Sync one page into the registry. Skips the LLM call if the page version
 * hasn't changed since the last sync (unless force=true).
 */
export async function syncPage(pageId, { force = false } = {}) {
  const page = await readPage(pageId);
  const previous = await getPageRecord(pageId);
  if (!force && previous && previous.version === page.version) {
    return { pageId, title: page.title, skipped: true, count: previous.decisionIds.length, dropped: 0 };
  }
  const { verified, droppedCount } = await extractDecisions(page);
  await replacePageDecisions(page, verified);
  return { pageId, title: page.title, skipped: false, count: verified.length, dropped: droppedCount };
}
