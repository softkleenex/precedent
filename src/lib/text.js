// Text helpers shared by extraction, checking and retrieval.
// Everything here is pure (no Forge APIs) so it can be unit-tested locally with node.

/**
 * Convert Confluence "storage format" (XHTML) into readable plain text.
 * We keep paragraph / list boundaries as newlines so quotes stay intact.
 */
export function storageToText(storage = '') {
  return storage
    // Drop macro parameters (e.g. code language) but keep macro bodies.
    .replace(/<ac:parameter[^>]*>[\s\S]*?<\/ac:parameter>/g, ' ')
    // Block-level tags become newlines so sentences don't merge.
    .replace(/<\/(p|li|h[1-6]|tr|div|blockquote|ac:task|ac:adf-node)>/g, '\n')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<li[^>]*>/g, '- ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&hellip;/g, '…')
    .replace(/&middot;/g, '·')
    .replace(/&rarr;/g, '→')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Convert Jira's Atlassian Document Format (ADF) description into plain text.
 */
export function adfToText(node) {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (node.type === 'text') return node.text || '';
  const inner = (node.content || []).map(adfToText).join('');
  const blockTypes = ['paragraph', 'heading', 'listItem', 'codeBlock', 'blockquote', 'tableRow'];
  return blockTypes.includes(node.type) ? `${inner}\n` : inner;
}

/**
 * Normalise text for quote verification: lowercase, unify quotes/dashes,
 * collapse whitespace and drop most punctuation so that harmless formatting
 * differences don't make a real quote fail verification.
 */
export function normalise(text = '') {
  return text
    .toLowerCase()
    .replace(/[‘’“”"'`]/g, '')
    .replace(/[–—-]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Returns true when `quote` really appears in `source`.
 * This is the core anti-hallucination check: any decision or conflict the
 * model reports must come with a quote we can find verbatim in the source.
 */
export function quoteAppearsIn(quote, source) {
  const q = normalise(quote);
  if (q.length < 8) return false; // too short to count as evidence
  return normalise(source).includes(q);
}

// Small English stop-word list for keyword retrieval.
const STOP = new Set(
  'a an and are as at be but by for from has have if in into is it its of on or our that the their them then there these they this to was we were will with you your use using should would can could not no do does did all any about after before over under than also only just more most new add adding'.split(' ')
);

/** Split text into lowercase keyword tokens (letters/numbers, length >= 2). */
export function tokens(text = '') {
  return (normalise(text).match(/[\p{L}\p{N}]{2,}/gu) || [])
    // "imgix로" -> "imgix": a Korean particle glued to a Latin word.
    .map((t) => t.replace(/^([a-z0-9]+)[가-힣]{1,3}$/, '$1'))
    .filter((t) => !STOP.has(t));
}

/**
 * Rank decisions by keyword overlap with a query (a cheap BM25-like score).
 * Used to keep LLM prompts small when a site has many decisions.
 */
export function rankDecisions(query, decisions, limit = 25) {
  const q = new Set(tokens(query));
  if (q.size === 0) return decisions.slice(0, limit);
  const scored = decisions.map((d) => {
    const docTokens = tokens(
      [d.title, d.decision, (d.alternativesRejected || []).join(' '), d.rationale, (d.keywords || []).join(' ')].join(' ')
    );
    const docSet = new Set(docTokens);
    let score = 0;
    for (const t of q) if (docSet.has(t)) score += 1 + Math.log(1 + docTokens.length / (docTokens.length + 10));
    return { d, score };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => ({ ...s.d, _score: s.score }));
}

/** Short stable hash (djb2) used to cache check results per issue content. */
export function hash(text = '') {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Trim long text to a character budget without cutting mid-word. */
export function clip(text = '', max = 12000) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(' ')) + ' …';
}
