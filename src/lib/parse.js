// Deterministic decision extraction from Confluence storage format.
// No LLM: we read the structure people already use for ADRs and meeting notes
// (Status/Date lines, "Decision" sections, "Alternatives considered", "Revisit when",
// "Decision:" bullets). Every field is copied from the page, so nothing is invented.

import { storageToText } from './text.js';
import { mentionedTechs } from './tech.js';

const DECISION_HEADING = /^(?:the\s+|our\s+)?(decision|decisions|outcome|resolution|policy|rule|rules|standard|standards|guideline|guidelines|requirement|requirements|결정|결정 사항|결론|정책|규칙|원칙|기준)(?=[\s:：.]|$)/i;
const ALTERNATIVES_HEADING = /(alternative|options considered|considered|rejected|기각|대안)/i;
const REVISIT_HEADING = /^(revisit|재검토)/i;
const CONSEQUENCES_HEADING = /^(consequences|implications|notes|결과|영향)/i;
const DECISION_LINE = /^(decision|decided|agreed|결정)\s*[:：-]\s*/i;

/** Split storage XHTML into a flat list of blocks: headings, paragraphs and list items. */
export function blocks(storage = '') {
  const out = [];
  const re = /<(h[1-6]|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = re.exec(storage))) {
    // Skip list items that only wrap nested lists (their children are matched separately).
    const inner = m[2].replace(/<(ul|ol)[\s\S]*<\/\1>/gi, '');
    const text = storageToText(inner).replace(/\s+/g, ' ').trim();
    if (text) out.push({ type: m[1].toLowerCase().startsWith('h') ? 'h' : m[1].toLowerCase(), text });
  }
  return out;
}

