"""Evaluate Precedent's conflict check against labelled cases.

Usage: python3 eval/run.py [model ...] [--tag name] [--repeat N]
Calls the dev-only web trigger (URL + token in ~/.config/precedent/) so the
real Forge code path (prompt, model, quote verification) is what gets measured.
"""
import json, os, sys, time, statistics, urllib.request, urllib.error
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
URL = open(os.path.expanduser('~/.config/precedent/eval_url')).read().strip()
TOKEN = open(os.path.expanduser('~/.config/precedent/eval_token')).read().strip()

decisions = json.load(open(f'{HERE}/real_decisions.json')) + json.load(open(f'{HERE}/extra_decisions.json'))
cases = json.load(open(f'{HERE}/cases.json'))
REPEAT = 1
WORKERS = int(os.environ.get('WORKERS', '3'))


def call(body, tries=5):
    data = json.dumps({**body, 'token': TOKEN}).encode()
    for i in range(tries):
        try:
            req = urllib.request.Request(URL, data=data, headers={'Content-Type': 'application/json'})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:  # server returned an error body: keep it
            err = f'{e.code}: {e.read().decode()[:300]}'
            time.sleep(4 * (i + 1))
        except Exception as e:  # retry transient errors / timeouts
            err = e
            time.sleep(4 * (i + 1))
    return {'error': str(err)}


def run_case(model, case):
    out = call({'op': 'check', 'model': model, 'text': case['text'], 'decisions': decisions})
    if 'result' not in out:
        return {'id': case['id'], 'error': out.get('error'), 'expected': case['problems'], 'predicted': []}
    if out['result'].get('verdict') == 'unavailable':
        return {'id': case['id'], 'moderated': True, 'expected': case['problems'], 'acceptable': case.get('acceptable', []), 'predicted': [], 'ms': out.get('ms')}
    findings = out['result']['findings']
    predicted = sorted({f['decisionId'] for f in findings if f['relation'] in ('conflicts', 'revisits')})
    return {
        'id': case['id'],
        'expected': sorted(case['problems']),
        'acceptable': case.get('acceptable', []),
        'predicted': predicted,
        'findings': findings,
        'ms': out.get('ms'),
        'usage': out.get('usage'),
    }


def score(rows):
    moderated = sum(1 for r in rows if r.get('moderated'))
    rows = [r for r in rows if not r.get('moderated')]
    tp = fp = fn = 0
    case_ok = 0
    for r in rows:
        e, p = set(r['expected']), set(r['predicted']) - set(r.get('acceptable', []))
        tp += len(e & p); fp += len(p - e); fn += len(e - p)
        case_ok += (bool(e) == bool(p))
    prec = tp / (tp + fp) if tp + fp else 1.0
    rec = tp / (tp + fn) if tp + fn else 1.0
    f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
    ms = [r['ms'] for r in rows if r.get('ms')]
    tin = sum((r.get('usage') or {}).get('input_tokens', 0) for r in rows)
    tout = sum((r.get('usage') or {}).get('output_tokens', 0) for r in rows)
    return {
        'precision': round(prec, 3), 'recall': round(rec, 3), 'f1': round(f1, 3),
        'case_accuracy': round(case_ok / len(rows), 3), 'tp': tp, 'fp': fp, 'fn': fn,
        'moderated': moderated,
        'errors': sum(1 for r in rows if r.get('error')),
        'p50_ms': int(statistics.median(ms)) if ms else None,
        'max_ms': max(ms) if ms else None,
        'input_tokens': tin, 'output_tokens': tout,
    }


def main():
    args = sys.argv[1:]
    global REPEAT
    tag = 'run'
    if '--repeat' in args:
        i = args.index('--repeat'); REPEAT = int(args[i + 1]); del args[i:i + 2]
    if '--tag' in args:
        i = args.index('--tag'); tag = args[i + 1]; del args[i:i + 2]
    models = args or ['claude-haiku-5-5']
    os.makedirs(f'{HERE}/results', exist_ok=True)
    summary = {}
    for model in models:
        with ThreadPoolExecutor(max_workers=WORKERS) as ex:
            rows = list(ex.map(lambda c: run_case(model, c), cases * REPEAT))
        s = score(rows)
        summary[model] = s
        json.dump({'model': model, 'score': s, 'rows': rows}, open(f'{HERE}/results/{tag}_{model}.json', 'w'), indent=1, ensure_ascii=False)
        print(model, json.dumps(s))
        for r in rows:
            if set(r['expected']) != set(r['predicted']) - set(r.get('acceptable', [])) or r.get('error'):
                print('   MISS', r['id'], 'expected', r['expected'], 'got', r['predicted'], r.get('error') or '')
    json.dump(summary, open(f'{HERE}/results/{tag}_summary.json', 'w'), indent=1)


if __name__ == '__main__':
    main()
