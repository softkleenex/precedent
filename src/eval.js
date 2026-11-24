// Evaluation endpoint (web trigger) used during development to measure
// extraction and conflict-check quality across models and prompt versions.
// It is protected by a shared secret stored as an encrypted Forge variable.

import { checkAgainstDecisions } from './lib/check';
import { extractDecisions, syncPage } from './lib/extract';
import { lastUsage, setBudgetBypass } from './lib/llm';
import { listDecisions } from './lib/store';
import { findDecisionPages } from './lib/confluence';

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': ['application/json'] },
  body: JSON.stringify(body),
});

export async function handler(request) {
  let input;
  try {
    input = JSON.parse(request.body || '{}');
  } catch {
    return json(400, { error: 'invalid json' });
  }
  const expected = process.env.EVAL_TOKEN;
  if (!expected || input.token !== expected) return json(403, { error: 'forbidden' });

  setBudgetBypass(true);
  const started = Date.now();
  try {
    if (input.op === 'decisions') {
      return json(200, { decisions: await listDecisions() });
    }
    if (input.op === 'pages') {
      return json(200, { pages: await findDecisionPages() });
    }
    if (input.op === 'syncPage') {
      return json(200, { result: await syncPage(String(input.pageId), { force: true }) });
    }
    if (input.op === 'check') {
      const result = await checkAgainstDecisions(input.text, { model: input.model, decisions: input.decisions });
      return json(200, { result, usage: lastUsage, ms: Date.now() - started });
    }
    if (input.op === 'extract') {
      const page = { id: 'eval', title: input.title || 'Untitled', text: input.text, url: '' };
      const result = await extractDecisions(page, { model: input.model });
      return json(200, { result, usage: lastUsage, ms: Date.now() - started });
    }
    return json(400, { error: 'unknown op' });
  } catch (e) {
    return json(500, { error: e.message, ms: Date.now() - started });
  } finally {
    setBudgetBypass(false);
  }
}
