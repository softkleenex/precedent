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
import { policyViolation, conceptsIn } from './policy.js';

const RESEARCH = /\b(spike|evaluat\w*|discuss\w*|analysis|analy[sz]e|investigat\w*|research|faq|explain\w* why|document (?:that|why)|one-pager|write-?up|onboarding (?:wiki|doc)|summari[sz]e (?:adr|the adr|the decision)|research only|no implementation|analysis only|\bvs\.?|versus|document in the (?:runbook|wiki|readme)|runbook note|should we|consider\w*|compare|proposal for discussion)\b|검토|조사|논의/i;
// A sentence that only asks or reports about an option ("partner asked whether we support Kafka").
const ASKING = /\b(asks? for|asked for|is asking for|question about|asked (?:whether|if|about)|asks (?:whether|if|about)|wondering (?:whether|if)|do we support)\b|\?\s*$|문의|질문/i;
// A sentence that is itself a spike or discussion, not a feature that merely mentions comparing.
const RESEARCH_SENTENCE = /^\W*(?:spike|research|investigate|evaluate|analy[sz]e|discuss|consider|compare)\b|\b(?:should we|whether to|whether we|we can discuss|to be discussed|we looked at|we considered|we evaluated)\b|검토|조사|논의/i;
// Words that make a sentence about removing or avoiding something rather than doing it.
const AWAY = /\b(not|no|never|without|stop\w*|no longer|remove\w*|removing|delete\w*|deleting|drop\w*|retire\w*|replace\w*|clean(?:ing)? up|get rid of|away from|off the table|ruled out|decided against|not an option|revert\w*|roll(?:ing)? back|rollback|undo|mov\w* (?:\S+ ){0,3}off|scrub\w*|mask\w*|redact\w*|migrat\w*|finish\w* (?:the )?\w+ (?:migration|move|cutover))\b|제거|정리|중단|폐기|없애|마스킹|이관|종료|셧다운|에서 .{0,20}(?:로|으로) (?:옮|이전|전환)/i;
const ADOPT = /\b(use|using|add|adding|set up|spin up|create|build|implement|move|switch|store|send|publish|write|deploy|run|cache|migrate to|replace \w+ with|prototype|expose|offer|bump|change)\b|도입|사용|저장|옮기|발행|추가|구현|바꿉|변경/i;

