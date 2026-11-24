"""Evaluate decision extraction on labelled pages (count, status, key facts, rejected options, scope)."""
import json, os, sys
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from run import call, HERE  # reuse the web trigger client

cases = json.load(open(f'{HERE}/extract_cases.json'))


def has_any(text, alternatives):
    t = text.lower()
    return any(a.lower() in t for a in alternatives)


def grade(case, decisions):
    e = case['expect']
    n = len(decisions)
    problems = []
    lo = e.get('countMin', e.get('count', 0)); hi = e.get('countMax', e.get('count', 99))
    if not (lo <= n <= hi):
        problems.append(f'count {n} not in [{lo},{hi}]')
    blob = json.dumps(decisions, ensure_ascii=False)
    for alts in e.get('must', []):
        if not has_any(blob, alts):
            problems.append(f'missing {alts}')
    for alts in e.get('rejected', []):
        rej = ' '.join(' '.join(d.get('alternativesRejected', [])) for d in decisions)
        if not has_any(rej, alts):
            problems.append(f'rejected missing {alts}')
    if 'status' in e and not any(d.get('status') == e['status'] for d in decisions):
        problems.append(f'status != {e["status"]}: {[d.get("status") for d in decisions]}')
    for word in e.get('exceptionsMust', []):
        if not any(word in (d.get('exceptions') or '').lower() for d in decisions):
            problems.append(f'exceptions missing "{word}"')
    return problems


def run(model):
    def one(c):
        out = call({'op': 'extract', 'model': model, 'title': c['title'], 'text': c['text']})
        if 'result' not in out:
            return c['id'], None, [f"error {out.get('error')}"]
        ds = out['result']['verified']
        return c['id'], out['result'], grade(c, ds)
    with ThreadPoolExecutor(max_workers=3) as ex:
        rows = list(ex.map(one, cases * 2))
    ok = sum(1 for _, _, p in rows if not p)
    print(model, f'{ok}/{len(rows)} pages fully correct')
    for cid, res, p in rows:
        if p:
            print('   ', cid, p, '| dropped:', (res or {}).get('droppedCount'))
    os.makedirs(f'{HERE}/results', exist_ok=True)
    json.dump(rows, open(f'{HERE}/results/extract_{model}.json', 'w'), indent=1, ensure_ascii=False)
    return ok / len(rows)


if __name__ == '__main__':
    for m in sys.argv[1:] or ['claude-haiku-5-5']:
        run(m)
