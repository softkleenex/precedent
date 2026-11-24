// Deterministic conflict check (no LLM, no cost).
//
// A finding is raised when a sentence of the work:
//   - adopts an option the decision explicitly rejected            -> "revisits"
//   - adopts a different technology in the category the decision chose -> "conflicts"
//     (e.g. decision chose SQS for queues, work proposes Amazon MSK)
// Sentences that negate the option, migrate away from it, or only research it are ignored,
// and decision exceptions ("internal tools may use whatever fits") are respected.
// Every finding quotes the exact work sentence and the decision text.

import { mentionedTechs, techsIn } from './tech.js';
import { sentences } from './parse.js';
import { rankDecisions, normalise, tokens } from './text.js';

const RESEARCH = /\b(spike|evaluat\w*|discuss\w*|analysis|analy[sz]e|investigat\w*|research|faq|explain\w* why|document (?:that|why)|should we|consider\w*|compare|proposal for discussion)\b|검토|조사|논의/i;
const ADOPT = /\b(use|using|add|adding|set up|spin up|create|build|implement|move|switch|store|send|publish|write|deploy|run|cache|migrate to|replace \w+ with|prototype|expose|offer|bump|change)\b|도입|사용|저장|옮기|발행|추가|구현|바꿉|변경/i;

function escape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True if the alias is negated or being moved away from in this sentence. */
function negatedOrLeaving(sentence, alias) {
  const s = sentence.toLowerCase();
  const a = escape(alias.toLowerCase());
  const before = new RegExp(
    `\\b(not|no|never|without|won't|don't|doesn't|does not|avoid|instead of|rather than|from|off|away from|replace|replacing|retire|retiring|shut down|remove|removing|migrate|migrating|port)\\b[^.]{0,40}${a}`,
    'i'
  );
  const after = new RegExp(`${a}[^.]{0,30}\\b(is being retired|is retired|deprecated|devtools)\\b`, 'i');
  return before.test(s) || after.test(s);
}

/** Content words of a rejected phrase, for non-technology rejections like "floating point amounts". */
const STEM_SYNONYMS = { doubl: 'float', decim: 'float', cachi: 'cache', cached: 'cache', logge: 'logs', loggi: 'logs', 'log': 'logs' };
const stem = (t) => {
  const s = t.slice(0, 5);
  return STEM_SYNONYMS[s] || STEM_SYNONYMS[t] || s;
};

function phraseStems(phrase) {
  return tokens(phrase)
    .filter((t) => t.length >= 4)
    .map(stem);
}

function phraseHit(phrase, sentence) {
  const stems = phraseStems(phrase);
  if (stems.length === 0) return false;
  const words = tokens(sentence).map(stem);
  const hits = stems.filter((s) => words.includes(s)).length;
  return stems.length === 1 ? hits === 1 && stems[0].length >= 5 : hits >= Math.min(2, stems.length);
}

/** Does the decision's exception text exempt this piece of work? */
function exempted(decision, workText) {
  const exc = (decision.exceptions || '').toLowerCase();
  const work = workText.toLowerCase();
  // Mentions like "not exposed to partners" don't count as partner-facing.
  const partnerFacing = /\b(partner|public)/.test(work.replace(/\b(not|never|no)\b[^.]{0,30}\b(partner|public)\w*/g, '')) || /파트너/.test(work);
  if (/internal/.test(exc) && /\binternal\b|사내|내부/.test(work) && !partnerFacing) return true;
  return false;
}

export function ruleCheck(workText, decisions) {
  const work = sentences(workText.replace(/\n+/g, '. '));
  const researchOnly = RESEARCH.test(workText) && !/\b(implement|set up|spin up|deploy|buy|add)\b/i.test(workText.replace(RESEARCH, ''));
  const findings = [];

  for (const d of decisions) {
    if (d.status === 'proposed') continue;
    if (exempted(d, workText)) continue;

    const rejectedText = (d.alternativesRejected || []).join('; ');
    const rejectedTechs = new Set(techsIn(rejectedText));
    const chosen = new Set((d.chosen && d.chosen.length ? d.chosen : techsIn(d.decision)).filter((t) => !rejectedTechs.has(t)));
    const chosenCats = new Set(mentionedTechs(d.decision).filter((t) => chosen.has(t.name)).map((t) => t.category));
    const nonTechRejected = (d.alternativesRejected || []).filter((r) => techsIn(r).length === 0);
    // Prohibitions stated in the decision itself ("balances are never cached", "PII must never be written to logs").
    const forbidden = sentences(d.decision.replace(/;/g, '.'))
      .filter((x) => /\b(never|must not|must never|is not|are not)\b/i.test(x) && techsIn(x).length === 0)
      .map((x) => x.replace(/^.*?\b(?=\w+\s+(?:is|are|must)\s+(?:never|not))/i, ''));

    let best = null;
    for (const s of work) {
      if (!ADOPT.test(s) && !/[A-Za-z]/.test(s) === false && s.length < 6) continue;
      for (const t of mentionedTechs(s)) {
        if (negatedOrLeaving(s, t.alias)) continue;
        if (rejectedTechs.has(t.name)) {
          best = best || { relation: 'revisits', s, tech: t.name };
        } else if (chosenCats.has(t.category) && !chosen.has(t.name)) {
          best = best || { relation: 'conflicts', s, tech: t.name };
        }
      }
      if (!best) {
        for (const r of forbidden) {
          const stems = phraseStems(r);
          const words = tokens(s).map(stem);
          const hits = stems.filter((x) => words.includes(x)).length;
          if (stems.length >= 2 && hits >= Math.max(2, Math.ceil(stems.length * 0.6)) && !/\b(not|no|never|without)\b/i.test(s)) {
            best = { relation: 'conflicts', s, tech: r };
            break;
          }
        }
      }
      if (!best) {
        for (const r of nonTechRejected) {
          if (phraseHit(r, s) && !/\b(not|no|never|without)\b/i.test(s)) {
            best = { relation: 'revisits', s, tech: r };
            break;
          }
        }
      }
      if (best) break;
    }
    if (!best) continue;
    if (researchOnly) continue; // looking into an option is not adopting it

    findings.push({
      decisionId: d.id,
      relation: best.relation,
      workQuote: best.s.replace(/[.\s]+$/, ''),
      explanation:
        best.relation === 'revisits'
          ? `"${best.tech}" was explicitly rejected in this decision.`
          : `The team chose ${[...chosen].join(', ')} here; this work uses ${best.tech}.`,
      decisionTitle: d.title,
      decision: d.decision,
      decisionQuote: d.quote,
      pageTitle: d.pageTitle,
      pageUrl: d.pageUrl,
      date: d.date,
    });
  }

  const flagged = new Set(findings.map((f) => f.decisionId));
  const related = rankDecisions(workText, decisions, 5)
    .filter((d) => d._score > 0 && !flagged.has(d.id))
    .slice(0, 3)
    .map((d) => ({ decisionId: d.id, decisionTitle: d.title, decision: d.decision, pageTitle: d.pageTitle, pageUrl: d.pageUrl }));

  return {
    verdict: decisions.length === 0 ? 'no-decisions' : findings.length ? 'conflict' : 'clear',
    findings,
    related,
    considered: decisions.length,
  };
}

// Exposed for tests.
export const _internal = { negatedOrLeaving, phraseHit, normalise };