function escape(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True if the alias is negated or being moved away from in this sentence. */
function negatedOrLeaving(sentence, alias) {
  const s = sentence.toLowerCase();
  const a = escape(alias.toLowerCase());
  const before = new RegExp(
    `\\b(not|no|never|without|won't|don't|doesn't|does not|avoid|instead of|rather than|off|away from|replace|replacing|retire|retiring|shut down|remove|removing|delete|deleting|drop|clean up|get rid of|revert|reverting|roll back|migrate (?:away )?from|migrating (?:away )?from|move (?:away )?from|moving (?:away )?from|migrate off|move off|(?:fix|convert|clean up|migrate|rewrite)\\s+(?:the\\s+)?(?:last|remaining|legacy|old|existing))\\b[^.]{0,40}${a}`,
    'i'
  );
  const after = new RegExp(`${a}[^.]{0,30}\\b(is being retired|is retired|deprecated|devtools)\\b|${a}\\s+(?:migration|cutover|deprecation|removal|sunset|teardown|decommission\\w*)\\b`, 'i');
  // "the Datadog to Grafana move", "Go and Node.js code samples" for docs.
  const fromTo = new RegExp(`\\bfrom\\s+${a}\\s+(?:to|into|onto)\\b`, 'i');
  const moving = new RegExp(`${a}\\s+(?:to|→|->)\\s+[\\w.+/ -]{1,30}?\\b(move|migration|cutover|switch|transition)\\b`, 'i');
  // "migrate the iOS APNs sender to FCM", "connect their own Snowflake as a source": leaving it, or integrating with someone else's.
  const migrateAway = new RegExp(`\\b(?:migrate|move|port|switch|consolidate)\\s+(?:the\\s+)?(?:[\\w-]+\\s+){0,2}${a}[^.]{0,40}\\s(?:to|onto|into)\\s`, 'i');
  const theirs = new RegExp(`\\b(?:customers?'?s?|their|partners?'?s?|client'?s?)\\s+(?:own\\s+)?(?:[\\w-]+\\s+)?${a}|${a}\\s+(?:source\\s+|destination\\s+)?connector|${a}[^.]{0,20}\\bas a (?:data )?source\\b|connector for ${a}`, 'i');
  const samples = new RegExp(`${a}[^.]{0,25}\\b(code samples?|samples?|snippets?|examples?)\\b`, 'i');
  // Korean "부동소수점 금액 컬럼을 정수 센트 컬럼으로 바꿉니다" (changing it into something else).
  const display = new RegExp(`${a}[^.]{0,40}\\b(for display|display only|only in the (?:web |mobile )?ui)\\b`, 'i');
  const koAfter = new RegExp(`${a}[^.]{0,20}(정리|제거|삭제|폐기|중단|걷어|없애|종료|셧다운|이관)`, 'i');
  const koLeaving = new RegExp(`${a}[^.]{0,30}(?:을|를|은|는|에|에서)\\s[^.]{0,40}(?:으로|로)\\s*(?:바꿉|바꾸|바꿔|전환|이전|이관|교체|옮|다시 작성|재작성|포팅|마이그레이션)`, 'i');
  return before.test(s) || after.test(s) || moving.test(s) || fromTo.test(s) || migrateAway.test(s) || theirs.test(s) || samples.test(s) || koLeaving.test(s) || display.test(s) || koAfter.test(s);
}

/** Content words of a rejected phrase, for non-technology rejections like "floating point amounts". */
const STEM_SYNONYMS = { doubl: 'float', decim: 'float', cachi: 'cache', cached: 'cache', logge: 'logs', loggi: 'logs', 'log': 'logs' };
const stem = (raw) => {
  const t = raw.length > 4 ? raw.replace(/s$/, '') : raw;
  const s = t.slice(0, 5);
  return STEM_SYNONYMS[s] || STEM_SYNONYMS[t] || s;
};

function phraseStems(phrase) {
  return tokens(phrase)
    .filter((t) => t.length >= 4)
    .map(stem);
}

// Korean words for non-technology rejections, so "소수점 문자열" matches "Decimal strings".
const KO_GLOSSARY = { 부동소수점: 'floating point', 소수점: 'decimal', 문자열: 'strings', 실수형: 'float', 수동: 'manual', 콘솔: 'console', 환경변수: 'environment variable', 하드코딩: 'hard-coded', 비밀번호: 'passwords' };
// "our own kernel driver" = "in-house kernel driver"; but "our own Mosquitto" names a product, keep it.
const glossed = (s0) => s0.replace(/\b(?:in-house|our own|hand-rolled|homegrown|home-grown|self-built|custom-built|self-hosted)\b|자체|직접/gi, (m, at, str) => (/^\s+[A-Z]/.test(str.slice(at + m.length)) ? m : 'inhouse')).replace(/[가-힣]+/g, (w) => {
  const k = Object.keys(KO_GLOSSARY).find((g) => w.startsWith(g));
  return k ? `${KO_GLOSSARY[k]} ${w}` : w;
});

// Product-like names inside a rejected phrase ("EMQX brokers") are enough on their own.
const COMMON_ACRONYMS = new Set(['API', 'APIS', 'UI', 'SDK', 'SDKS', 'HTTP', 'HTTPS', 'JSON', 'SQL', 'AWS', 'GCP', 'CLI', 'PR', 'PRS', 'ID', 'IDS', 'URL', 'CI', 'CD', 'DB', 'OS', 'IP', 'TLS', 'PII', 'PHI', 'UTC', 'SAML', 'SSO', 'OIDC', 'OAUTH', 'JWT', 'REST', 'CSV', 'PDF', 'HTML', 'CSS', 'DNS', 'VPN', 'SMS', 'MFA', 'RBAC', 'ACL', 'KPI', 'SLA', 'ETL', 'GDPR', 'HIPAA', 'CRM', 'ERP', 'SCIM', 'GA', 'MVP', 'QA', 'EU', 'US', 'KST']);
function productTokens(phrase) {
  return (phrase.match(/[A-Za-z][A-Za-z0-9]*/g) || []).filter(
    (w) => ((/^[A-Z][A-Z0-9]{2,}$/.test(w) && !COMMON_ACRONYMS.has(w.toUpperCase())) || /^[A-Z]?[a-z]+[A-Z][A-Za-z]*$/.test(w))
  );
}

/** "Every connector sync and backfill is orchestrated as a Temporal workflow": a category rule with a narrow
 * subject only applies to work about that subject (a CS report cron job is not a connector sync). */
function subjectOverlap(d, workText) {
  const m = (d.decision || '').match(/^\s*(?:every|each)\s+([^.]*?)\s+(?:is|are|run|runs|uses?|must|goes|go)\b/i) ||
    (d.decision || '').match(/^\s*(?!we\b|our\b|all\b)([^.]*?)\s+(?:is|are)\s+(?:persisted|stored|written|served|kept|handled|processed|orchestrated|rendered|enqueued|built)\b/i);
  if (!m) return true;
  const norm = (t) => (t.length > 4 ? t.replace(/s$/, '') : t);
  const subj = tokens(m[1]).filter((t) => t.length >= 4).map(norm);
  if (subj.length < 2) return true;
  const words = new Set(tokens(workText).map(norm));
  return subj.some((w) => words.has(w));
}

/** "WorkOS: multiple SAML connections": the work goes through the option the decision chose. */
function viaChosen(d, s) {
  const m = (d.decision || '').match(/\b(?:through|via|using|uses|use|with|by)\s+([A-Z][\w.-]+)/);
  if (!m) return false;
  return new RegExp(`\\b${escape(m[1].replace(/[.-]+$/, ''))}\\b`, 'i').test(s) && !/\b(ourselves|in-house|hand-rolled|instead of|replace\w*|directly)\b|직접|자체/i.test(s);
}

function phraseHit(rawPhrase, rawSentence) {
  // "Apache Druid" is Druid: umbrella vendor words don't distinguish options.
  const phrase = glossed(rawPhrase).replace(/\b(?:Apache|Amazon|AWS|Google Cloud|Microsoft|Azure)\s+(?=[A-Z])/g, '');
  const sentence = glossed(rawSentence);
  // "PostgreSQL full-text search" is about a use of PostgreSQL: its product name alone is not enough.
  for (const p of mentionedTechs(phrase).length ? [] : productTokens(phrase)) {
    if (new RegExp(`(^|[^\\p{L}\\p{N}_])${escape(p)}(?=$|[^\\p{L}\\p{N}_]|[가-힣])`, 'iu').test(sentence)) return true;
  }
  const stems = phraseStems(phrase);
  if (stems.length === 0) return false;
  // A one-word rejection ("passwords") must match the whole word, not a prefix ("password-reset emails").
  if (stems.length === 1) {
    const word = tokens(phrase).find((t) => t.length >= 4);
    // A capitalised name ("Split", "Node") must be written that way: "split on hyphens" is not Split.
    const raw = (phrase.match(/[A-Za-z][\w.]*/g) || []).find((w) => w.toLowerCase().startsWith(word));
    if (raw && /^[A-Z]/.test(raw)) return new RegExp(`(^|[^\\w])${escape(raw)}(?![a-z])`).test(rawSentence);
    return tokens(sentence).includes(word);
  }
  const words = tokens(sentence).map(stem);
  const hits = stems.filter((s) => words.includes(s)).length;
  // Nearly every content word must match ("KMS-managed keys" is not "Application-managed encryption keys").
  return words.includes(stems[0]) && hits >= Math.max(2, stems.length - (stems.length >= 4 ? 1 : 0));
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

/**
 * A scoped exception in the decision ("PHI may appear in the audit trail", "one-off Kubernetes Jobs are fine")
 * covers this sentence when the sentence mentions everything that makes the exception specific:
 * the concepts and technologies the exception names beyond the rule itself.
 */
const EXCEPTION_WORDS = /^(exempt\w*|allowed|except\w*|may|still|fine|okay|permitted|unless|exception)$/i;
function exceptionCovers(decision, sentence) {
  const ruleTerms = new Set([...conceptsIn(decision.decision || '').keys(), ...techsIn(decision.decision || '')]);
  const sentTerms = new Set([...conceptsIn(sentence).keys(), ...techsIn(sentence)]);
  for (const exc of sentences(decision.exceptions || '')) {
    if (/\binternal\b/i.test(exc)) continue; // handled by exempted()
    const specific = [...conceptsIn(exc).keys(), ...techsIn(exc)].filter((t) => !ruleTerms.has(t));
    if (specific.length && specific.every((t) => sentTerms.has(t))) return true;
    // No known concept: fall back to the exception's own distinctive words ("lab bench network").
    if (!specific.length) {
      const ruleWords = new Set(tokens(decision.decision || '').map(stem));
      const words = new Set(tokens(sentence).map(stem));
      const own = [...new Set(tokens(exc).filter((t) => t.length >= 4 && !EXCEPTION_WORDS.test(t)).map(stem))].filter((w) => !ruleWords.has(w));
      if (own.length >= 2 && own.filter((w) => words.has(w)).length >= Math.max(2, Math.ceil(own.length / 2))) return true;
    }
  }
  return false;
}

function adoptsViaReplace(s, word) {
  return new RegExp(`\\b(replac\\w*|swap\\w*|switch\\w*|mov\\w*|migrat\\w*)\\b[^.]{0,40}\\b(with|to|for)\\s+(?:the\\s+)?${escape(word)}`, 'i').test(s);
}

/** The ticket's own summary says it removes the flagged thing or brings it under the chosen option. */
function aboutRemoving(summary, best, chosen) {
  // "Replace SES with Postmark", "Swap EAC for BattlEye" adopt the second option.
  const target = best.alias || (!best.why && typeof best.tech === 'string' ? (productTokens(best.tech)[0] || best.tech.split(/\s+/)[0]) : '');
  if (target && adoptsViaReplace(summary, target)) return false;
  const named = best.alias || (typeof best.tech === 'string' && best.tech.split(/\s+/).length <= 3 ? best.tech : '');
  const subject = named
    ? new RegExp(escape(named), 'i').test(summary) || productTokens(named).some((p) => new RegExp(escape(p), 'i').test(summary))
    : [...conceptsIn(best.s).keys()].some((k) => conceptsIn(summary).has(k));
  if (subject && AWAY.test(summary)) return true;
  const remediate = /\b(import\w*|migrat\w*|mov\w*|port\w*|bring\w*|rewrit\w*|switch\w*)\b[^.]{0,60}\b(into|to|under|onto)\b/i;
  return remediate.test(summary) && [...chosen].some((c) => techsIn(summary).includes(c));
}

// Bump when rule behaviour changes so cached issue checks are recomputed.
export const RULES_VERSION = 5;

// What part of the system a decision or a piece of work is about. A firmware language rule says nothing
// about backend services, and a backend rule says nothing about the docs site.
const DOMAINS = {
  firmware: /\b(firmware|embedded|bootloader|mcu|drivers?|uart|ble|sensor module)\b|펌웨어|센서|드라이버/i,
  backend: /\b(backend|back-end|server|services?|api|microservices?|lambda)\b|백엔드|서버|서비스/i,
  frontend: /\b(frontend|front-end|web app|admin (?:ui|web|frontend|console)|spa|react app)\b|프론트엔드|웹 프론트/i,
  mobile: /\b(mobile|ios|android|companion app|customer app)\b|모바일|앱/i,
  docs: /\b(docs|documentation|docs site|developer docs|docusaurus|code samples?)\b|문서/i,
};
function domainsOf(text) {
  return new Set(Object.entries(DOMAINS).filter(([, re]) => re.test(text)).map(([k]) => k));
}
// Categories where "which part of the system" matters: languages and app frameworks.
const DOMAIN_CATEGORIES = new Set(['backend language', 'mobile', 'frontend state']);
function outOfDomain(decisionText, sentence, strict = false) {
  const dd = domainsOf(decisionText);
  const wd = domainsOf(sentence);
  if (dd.size === 0) return false;
  // A category match (not an explicit rejection) needs the work to say it is in the decision's area.
  if (wd.size === 0) return strict;
  return ![...wd].some((k) => dd.has(k));
}

/** One-sentence reason, naming the paraphrase as the author wrote it ("Amazon MSK is Kafka, …"). */
function explain(best, chosen) {
  if (best.why) return best.why;
  const m = best.alias ? new RegExp(escape(best.alias), 'i').exec(best.s) : null;
  const written = m ? m[0] : best.tech;
  const named = written.toLowerCase() === String(best.tech).toLowerCase() ? best.tech : `${written} is ${best.tech}, which`;
  if (best.relation === 'revisits') {
    return named === best.tech ? `${best.tech} was explicitly rejected in this decision.` : `${named} was explicitly rejected in this decision.`;
  }
  if (!best.alias) return `This decision rules this out: "${best.tech}".`;
  return `The team chose ${[...chosen].join(', ')} for this; this work uses ${named === best.tech ? best.tech : `${written} (${best.tech})`}.`;
}

export function ruleCheck(workText, decisions) {
  const work = sentences(workText.replace(/\n+/g, '. '));
  // A spike or discussion ticket says so up front; "so we can compare" deep in a task is not research.
  const summary = workText.split(/\n/)[0];
  const researchOnly = (RESEARCH.test(summary) || RESEARCH.test(work[1] || '')) && !/\b(implement|set up|spin up|deploy|buy|add)\b/i.test(workText.replace(RESEARCH, ''));
  const findings = [];

  for (const d of decisions) {
    if (d.status === 'proposed' || d.status === 'superseded') continue;
    if (exempted(d, workText)) continue;

    const rejectedText = (d.alternativesRejected || []).join('; ');
    // "PostgreSQL full-text search" rejects a use of PostgreSQL, not PostgreSQL itself.
    const narrowUse = (r) => tokens(r.replace(new RegExp(mentionedTechs(r).map((t) => escape(t.alias)).join('|') || '$^', 'ig'), '')).filter((t) => t.length >= 4).length >= 2;
    const rejectedTechs = new Set((d.alternativesRejected || []).filter((r) => !narrowUse(r)).flatMap((r) => techsIn(r)));
    const chosen = new Set((d.chosen && d.chosen.length ? d.chosen : techsIn(d.decision)).filter((t) => !rejectedTechs.has(t)));
    const chosenCats = new Set(mentionedTechs(d.decision).filter((t) => chosen.has(t.name)).map((t) => t.category));
    const nonTechRejected = (d.alternativesRejected || []).filter((r) => techsIn(r).length === 0 || narrowUse(r));
    // Prohibitions stated in the decision itself ("balances are never cached", "PII must never be written to logs").
    const forbidden = sentences(d.decision.replace(/;/g, '.'))
      .filter((x) => /\b(never|must not|must never|is not|are not)\b/i.test(x) && techsIn(x).length === 0)
      .map((x) => x.replace(/^.*?\b(?=\w+\s+(?:is|are|must)\s+(?:never|not))/i, ''));

    let best = null;
    for (const s of work) {
      if (RESEARCH_SENTENCE.test(s) || ASKING.test(s)) continue;
      if (!ADOPT.test(s) && !/[A-Za-z]/.test(s) === false && s.length < 6) continue;
      for (const t of mentionedTechs(s)) {
        if (negatedOrLeaving(s, t.alias)) continue;
        // "export the Datadog dashboards and rebuild them in Grafana" moves toward the chosen option.
        if (rejectedTechs.has(t.name) && [...chosen].some((c) => techsIn(s).includes(c)) && /\b(rebuild|rebuilt|move|moving|migrat\w*|port\w*|export\w*|replac\w*|switch\w*|import\w*)\b/i.test(s)) continue;
        if (DOMAIN_CATEGORIES.has(t.category) && (rejectedTechs.has(t.name) || chosenCats.has(t.category)) && outOfDomain(`${d.title} ${d.decision}`, s, t.category !== undefined && !rejectedTechs.has(t.name))) continue;
        if (rejectedTechs.has(t.name)) {
          best = best || { relation: 'revisits', s, tech: t.name, alias: t.alias };
        } else if (chosenCats.has(t.category) && !chosen.has(t.name) && subjectOverlap(d, workText)) {
          best = best || { relation: 'conflicts', s, tech: t.name, alias: t.alias };
        }
      }
      if (!best) {
        for (const r of forbidden) {
          const stems = phraseStems(r);
          const words = tokens(s).map(stem);
          const hits = stems.filter((x) => words.includes(x)).length;
          if (stems.length >= 2 && hits >= Math.max(2, Math.ceil(stems.length * 0.6)) && !AWAY.test(s)) {
            best = { relation: 'conflicts', s, tech: r };
            break;
          }
        }
      }
      if (!best) {
        for (const r of nonTechRejected) {
          const word = r.split(/\s+/).filter((w) => !/^(?:apache|amazon|aws|google|microsoft|azure)$/i.test(w));
          const pw = productTokens(r)[0] || word[0];
          if (phraseHit(r, s) && (!AWAY.test(s) || (pw && adoptsViaReplace(s, pw))) && !outOfDomain(`${d.title} ${d.decision}`, s) && !(word.length === 1 && negatedOrLeaving(s, word[0])) && !viaChosen(d, s)) {
            best = { relation: 'revisits', s, tech: r };
            break;
          }
        }
      }
      if (best) break;
    }
    if (!best) {
      const v = policyViolation(workText, d);
      if (v) best = { relation: 'conflicts', s: v.s, tech: v.clause.text, why: v.why, alias: v.alias };
    }
    if (!best) continue;
    if (researchOnly) continue;
    if (exceptionCovers(d, best.s)) continue;
    if (best.s.replace(/[.\s]+$/, '') !== summary.trim().replace(/[.\s]+$/, '') && aboutRemoving(summary, best, chosen)) continue; // looking into an option is not adopting it

    findings.push({
      decisionId: d.id,
      relation: best.relation,
      workQuote: best.s.replace(/[.\s]+$/, ''),
      explanation: explain(best, chosen),
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
