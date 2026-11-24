// Thin wrapper around Forge LLMs (Atlassian-hosted Claude).
// Every call goes through `structuredCall`, which forces the model to answer by
// calling a single "tool" whose JSON schema we define. That gives us parsed,
// typed output instead of free text we would have to regex.

import { chat } from '@forge/llm';
import kvs from '@forge/kvs';

// Model chosen from eval/RESULTS.md: Haiku 5.5 is the cheapest model (1/4 of Sonnet) with F1 0.977;
// precision is protected downstream by quote verification.
export const MODEL = 'claude-haiku-5-5';

// Forge LLM usage is billed to the app developer, so we cap calls per site per day.
const DAILY_CALL_LIMIT = 100;

// Token usage of the most recent call (read by the evaluation endpoint).
export let lastUsage = null;

// The evaluation endpoint switches the daily cap off for the length of one run.
let budgetBypass = false;
export function setBudgetBypass(on) {
  budgetBypass = on;
}

async function consumeBudget() {
  if (budgetBypass) return;
  const day = new Date().toISOString().slice(0, 10);
  const key = `usage:${day}`;
  const used = (await kvs.get(key)) || 0;
  if (used >= DAILY_CALL_LIMIT) {
    throw new Error('Precedent reached its daily AI limit for this site. Try again tomorrow.');
  }
  await kvs.set(key, used + 1);
}

/**
 * Ask the model for structured output.
 * @param {string} system  - system instructions
 * @param {string} user    - user content (the material to analyse)
 * @param {object} schema  - JSON schema for the answer object
 * @param {string} name    - tool name shown to the model
 * @returns {Promise<object>} the parsed arguments the model produced
 */
export async function structuredCall({ system, user, schema, name, maxTokens = 2000, model = MODEL }) {
  await consumeBudget();
  const response = await chat({
    model,
    max_completion_tokens: maxTokens,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    tools: [{ type: 'function', function: { name, description: `Return the ${name} result.`, parameters: schema } }],
    tool_choice: { type: 'function', function: { name } },
  });

  lastUsage = response?.usage || null;
  const call = response?.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error('The AI model returned no structured answer.');
  // Depending on SDK version, arguments may arrive as an object or a JSON string.
  const args = call.function.arguments;
  return typeof args === 'string' ? JSON.parse(args) : args;
}
