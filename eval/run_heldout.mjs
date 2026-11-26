// Held-out evaluation: pages and cases written by a separate author who never saw the rule code.
// Decisions are parsed from the pages exactly as the app does; labels refer to page ids.
// Usage: node eval/run_heldout.mjs [dir=eval/heldout] [--verbose]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDecisions } from '../src/lib/parse.js';
import { ruleCheck } from '../src/lib/rules.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(process.argv.slice(2).find((a) => !a.startsWith('--')) || path.join(here, 'heldout'));
const verbose = process.argv.includes('--verbose');
const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));

const pages = read('pages.json');
const decisions = pages.flatMap((p) => parseDecisions(p).map((d, i) => ({ ...d, id: `${p.id}:${i + 1}`, pageTitle: p.title })));
const parsedPages = new Set(decisions.map((d) => d.id.split(':')[0]));
if (verbose) for (const d of decisions) console.log('DECISION', d.id, '|', d.title, '| status:', d.status, '| rejected:', d.alternativesRejected);

const cases = read('cases.json');
let tp = 0, fp = 0, fn = 0, caseOk = 0;
const misses = [];
for (const c of cases) {
  const r = ruleCheck(c.text, decisions);
  const pred = new Set(r.findings.map((f) => f.decisionId.split(':')[0]));
  for (const a of c.acceptable || []) pred.delete(a);
  const exp = new Set(c.problems);
  const t = [...exp].filter((x) => pred.has(x)).length;
  tp += t; fp += pred.size - t; fn += exp.size - t;
  if ((exp.size > 0) === (pred.size > 0)) caseOk++;
  if (t !== exp.size || pred.size !== t) misses.push({ id: c.id, expected: [...exp], got: [...pred], quotes: r.findings.map((f) => `${f.decisionId}: ${f.workQuote}`) });
}
const P = tp / (tp + fp || 1), R = tp / (tp + fn || 1);
const summary = { precision: +P.toFixed(3), recall: +R.toFixed(3), f1: +((2 * P * R) / (P + R || 1)).toFixed(3), case_accuracy: +(caseOk / cases.length).toFixed(3), tp, fp, fn, cases: cases.length, pages: pages.length, pages_with_a_parsed_decision: parsedPages.size };
console.log(JSON.stringify(summary));
for (const m of misses) console.log('  MISS', m.id, 'expected', m.expected, 'got', m.got, verbose ? m.quotes : '');