/** Split text into sentences, keeping the original wording. */
export function sentences(text = '') {
  // Split after . ! ? only when followed by whitespace, so "Node.js" and "3.13" stay intact.
  return text
    .split(/(?<=[.!?。])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function firstMatch(re, text) {
  const m = text.match(re);
  return m ? m[1].trim() : '';
}

/** Options the text explicitly rules out, e.g. "We will not introduce MongoDB", "Kafka was rejected". */
export function rejectedIn(text = '') {
  const found = [];
  const patterns = [
    /\b(?:will not|won't|do not|don't|does not|decided not to|must not|never|not)\s+(?:introduce|use|offer|adopt|store|build|add|run|allow)\s+([^.;,:]+?)(?=\s+(?:or any|for|to|because|in|on|unless)\b|[.;,:]|$)/gi,
    // "We will not call Firebase Cloud Messaging directly": any verb after a firm "will not".
    /\b(?:will not|won't|decided not to|agreed not to)\s+(?!be\b|have\b|need\b)[a-z]+\s+([^.;,:]+?)(?=\s+(?:or any|for|to|because|in|on|unless|directly|anymore)\b|[.;,:]|$)/gi,
    /\b([A-Z][\w.+/-]*(?:\s+[A-Z][\w.+/-]*)?)\s+(?:was|were|is|are)\s+(?:rejected|superseded|ruled out|deprecated)\b/g,
    /\b(?:rather than|instead of)\s+([^.;,]+)/gi,
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(text))) found.push(m[1].trim());
  }
  // "passwords or build our own login" -> ["passwords", "our own login"]
  return found
    // "a second payment processor such as Adyen or Braintree this year" -> "Adyen or Braintree"
    .map((f) => f.replace(/^.*\bsuch as\s+/i, '').replace(/\s+(?:this|next) (?:year|quarter|month|sprint)\b.*$|\s+for now\b.*$|\s+anymore\b.*$/i, ''))
    .flatMap((f) => f.split(/\s+or\s+|,\s*/))
    .map((f) => f.replace(/^(?:build|store|use|run|add|offer|introduce|any other)\s+/i, '').trim())
    .filter(Boolean);
}

/** "no new C code", "not Kafka", "instead of Redux": the option is ruled out, not chosen. */
function negatedIn(text, alias) {
  const a = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b(no|not|never|without|instead of|rather than|won't|will not|don't|do not)\\s+(?:\\w+\\s+){0,2}${a}`, 'i').test(text);
}

/**
 * Extract decisions from one page.
 * @returns {object[]} decision records (without id/page fields)
 */
export function parseDecisions(page) {
  const bs = blocks(page.storage || '');
  const fullText = bs.map((b) => b.text).join('\n');

  const pageStatus = /status\s*[:：]?\s*superseded|superseded by/i.test(fullText)
    ? 'superseded'
    : /status\s*[:：]?\s*(proposed|draft)|\bproposed\b.*not yet agreed/i.test(fullText)
      ? 'proposed'
      : 'accepted';
  const date = firstMatch(/\b(?:date|날짜)\s*[:：]?\s*(\d{4}-\d{2}-\d{2})/i, fullText) || firstMatch(/^(\d{4}-\d{2}-\d{2})/, page.title) || (page.createdAt || '').slice(0, 10);

  // Walk the blocks, remembering which section we're in.
  let section = '';
  const decisionParas = [];
  const decisionItems = [];
  const alternatives = [];
  const revisit = [];
  const consequences = [];
  for (const b of bs) {
    if (b.type === 'h') {
      section = b.text;
      continue;
    }
    if (DECISION_LINE.test(b.text)) {
      decisionItems.push(b.text.replace(DECISION_LINE, ''));
    } else if (DECISION_HEADING.test(section)) {
      (b.type === 'li' ? decisionItems : decisionParas).push(b.text);
    } else if (ALTERNATIVES_HEADING.test(section)) {
      alternatives.push(b.text);
    } else if (REVISIT_HEADING.test(section)) {
      revisit.push(b.text);
    } else if (CONSEQUENCES_HEADING.test(section)) {
      consequences.push(b.text);
    }
  }

  // Inline "Revisit if/when …" sentences anywhere count too.
  const headings = new Set(bs.filter((b) => b.type === 'h').map((b) => b.text.trim()));
  for (const s of sentences(fullText)) {
    if (/^revisit\b/i.test(s) && !headings.has(s.trim()) && !revisit.includes(s)) revisit.push(s);
  }

  // Alternatives section items look like "MongoDB: rejected. …" → take the name before the colon/dash.
  const altNames = alternatives
    .filter((a) => /reject|not chosen|ruled out|기각/i.test(a) || ALTERNATIVES_HEADING.test(section))
    .map((a) => a.split(/[:：–—-]\s|\s+\(|\s+was\b|\s+is\b/)[0].trim())
    .filter((a) => a && a.length <= 40);

  const titleRejected = firstMatch(/,?\s+not\s+([^,]+)$/i, page.title);
  // Carve-outs only: "Internal tools may …", "… except vendored SDKs". A rule like "X is not allowed" is not an exception.
  const scopeSentences = (text) =>
    sentences(text)
      .filter((s) => /\b(may|except|unless|exempt|allowed|still|internal|out of scope|does not apply)\b|예외|허용/i.test(s))
      .filter((s) => !/\b(not allowed|never allowed|may not|must not)\b/i.test(s) || /\b(except|unless)\b/i.test(s))
      .map((s) => {
        const m = s.match(/\b(?:except(?: for)?|unless|other than)\b\s*(.+)$/i);
        return m ? `Exception: ${m[1]}` : s;
      });

  const make = (rawText, title, extraRejected = []) => {
    const text = rawText.charAt(0).toUpperCase() + rawText.slice(1);
    const quote = sentences(text).slice(0, 2).join(' ');
    const negatedTechs = mentionedTechs(text).filter((t) => negatedIn(text, t.alias)).map((t) => t.name);
    const rejected = [...new Set([...rejectedIn(text), ...extraRejected, ...negatedTechs].map((r) => r.replace(/^(?:a|an|the)\s+/i, '').trim()))].filter(
      (r) => r.length > 1 && r.length <= 60
    );
    return {
      title,
      decision: sentences(text)[0] || text,
      // Full decision text (clipped) so obligation rules in later sentences are checked too.
      body: text.length > 1500 ? text.slice(0, 1500) : text,
      alternativesRejected: rejected,
      rationale: sentences(fullText).find((s) => /\bbecause\b|rationale|이유|때문/i.test(s)) || '',
      status: pageStatus,
      date,
      quote,
      exceptions: [...scopeSentences(text), ...consequences.flatMap(scopeSentences)].join(' '),
      revisitWhen: revisit.join(' '),
      chosen: mentionedTechs(sentences(text)[0] || text)
        .filter((t) => !negatedIn(sentences(text)[0] || text, t.alias))
        .map((t) => t.name),
      keywords: mentionedTechs(`${page.title} ${text}`).map((t) => t.name),
    };
  };

  const cleanTitle = page.title.replace(/^(ADR|RFC)[-\s]?\d+\s*[:：-]\s*/i, '').replace(/\s*\(old\)\s*/i, '');
  const out = [];
  if (decisionParas.length) {
    out.push(make(decisionParas.join(' '), cleanTitle, [...altNames, ...(titleRejected ? [titleRejected] : [])]));
  }
  for (const item of decisionItems) {
    // Title: the first clause of the bullet, kept short enough to scan in a table.
    const clause = item.split(/;|,\s+(?:and|so|because)\b/)[0].replace(/[.;]$/, '');
    const title = clause.length > 70 ? `${clause.slice(0, 67).replace(/\s+\S*$/, '')}…` : clause;
    out.push(make(item, title.charAt(0).toUpperCase() + title.slice(1)));
  }
  return out;
}
