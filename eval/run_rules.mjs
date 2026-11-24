// Free, local evaluation of the deterministic (no-LLM) pipeline:
// parse the real Confluence pages with parseDecisions, add the distractor decisions,
// then run ruleCheck on every labelled case.
// Usage: node eval/run_rules.mjs [--verbose]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDecisions } from '../src/lib/parse.js';
import { ruleCheck } from '../src/lib/rules.js';
import { techsIn } from '../src/lib/tech.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => JSON.parse(fs.readFileSync(path.join(here, f), 'utf8'));
const verbose = process.argv.includes('--verbose');

// 1. Parse real pages. Map parsed decisions onto the ids used in cases.json (pageId:n).
const pages = read('pages.json');
const real = [];
for (const p of pages) {
  parseDecisions(p).forEach((d, i) => real.push({ ...d, id: `${p.id}:${i + 1}`, pageTitle: p.title }));
}
if (verbose) for (const d of real) console.log('DECISION', d.id, '|', d.title, '| rejected:', d.alternativesRejected, '| chosen:', d.chosen, '| exc:', d.exceptions, '| status:', d.status);

const extra = read('extra_decisions.json').map((d) => ({ ...d, chosen: techsIn(d.decision) }));
const decisions = [...real, ...extra];

// 2. Score.
const cases = read('cases.json');
let tp = 0, fp = 0, fn = 0, caseOk = 0;
const misses = [];
for (const c of cases) {
  const r = ruleCheck(c.text, decisions);
  const pred = new Set(r.findings.map((f) => f.decisionId));
  for (const a of c.acceptable || []) pred.delete(a);
  const exp = new Set(c.problems);
  const t = [...exp].filter((x) => pred.has(x)).length;
  tp += t; fp += pred.size - t; fn += exp.size - t;
  if ((exp.size > 0) === (pred.size > 0)) caseOk++;
  if (t !== exp.size || pred.size !== t) misses.push({ id: c.id, expected: [...exp], got: [...pred], quotes: r.findings.map((f) => `${f.decisionId}: ${f.workQuote}`) });
}
const P = tp / (tp + fp || 1), R = tp / (tp + fn || 1);
const summary = { precision: +P.toFixed(3), recall: +R.toFixed(3), f1: +((2 * P * R) / (P + R || 1)).toFixed(3), case_accuracy: +(caseOk / cases.length).toFixed(3), tp, fp, fn, cases: cases.length };
console.log(JSON.stringify(summary));
for (const m of misses) console.log('  MISS', m.id, 'expected', m.expected, 'got', m.got, verbose ? m.quotes : '');
fs.mkdirSync(path.join(here, 'results'), { recursive: true });
fs.writeFileSync(path.join(here, 'results', 'rules_latest.json'), JSON.stringify({ summary, misses, decisions: real }, null, 1));
